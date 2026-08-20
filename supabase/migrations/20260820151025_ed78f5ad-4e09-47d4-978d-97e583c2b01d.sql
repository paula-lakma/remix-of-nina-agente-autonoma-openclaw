-- =========================================
-- Tabela: travas compartilhadas de rastreio
-- =========================================
CREATE TABLE public.tracking_send_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_key text NOT NULL UNIQUE,
  tracking_number text NOT NULL,
  source text NOT NULL DEFAULT 'manual_tracking',
  status text NOT NULL DEFAULT 'processing',
  carrier text,
  template_name text,
  order_number text,
  phone_number text,
  customer_name text,
  sent_by uuid,
  send_queue_id uuid,
  fulfillment_id text,
  attempts integer NOT NULL DEFAULT 1,
  error_message text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tracking_send_locks_status_check
    CHECK (status IN ('processing','queued','sent','failed','duplicate')),
  CONSTRAINT tracking_send_locks_source_check
    CHECK (source IN ('manual_tracking','shopify_webhook'))
);

CREATE INDEX idx_tracking_send_locks_status ON public.tracking_send_locks (status);
CREATE INDEX idx_tracking_send_locks_created_at ON public.tracking_send_locks (created_at DESC);
CREATE INDEX idx_tracking_send_locks_order_number ON public.tracking_send_locks (order_number);

GRANT SELECT ON public.tracking_send_locks TO authenticated;
GRANT ALL ON public.tracking_send_locks TO service_role;
ALTER TABLE public.tracking_send_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view tracking locks"
  ON public.tracking_send_locks FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'expedicao')
  );

CREATE TRIGGER update_tracking_send_locks_updated_at
  BEFORE UPDATE ON public.tracking_send_locks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- Tabela: histórico de envios manuais
-- =========================================
CREATE TABLE public.manual_tracking_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_key text,
  tracking_number text NOT NULL,
  carrier text NOT NULL,
  template_name text,
  order_number text NOT NULL,
  phone_number text NOT NULL,
  customer_name text NOT NULL,
  requested_by uuid,
  requested_by_role text,
  status text NOT NULL DEFAULT 'processing',
  result text,
  error_message text,
  send_queue_id uuid,
  lock_id uuid REFERENCES public.tracking_send_locks(id) ON DELETE SET NULL,
  attempts integer NOT NULL DEFAULT 1,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT manual_tracking_logs_status_check
    CHECK (status IN ('processing','queued','sent','failed','duplicate')),
  CONSTRAINT manual_tracking_logs_carrier_check
    CHECK (carrier IN ('correios','jadlog'))
);

CREATE INDEX idx_manual_tracking_logs_created_at ON public.manual_tracking_logs (created_at DESC);
CREATE INDEX idx_manual_tracking_logs_status ON public.manual_tracking_logs (status);
CREATE INDEX idx_manual_tracking_logs_requested_by ON public.manual_tracking_logs (requested_by);

GRANT SELECT ON public.manual_tracking_logs TO authenticated;
GRANT ALL ON public.manual_tracking_logs TO service_role;
ALTER TABLE public.manual_tracking_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view manual tracking logs"
  ON public.manual_tracking_logs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'expedicao')
  );

CREATE TRIGGER update_manual_tracking_logs_updated_at
  BEFORE UPDATE ON public.manual_tracking_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- RPC: aquisição atômica da trava
-- =========================================
CREATE OR REPLACE FUNCTION public.acquire_tracking_send_lock(
  p_tracking_key text,
  p_tracking_number text,
  p_source text,
  p_carrier text DEFAULT NULL,
  p_template_name text DEFAULT NULL,
  p_order_number text DEFAULT NULL,
  p_phone_number text DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_sent_by uuid DEFAULT NULL,
  p_fulfillment_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock public.tracking_send_locks;
  v_stale interval := interval '30 minutes';
BEGIN
  INSERT INTO public.tracking_send_locks AS t (
    tracking_key, tracking_number, source, status, carrier, template_name,
    order_number, phone_number, customer_name, sent_by, fulfillment_id
  ) VALUES (
    p_tracking_key, p_tracking_number, p_source, 'processing', p_carrier, p_template_name,
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
    SELECT * INTO v_lock FROM public.tracking_send_locks WHERE tracking_key = p_tracking_key;
    RETURN jsonb_build_object(
      'acquired', false,
      'reason', 'duplicate',
      'existing_status', v_lock.status,
      'lock_id', v_lock.id
    );
  END IF;

  RETURN jsonb_build_object('acquired', true, 'lock_id', v_lock.id, 'attempts', v_lock.attempts);
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_tracking_send_lock(text,text,text,text,text,text,text,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_tracking_send_lock(text,text,text,text,text,text,text,text,uuid,text) TO service_role;

-- =========================================
-- RPC: liberação da trava
-- =========================================
CREATE OR REPLACE FUNCTION public.release_tracking_send_lock(
  p_tracking_key text,
  p_result text,
  p_send_queue_id uuid DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock public.tracking_send_locks;
BEGIN
  IF p_result NOT IN ('queued','sent','failed') THEN
    RAISE EXCEPTION 'invalid result: %', p_result;
  END IF;

  UPDATE public.tracking_send_locks
     SET status        = p_result,
         send_queue_id = COALESCE(p_send_queue_id, send_queue_id),
         error_message = p_error_message,
         sent_at       = CASE WHEN p_result = 'sent' THEN now() ELSE sent_at END,
         updated_at    = now()
   WHERE tracking_key = p_tracking_key
   RETURNING * INTO v_lock;

  IF v_lock.id IS NULL THEN
    RETURN jsonb_build_object('released', false, 'reason', 'not_found');
  END IF;

  RETURN jsonb_build_object('released', true, 'status', v_lock.status, 'lock_id', v_lock.id);
END;
$$;

REVOKE ALL ON FUNCTION public.release_tracking_send_lock(text,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_tracking_send_lock(text,text,uuid,text) TO service_role;