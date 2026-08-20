-- ============================================================================
-- FASE 2B1 — SQL PREPARADO (NÃO EXECUTADO / NÃO APLICADO EM PRODUÇÃO)
-- Aplicar somente na Fase 2B2, com autorização expressa.
--
-- Objetivo: coordenar ATOMICAMENTE as duas deduplicações
--   (1) legada: shopify_shipment_notifications UNIQUE (fulfillment_id, tracking_number)
--   (2) nova:   tracking_send_locks UNIQUE (tracking_key)  [compartilhada com o envio manual]
--
-- Atomicidade: todo o corpo roda dentro de um bloco BEGIN ... EXCEPTION, que é
-- uma subtransação. Qualquer RAISE dentro do bloco desfaz TODAS as escritas
-- feitas nele. Logo:
--   * se a trava compartilhada bloquear -> a linha legada não fica em processing;
--   * se a trava legada bloquear        -> a trava compartilhada não fica em processing;
--   * nenhuma linha histórica é alterada quando há bloqueio.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.acquire_shopify_tracking_locks(
  p_tracking_key   text,
  p_fulfillment_id text,
  p_tracking_number text,
  p_order_number   text DEFAULT NULL,
  p_phone_number   text DEFAULT NULL,
  p_customer_name  text DEFAULT NULL,
  p_carrier        text DEFAULT NULL,
  p_template_name  text DEFAULT NULL,
  p_event_id       uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_notification_id uuid;
  v_legacy_retried  boolean := false;
  v_shared          jsonb;
BEGIN
  BEGIN
    ----------------------------------------------------------------
    -- 1) Deduplicação LEGADA (preservada exatamente como hoje)
    ----------------------------------------------------------------
    INSERT INTO public.shopify_shipment_notifications
      (fulfillment_id, tracking_number, order_number, phone_number, event_id, status)
    VALUES
      (p_fulfillment_id, p_tracking_number, p_order_number, p_phone_number, p_event_id, 'processing')
    RETURNING id INTO v_notification_id;

  EXCEPTION WHEN unique_violation THEN
    -- só é possível reivindicar quando o registro existente está 'failed'
    UPDATE public.shopify_shipment_notifications
       SET status = 'processing', event_id = COALESCE(p_event_id, event_id), updated_at = now()
     WHERE fulfillment_id = p_fulfillment_id
       AND tracking_number = p_tracking_number
       AND status = 'failed'
    RETURNING id INTO v_notification_id;

    IF v_notification_id IS NULL THEN
      RETURN jsonb_build_object('acquired', false, 'reason', 'legacy_duplicate');
    END IF;
    v_legacy_retried := true;
  END;

  ----------------------------------------------------------------
  -- 2) Trava COMPARTILHADA (mesma usada pelo envio manual)
  ----------------------------------------------------------------
  BEGIN
    v_shared := public.acquire_tracking_send_lock(
      p_tracking_key   => p_tracking_key,
      p_tracking_number=> p_tracking_number,
      p_source         => 'shopify',
      p_carrier        => p_carrier,
      p_template_name  => p_template_name,
      p_order_number   => p_order_number,
      p_phone_number   => p_phone_number,
      p_customer_name  => p_customer_name,
      p_sent_by        => NULL,
      p_fulfillment_id => p_fulfillment_id
    );

    IF NOT (v_shared->>'acquired')::boolean THEN
      -- compensa o lado legado desta tentativa (não deixa nada em processing)
      RAISE EXCEPTION 'SHARED_BLOCKED';
    END IF;

  EXCEPTION WHEN OTHERS THEN
    IF v_legacy_retried THEN
      UPDATE public.shopify_shipment_notifications
         SET status = 'failed', updated_at = now()
       WHERE id = v_notification_id;
    ELSE
      DELETE FROM public.shopify_shipment_notifications WHERE id = v_notification_id;
    END IF;
    RETURN jsonb_build_object(
      'acquired', false,
      'reason', 'shared_duplicate',
      'existing_status', v_shared->>'existing_status'
    );
  END;

  RETURN jsonb_build_object(
    'acquired', true,
    'tracking_key', p_tracking_key,
    'notification_id', v_notification_id,
    'lock_id', v_shared->>'lock_id',
    'legacy_retried', v_legacy_retried
  );
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_shopify_tracking_locks(text,text,text,text,text,text,text,text,uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_shopify_tracking_locks(text,text,text,text,text,text,text,text,uuid) TO service_role;


-- ============================================================================
-- Liberação / compensação coordenada
--   'queued' -> item aceito pela fila (grava send_queue_id)
--   'sent'   -> aceite real da Meta/WhatsApp
--   'failed' -> falha real; nova tentativa permitida nos DOIS lados
-- ============================================================================
CREATE OR REPLACE FUNCTION public.release_shopify_tracking_locks(
  p_tracking_key    text,
  p_fulfillment_id  text,
  p_tracking_number text,
  p_result          text,
  p_send_queue_id   uuid DEFAULT NULL,
  p_error_message   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_shared jsonb;
BEGIN
  IF p_result NOT IN ('queued','sent','failed') THEN
    RAISE EXCEPTION 'invalid result: %', p_result;
  END IF;

  v_shared := public.release_tracking_send_lock(
    p_tracking_key => p_tracking_key,
    p_result       => p_result,
    p_send_queue_id=> p_send_queue_id,
    p_error_message=> p_error_message
  );

  UPDATE public.shopify_shipment_notifications
     SET status = CASE WHEN p_result = 'failed' THEN 'failed'
                       WHEN p_result = 'sent'   THEN 'sent'
                       ELSE 'processing' END,
         updated_at = now()
   WHERE fulfillment_id = p_fulfillment_id
     AND tracking_number = p_tracking_number;

  RETURN jsonb_build_object('released', true, 'result', p_result, 'shared', v_shared);
END;
$$;

REVOKE ALL ON FUNCTION public.release_shopify_tracking_locks(text,text,text,text,uuid,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_shopify_tracking_locks(text,text,text,text,uuid,text) TO service_role;
