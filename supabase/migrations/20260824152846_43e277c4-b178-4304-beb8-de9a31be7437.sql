-- ============================================================
-- FASE A — Acesso controlado do papel `expedicao` ao Chat ao Vivo
-- Nada é liberado retroativamente. Nenhuma policy existente é alterada.
-- ============================================================

-- 1) Allowlist fechada de motivos (financeiro + rastreio/expedição)
CREATE OR REPLACE FUNCTION public.is_expedicao_handoff_reason(_reason text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(coalesce(_reason,'')) IN (
    -- financeiro
    'payment_unidentified','payment_pending','payment_declined','charge_issue',
    'duplicate_charge','boleto_issue','pix_issue','card_issue','payment_receipt',
    'invoice_request','refund_request','order_financial_question',
    -- rastreio / expedição
    'tracking_not_received','tracking_code_invalid','tracking_no_update',
    'tracking_help','carrier_question','shipped_no_info','where_is_my_order',
    'tracking_link_issue'
  )
$$;

-- 2) Tabela de concessões
CREATE TABLE public.conversation_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  team_member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  reason text NOT NULL,
  origin text NOT NULL DEFAULT 'nina',
  trigger_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  trigger_snippet text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  revoked_at timestamp with time zone,
  revoked_by uuid,
  revoke_reason text,
  CONSTRAINT conversation_access_grants_origin_chk CHECK (origin IN ('nina','manual'))
);

GRANT SELECT ON public.conversation_access_grants TO authenticated;
GRANT ALL ON public.conversation_access_grants TO service_role;

ALTER TABLE public.conversation_access_grants ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX conversation_access_grants_one_active
  ON public.conversation_access_grants (conversation_id) WHERE is_active;
CREATE INDEX conversation_access_grants_member_active
  ON public.conversation_access_grants (team_member_id) WHERE is_active;

CREATE TRIGGER conversation_access_grants_updated_at
  BEFORE UPDATE ON public.conversation_access_grants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- motivo sempre validado contra a allowlist
CREATE OR REPLACE FUNCTION public.validate_access_grant_reason()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_expedicao_handoff_reason(NEW.reason) THEN
    RAISE EXCEPTION 'reason not allowed for expedicao access grant: %', NEW.reason;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER conversation_access_grants_validate_reason
  BEFORE INSERT OR UPDATE OF reason ON public.conversation_access_grants
  FOR EACH ROW EXECUTE FUNCTION public.validate_access_grant_reason();

-- 3) Helpers
CREATE OR REPLACE FUNCTION public.current_team_member_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tm.id
  FROM public.team_members tm
  WHERE tm.user_id = auth.uid() AND tm.status = 'active'
  ORDER BY tm.created_at ASC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.expedicao_can_access_conversation(_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'expedicao')
     AND EXISTS (
       SELECT 1
       FROM public.conversation_access_grants g
       JOIN public.conversations c ON c.id = g.conversation_id
       WHERE g.conversation_id = _conversation_id
         AND g.is_active
         AND g.team_member_id = public.current_team_member_id()
         AND c.assigned_user_id = g.team_member_id
         AND public.is_expedicao_handoff_reason(g.reason)
     )
$$;

-- 4) Policies aditivas (somente LEITURA para expedicao)
CREATE POLICY conversations_select_expedicao_granted
  ON public.conversations FOR SELECT TO authenticated
  USING (public.expedicao_can_access_conversation(id));

CREATE POLICY messages_select_expedicao_granted
  ON public.messages FOR SELECT TO authenticated
  USING (public.expedicao_can_access_conversation(conversation_id));

CREATE POLICY grants_select_staff_or_own
  ON public.conversation_access_grants FOR SELECT TO authenticated
  USING (
    public.is_operational_staff(auth.uid())
    OR team_member_id = public.current_team_member_id()
  );

-- 5) Auditoria: fecha a leitura/escrita hoje aberta a qualquer autenticado
DROP POLICY IF EXISTS "Authenticated can view handoff events" ON public.conversation_handoff_events;
DROP POLICY IF EXISTS "Authenticated can insert handoff events" ON public.conversation_handoff_events;

CREATE POLICY handoff_events_select_staff_or_granted
  ON public.conversation_handoff_events FOR SELECT TO authenticated
  USING (
    public.is_operational_staff(auth.uid())
    OR public.expedicao_can_access_conversation(conversation_id)
  );

