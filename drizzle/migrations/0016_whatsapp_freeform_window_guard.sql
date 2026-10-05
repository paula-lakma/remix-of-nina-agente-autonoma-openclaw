-- Canonical WhatsApp customer-service window (computed, never stored).
-- Real Meta window: last customer message + 24h. Operational safety for NEW human free text: + 23h55m.
CREATE OR REPLACE FUNCTION public.whatsapp_freeform_window(_conversation_id uuid, _now timestamptz DEFAULT now())
RETURNS TABLE (
  last_customer_message_at timestamptz,
  window_open_until timestamptz,
  freeform_safe_until timestamptz,
  is_window_open boolean,
  is_freeform_safe boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH l AS (
    SELECT max(m.sent_at) AS t
    FROM public.messages m
    WHERE m.conversation_id = _conversation_id AND m.from_type = 'user'
  )
  SELECT
    l.t,
    l.t + interval '24 hours',
    l.t + interval '23 hours 55 minutes',
    COALESCE(_now < l.t + interval '24 hours', false),
    COALESCE(_now < l.t + interval '23 hours 55 minutes', false)
  FROM l
$$;

REVOKE ALL ON FUNCTION public.whatsapp_freeform_window(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_freeform_window(uuid, timestamptz) TO authenticated, service_role;

-- Single guard used by both triggers. Raises whatsapp_window_closed (whole transaction rolls back).
CREATE OR REPLACE FUNCTION public.whatsapp_assert_freeform_safe(_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE w record;
BEGIN
  SELECT * INTO w FROM public.whatsapp_freeform_window(_conversation_id, clock_timestamp());
  IF NOT COALESCE(w.is_freeform_safe, false) THEN
    RAISE EXCEPTION 'whatsapp_window_closed'
      USING ERRCODE = 'P0001',
            DETAIL = jsonb_build_object(
              'last_customer_message_at', w.last_customer_message_at,
              'window_open_until', w.window_open_until,
              'freeform_safe_until', w.freeform_safe_until)::text,
            HINT = 'Janela de 24 horas encerrada. Para retomar o atendimento, é necessário enviar um modelo aprovado.';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.whatsapp_assert_freeform_safe(uuid) FROM PUBLIC, anon, authenticated;

-- messages: only NEW human free-text bubbles created for sending (status processing, no template).
CREATE OR REPLACE FUNCTION public.trg_messages_whatsapp_window_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.from_type = 'human'
     AND NEW.status = 'processing'
     AND COALESCE(NEW.metadata->>'template_name', '') = '' THEN
    PERFORM public.whatsapp_assert_freeform_safe(NEW.conversation_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_messages_whatsapp_window_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_messages_whatsapp_window_guard
BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.trg_messages_whatsapp_window_guard();

-- send_queue: any human non-template item (covers every path writing the queue).
CREATE OR REPLACE FUNCTION public.trg_send_queue_whatsapp_window_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.from_type = 'human'
     AND COALESCE(NEW.message_type, 'text') <> 'template'
     AND COALESCE(NEW.metadata->>'template_name', '') = '' THEN
    PERFORM public.whatsapp_assert_freeform_safe(NEW.conversation_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_send_queue_whatsapp_window_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_send_queue_whatsapp_window_guard
BEFORE INSERT ON public.send_queue
FOR EACH ROW EXECUTE FUNCTION public.trg_send_queue_whatsapp_window_guard();
