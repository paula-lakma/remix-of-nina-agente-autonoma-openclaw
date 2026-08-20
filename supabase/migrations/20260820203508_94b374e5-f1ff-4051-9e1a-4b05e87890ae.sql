-- 1) Normalização única (fonte da verdade no banco)
CREATE OR REPLACE FUNCTION public.normalize_tracking_code(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT NULLIF(regexp_replace(upper(btrim(coalesce(p_code, ''))), '[^A-Z0-9]', '', 'g'), '')
$$;

-- 2) Campo de auditoria aditivo
ALTER TABLE public.tracking_send_locks
  ADD COLUMN IF NOT EXISTS previous_tracking_key text;

-- 3) Migração transacional das chaves existentes
UPDATE public.tracking_send_locks
   SET previous_tracking_key = COALESCE(previous_tracking_key, tracking_key),
       tracking_key = public.normalize_tracking_code(tracking_number)
 WHERE public.normalize_tracking_code(tracking_number) IS NOT NULL
   AND tracking_key IS DISTINCT FROM public.normalize_tracking_code(tracking_number);

-- Aborta a transação se sobrar qualquer chave fora do formato canônico
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad FROM public.tracking_send_locks
   WHERE tracking_key IS DISTINCT FROM public.normalize_tracking_code(tracking_number);
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'migracao_abortada: % registros com chave nao canonica', v_bad;
  END IF;
END $$;

ALTER TABLE public.tracking_send_locks
  DROP CONSTRAINT IF EXISTS tracking_send_locks_key_format_check;
ALTER TABLE public.tracking_send_locks
  ADD CONSTRAINT tracking_send_locks_key_format_check CHECK (tracking_key ~ '^[A-Z0-9]+$');

-- 4) RPCs passam a normalizar sozinhas (mesma função compartilhada)
CREATE OR REPLACE FUNCTION public.acquire_tracking_send_lock(p_tracking_key text, p_tracking_number text, p_source text, p_carrier text DEFAULT NULL::text, p_template_name text DEFAULT NULL::text, p_order_number text DEFAULT NULL::text, p_phone_number text DEFAULT NULL::text, p_customer_name text DEFAULT NULL::text, p_sent_by uuid DEFAULT NULL::uuid, p_fulfillment_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lock public.tracking_send_locks;
  v_stale interval := interval '30 minutes';
  v_key text := public.normalize_tracking_code(coalesce(p_tracking_number, p_tracking_key));
BEGIN
  IF v_key IS NULL THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'invalid_tracking_number');
  END IF;

  INSERT INTO public.tracking_send_locks AS t (
    tracking_key, tracking_number, source, status, carrier, template_name,
    order_number, phone_number, customer_name, sent_by, fulfillment_id
  ) VALUES (
    v_key, p_tracking_number, p_source, 'processing', p_carrier, p_template_name,
    p_order_number, p_phone_number, p_customer_name, p_sent_by, p_fulfillment_id
  )
  ON CONFLICT (tracking_key) DO UPDATE
    SET status        = 'processing',
        source        = EXCLUDED.source,
        carrier       = COALESCE(EXCLUDED.carrier, t.carrier),
        template_name = COALESCE(EXCLUDED.template_name, t.template_name),
        order_number  = COALESCE(EXCLUDED.order_number, t.order_number),
        phone_number  = COALESCE(EXCLUDED.phone_number, t.phone_number),
        customer_name = COALESCE(EXCLUDED.customer_name, t.customer_name),
        sent_by       = COALESCE(EXCLUDED.sent_by, t.sent_by),
        fulfillment_id= COALESCE(EXCLUDED.fulfillment_id, t.fulfillment_id),
        attempts      = t.attempts + 1,
        error_message = NULL,
        updated_at    = now()
    WHERE t.status = 'failed'
       OR (t.status = 'processing' AND t.updated_at < now() - v_stale)
  RETURNING * INTO v_lock;

  IF v_lock.id IS NULL THEN
    SELECT * INTO v_lock FROM public.tracking_send_locks WHERE tracking_key = v_key;
    RETURN jsonb_build_object(
      'acquired', false,
      'reason', 'duplicate',
      'existing_status', v_lock.status,
      'lock_id', v_lock.id
    );
  END IF;

  RETURN jsonb_build_object('acquired', true, 'lock_id', v_lock.id, 'tracking_key', v_key, 'attempts', v_lock.attempts);
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_tracking_send_lock(p_tracking_key text, p_result text, p_send_queue_id uuid DEFAULT NULL::uuid, p_error_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lock public.tracking_send_locks;
  v_key text := public.normalize_tracking_code(p_tracking_key);
BEGIN
  IF p_result NOT IN ('queued','sent','failed') THEN
    RAISE EXCEPTION 'invalid result: %', p_result;
  END IF;
  IF v_key IS NULL THEN
    RETURN jsonb_build_object('released', false, 'reason', 'invalid_tracking_key');
  END IF;

  UPDATE public.tracking_send_locks
     SET status        = p_result,
         send_queue_id = COALESCE(p_send_queue_id, send_queue_id),
         error_message = p_error_message,
         sent_at       = CASE WHEN p_result = 'sent' THEN now() ELSE sent_at END,
         updated_at    = now()
   WHERE tracking_key = v_key
   RETURNING * INTO v_lock;

  IF v_lock.id IS NULL THEN
    RETURN jsonb_build_object('released', false, 'reason', 'not_found');
  END IF;

  RETURN jsonb_build_object('released', true, 'status', v_lock.status, 'lock_id', v_lock.id);
END;
$function$;

-- 5) Coordenador Shopify usa a mesma chave canônica
CREATE OR REPLACE FUNCTION public.acquire_shopify_tracking_locks(p_tracking_key text, p_fulfillment_id text, p_tracking_number text, p_order_number text DEFAULT NULL::text, p_phone_number text DEFAULT NULL::text, p_customer_name text DEFAULT NULL::text, p_carrier text DEFAULT NULL::text, p_template_name text DEFAULT NULL::text, p_event_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_notification_id uuid;
  v_legacy_retried  boolean := false;
  v_shared          jsonb;
  v_key text := public.normalize_tracking_code(coalesce(p_tracking_number, p_tracking_key));
BEGIN
  IF v_key IS NULL THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'invalid_tracking_number');
  END IF;

  BEGIN
    INSERT INTO public.shopify_shipment_notifications
      (fulfillment_id, tracking_number, order_number, phone_number, event_id, status)
    VALUES
      (p_fulfillment_id, p_tracking_number, p_order_number, p_phone_number, p_event_id, 'processing')
    RETURNING id INTO v_notification_id;

  EXCEPTION WHEN unique_violation THEN
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

  BEGIN
    v_shared := public.acquire_tracking_send_lock(
      p_tracking_key   => v_key,
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
    'tracking_key', v_key,
    'notification_id', v_notification_id,
    'lock_id', v_shared->>'lock_id',
    'legacy_retried', v_legacy_retried
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_shopify_tracking_locks(p_tracking_key text, p_fulfillment_id text, p_tracking_number text, p_result text, p_send_queue_id uuid DEFAULT NULL::uuid, p_error_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_shared jsonb;
  v_key text := public.normalize_tracking_code(coalesce(p_tracking_number, p_tracking_key));
BEGIN
  IF p_result NOT IN ('queued','sent','failed') THEN
    RAISE EXCEPTION 'invalid result: %', p_result;
  END IF;

  v_shared := public.release_tracking_send_lock(
    p_tracking_key => v_key,
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
$function$;

REVOKE ALL ON FUNCTION public.normalize_tracking_code(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_tracking_code(text) TO service_role;