CREATE POLICY handoff_events_insert_staff
  ON public.conversation_handoff_events FOR INSERT TO authenticated
  WITH CHECK (public.is_operational_staff(auth.uid()));

-- 6) Revogação atômica quando o estado da conversa muda
CREATE OR REPLACE FUNCTION public.revoke_grants_on_conversation_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text;
BEGIN
  IF NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id THEN
    v_reason := 'reassigned';
  ELSIF NEW.attendance_finished AND NOT OLD.attendance_finished THEN
    v_reason := 'attendance_finished';
  ELSIF OLD.human_takeover_required AND NOT NEW.human_takeover_required THEN
    v_reason := 'human_takeover_cleared';
  ELSIF OLD.ai_paused AND NOT NEW.ai_paused THEN
    v_reason := 'nina_resumed';
  END IF;

  IF v_reason IS NOT NULL THEN
    UPDATE public.conversation_access_grants
       SET is_active = false,
           revoked_at = now(),
           revoked_by = auth.uid(),
           revoke_reason = v_reason
     WHERE conversation_id = NEW.id AND is_active;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_revoke_grants_on_conversation_change
  AFTER UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.revoke_grants_on_conversation_change();

-- 7) Leitura restrita (RPCs) — sem qualquer id vindo do navegador
CREATE OR REPLACE FUNCTION public.list_my_expedicao_conversations()
RETURNS TABLE (
  conversation_id uuid,
  contact_name text,
  contact_phone_masked text,
  reason text,
  granted_at timestamp with time zone,
  last_message_at timestamp with time zone,
  human_status text,
  attendance_finished boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id,
         coalesce(ct.call_name, ct.name, 'Cliente'),
         CASE WHEN ct.phone_number IS NULL THEN NULL
              ELSE regexp_replace(ct.phone_number, '^(.{0,4}).*(.{4})$', '\1****\2')
         END,
         g.reason,
         g.created_at,
         c.last_message_at,
         c.human_status,
         c.attendance_finished
  FROM public.conversation_access_grants g
  JOIN public.conversations c ON c.id = g.conversation_id
  LEFT JOIN public.contacts ct ON ct.id = c.contact_id
  WHERE g.is_active
    AND g.team_member_id = public.current_team_member_id()
    AND c.assigned_user_id = g.team_member_id
    AND public.has_role(auth.uid(), 'expedicao')
    AND public.is_expedicao_handoff_reason(g.reason)
  ORDER BY c.last_message_at DESC
$$;

CREATE OR REPLACE FUNCTION public.get_my_expedicao_messages(_conversation_id uuid)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  content text,
  type message_type,
  from_type message_from,
  media_url text,
  media_type text,
  status message_status,
  sent_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.conversation_id, m.content, m.type, m.from_type,
         m.media_url, m.media_type, m.status, m.sent_at
  FROM public.messages m
  WHERE m.conversation_id = _conversation_id
    AND public.expedicao_can_access_conversation(_conversation_id)
  ORDER BY m.sent_at ASC
$$;

-- 8) Escrita restrita (RPCs) — validam sessão, papel, responsável e concessão
CREATE OR REPLACE FUNCTION public.expedicao_reply(_conversation_id uuid, _content text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id uuid;
  v_message_id uuid;
  v_text text := btrim(coalesce(_content,''));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF v_text = '' THEN RAISE EXCEPTION 'empty message'; END IF;
  IF length(v_text) > 4000 THEN RAISE EXCEPTION 'message too long'; END IF;
  IF NOT public.expedicao_can_access_conversation(_conversation_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT c.contact_id INTO v_contact_id
  FROM public.conversations c WHERE c.id = _conversation_id FOR UPDATE;

  INSERT INTO public.messages (conversation_id, content, type, from_type, status, sent_at)
  VALUES (_conversation_id, v_text, 'text', 'human', 'processing', now())
  RETURNING id INTO v_message_id;

  INSERT INTO public.send_queue
    (conversation_id, contact_id, content, from_type, message_type, priority, message_id, metadata)
  VALUES
    (_conversation_id, v_contact_id, v_text, 'human', 'text', 2, v_message_id,
     jsonb_build_object('source','expedicao_chat'));

  INSERT INTO public.conversation_handoff_events
    (conversation_id, event_type, actor_user_id, handoff_reason, metadata)
  VALUES (_conversation_id, 'expedicao_reply', auth.uid(), NULL,
          jsonb_build_object('message_id', v_message_id));

  RETURN v_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.expedicao_finish_conversation(_conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.expedicao_can_access_conversation(_conversation_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.conversations
     SET attendance_finished = true,
         attendance_finished_at = now(),
         attendance_finished_by = auth.uid(),
         human_status = 'finalizado',
         updated_at = now()
   WHERE id = _conversation_id;

  INSERT INTO public.conversation_handoff_events
    (conversation_id, event_type, actor_user_id, handoff_reason, metadata)
  VALUES (_conversation_id, 'attendance_finished', auth.uid(), 'finalizado_por_expedicao',
          jsonb_build_object('source','expedicao_chat'));

  RETURN true;
END;
$$;

-- 9) Criação de concessão: backend (service_role) e atribuição manual admin/manager
CREATE OR REPLACE FUNCTION public.internal_grant_expedicao_access(
  _conversation_id uuid,
  _team_member_id uuid,
  _reason text,
  _origin text DEFAULT 'nina',
  _trigger_message_id uuid DEFAULT NULL,
  _trigger_snippet text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grant_id uuid;
BEGIN
  IF NOT public.is_expedicao_handoff_reason(_reason) THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'reason_not_allowed');
  END IF;

  PERFORM 1 FROM public.conversations WHERE id = _conversation_id FOR UPDATE;

  UPDATE public.conversation_access_grants
     SET is_active = false, revoked_at = now(), revoke_reason = 'superseded'
   WHERE conversation_id = _conversation_id AND is_active
     AND team_member_id IS DISTINCT FROM _team_member_id;

  IF EXISTS (
    SELECT 1 FROM public.conversation_access_grants
     WHERE conversation_id = _conversation_id AND is_active AND team_member_id = _team_member_id
  ) THEN
    RETURN jsonb_build_object('granted', true, 'already_active', true);
  END IF;

  INSERT INTO public.conversation_access_grants
    (conversation_id, team_member_id, reason, origin, trigger_message_id, trigger_snippet, created_by)
  VALUES (_conversation_id, _team_member_id, lower(_reason), _origin, _trigger_message_id,
          left(coalesce(_trigger_snippet,''), 500), auth.uid())
  RETURNING id INTO v_grant_id;

  RETURN jsonb_build_object('granted', true, 'grant_id', v_grant_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_conversation_to_expedicao(
  _conversation_id uuid,
  _team_member_id uuid,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res jsonb;
BEGIN
  IF NOT public.is_admin_or_manager(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT public.is_expedicao_handoff_reason(_reason) THEN
    RAISE EXCEPTION 'reason not allowed';
  END IF;

  UPDATE public.conversations
     SET assigned_user_id = _team_member_id,
         assigned_at = now(),
         ai_paused = true,
         human_takeover_required = true,
         handoff_type = 'financeiro',
         handoff_reason = lower(_reason),
         handoff_created_at = now(),
         human_status = 'aguardando_humano',
         status = 'paused',
         attendance_finished = false,
         attendance_finished_at = NULL,
         attendance_finished_by = NULL
   WHERE id = _conversation_id;

  v_res := public.internal_grant_expedicao_access(
    _conversation_id, _team_member_id, _reason, 'manual', NULL, NULL);

  INSERT INTO public.conversation_handoff_events
    (conversation_id, event_type, actor_user_id, handoff_reason, metadata)
  VALUES (_conversation_id, 'handoff_expedicao_manual', auth.uid(), lower(_reason),
          jsonb_build_object('team_member_id', _team_member_id, 'grant', v_res));

  RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_expedicao_access(_conversation_id uuid, _reason text DEFAULT 'manual_revoke')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_manager(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.conversation_access_grants
     SET is_active = false, revoked_at = now(), revoked_by = auth.uid(), revoke_reason = _reason
   WHERE conversation_id = _conversation_id AND is_active;
  RETURN true;
END;
$$;

-- 10) EXECUTE: nada para PUBLIC/anon
REVOKE ALL ON FUNCTION public.current_team_member_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expedicao_can_access_conversation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_my_expedicao_conversations() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_expedicao_messages(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expedicao_reply(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expedicao_finish_conversation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.internal_grant_expedicao_access(uuid, uuid, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_conversation_to_expedicao(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_expedicao_access(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_expedicao_handoff_reason(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_team_member_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.expedicao_can_access_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_expedicao_handoff_reason(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_expedicao_conversations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_expedicao_messages(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expedicao_reply(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expedicao_finish_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_conversation_to_expedicao(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_expedicao_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.internal_grant_expedicao_access(uuid, uuid, text, text, uuid, text) TO service_role;