
-- 1) Motivos de dermoconsultora (espelho dos motivos canônicos)
CREATE OR REPLACE FUNCTION public.is_dermo_handoff_reason(_reason text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT lower(coalesce(_reason,'')) IN (
    'technical_question','sensitive_case','contraindication','reaction','allergy',
    'pregnancy_breastfeeding','sensitized_or_injured_skin',
    'medication_or_dermatological_treatment','recent_procedure','protocol_adaptation',
    'protocol_product_substitution','missing_technical_information',
    'product_link_not_found_after_search'
  )
$$;

-- 2) Subconjunto SENSÍVEL → prioridade exclusiva da Laura
CREATE OR REPLACE FUNCTION public.is_sensitive_dermo_reason(_reason text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT lower(coalesce(_reason,'')) IN (
    'sensitive_case','pregnancy_breastfeeding','allergy','reaction',
    'sensitized_or_injured_skin','contraindication',
    'medication_or_dermatological_treatment','recent_procedure'
  )
$$;

-- 3) Balanceamento determinístico: menor nº de atendimentos ATIVOS,
--    desempate pelo assigned_at mais antigo, depois id. Inclui as cinco.
CREATE OR REPLACE FUNCTION public.pick_next_dermoconsultora()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tm.id
  FROM public.team_members tm
  JOIN public.team_functions tf ON tf.id = tm.function_id
  WHERE tm.status = 'active'
    AND tf.is_active IS DISTINCT FROM false
    AND tf.name ILIKE '%dermoconsultor%'
  ORDER BY (
    SELECT count(*) FROM public.conversations c
    WHERE c.assigned_user_id = tm.id
      AND c.human_takeover_required = true
      AND c.attendance_finished = false
  ) ASC,
  (SELECT min(c2.assigned_at) FROM public.conversations c2 WHERE c2.assigned_user_id = tm.id) ASC NULLS FIRST,
  tm.id ASC
  LIMIT 1
$$;

-- 4) Resolução do responsável dermo: sensível → Laura direto (fora do
--    balanceamento); Laura inativa → fallback ao balanceamento, sinalizado
--    para registro em log pelo chamador.
CREATE OR REPLACE FUNCTION public.pick_dermo_assignee(_reason text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_laura uuid;
BEGIN
  IF public.is_sensitive_dermo_reason(_reason) THEN
    SELECT tm.id INTO v_laura
    FROM public.team_members tm
    WHERE lower(tm.email) = 'lakma.vendas5@gmail.com' AND tm.status = 'active'
    ORDER BY tm.created_at ASC LIMIT 1;
    IF v_laura IS NOT NULL THEN
      RETURN jsonb_build_object('team_member_id', v_laura, 'mode', 'sensitive_direct', 'fallback', false);
    END IF;
    RETURN jsonb_build_object('team_member_id', public.pick_next_dermoconsultora(),
                              'mode', 'sensitive_fallback', 'fallback', true,
                              'fallback_cause', 'senior_unavailable');
  END IF;
  RETURN jsonb_build_object('team_member_id', public.pick_next_dermoconsultora(),
                            'mode', 'balanced', 'fallback', false);
END;
$$;

-- 5) Concessão de acesso dermo (modelo da expedição)
CREATE OR REPLACE FUNCTION public.internal_grant_dermo_access(
  _conversation_id uuid, _team_member_id uuid, _reason text,
  _origin text DEFAULT 'nina', _trigger_message_id uuid DEFAULT NULL, _trigger_snippet text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_grant_id uuid;
BEGIN
  IF NOT public.is_dermo_handoff_reason(_reason) THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'reason_not_allowed');
  END IF;
  PERFORM 1 FROM public.conversations WHERE id = _conversation_id FOR UPDATE;
  UPDATE public.conversation_access_grants
     SET is_active = false, revoked_at = now(), revoke_reason = 'superseded'
   WHERE conversation_id = _conversation_id AND is_active
     AND team_member_id IS DISTINCT FROM _team_member_id;
  IF EXISTS (SELECT 1 FROM public.conversation_access_grants
             WHERE conversation_id = _conversation_id AND is_active AND team_member_id = _team_member_id) THEN
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

-- 6) Libera o gatilho de validação para motivos dermo
CREATE OR REPLACE FUNCTION public.validate_access_grant_reason()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public.is_expedicao_handoff_reason(NEW.reason)
     AND NOT public.is_dermo_handoff_reason(NEW.reason) THEN
    RAISE EXCEPTION 'reason not allowed for access grant: %', NEW.reason;
  END IF;
  RETURN NEW;
END;
$$;

-- 7) Checagem de acesso da dermoconsultora
CREATE OR REPLACE FUNCTION public.dermo_can_access_conversation(_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'dermo')
     AND EXISTS (
       SELECT 1
       FROM public.conversation_access_grants g
       JOIN public.conversations c ON c.id = g.conversation_id
       WHERE g.conversation_id = _conversation_id
         AND g.is_active
         AND g.team_member_id = public.current_team_member_id()
         AND c.assigned_user_id = g.team_member_id
         AND public.is_dermo_handoff_reason(g.reason)
     )
$$;

-- 8) RPCs do chat restrito da dermoconsultora
CREATE OR REPLACE FUNCTION public.list_my_dermo_conversations()
RETURNS TABLE(conversation_id uuid, contact_name text, contact_phone_masked text, reason text,
              granted_at timestamptz, last_message_at timestamptz, human_status text,
              attendance_finished boolean, handoff_at timestamptz, trigger_message_id uuid,
              trigger_snippet text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id,
         coalesce(ct.call_name, ct.name, 'Cliente'),
         CASE WHEN ct.phone_number IS NULL THEN NULL
              ELSE regexp_replace(ct.phone_number, '^(.{0,4}).*(.{4})$', '\1****\2') END,
         g.reason, g.created_at, c.last_message_at, c.human_status, c.attendance_finished,
         coalesce(c.handoff_created_at, g.created_at), g.trigger_message_id, g.trigger_snippet
  FROM public.conversation_access_grants g
  JOIN public.conversations c ON c.id = g.conversation_id
  LEFT JOIN public.contacts ct ON ct.id = c.contact_id
  WHERE g.is_active
    AND g.team_member_id = public.current_team_member_id()
    AND c.assigned_user_id = g.team_member_id
    AND public.has_role(auth.uid(), 'dermo')
    AND public.is_dermo_handoff_reason(g.reason)
  ORDER BY c.last_message_at DESC
$$;

CREATE OR REPLACE FUNCTION public.get_my_dermo_messages(_conversation_id uuid)
RETURNS TABLE(id uuid, conversation_id uuid, content text, type message_type, from_type message_from,
              media_url text, media_type text, status message_status, sent_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.conversation_id, m.content, m.type, m.from_type,
         m.media_url, m.media_type, m.status, m.sent_at
  FROM public.messages m
  WHERE m.conversation_id = _conversation_id
    AND public.dermo_can_access_conversation(_conversation_id)
  ORDER BY m.sent_at ASC
$$;

CREATE OR REPLACE FUNCTION public.dermo_reply(_conversation_id uuid, _content text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_contact_id uuid; v_message_id uuid; v_text text := btrim(coalesce(_content,''));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF v_text = '' THEN RAISE EXCEPTION 'empty message'; END IF;
  IF length(v_text) > 4000 THEN RAISE EXCEPTION 'message too long'; END IF;
  IF NOT public.dermo_can_access_conversation(_conversation_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT c.contact_id INTO v_contact_id FROM public.conversations c WHERE c.id = _conversation_id FOR UPDATE;
  INSERT INTO public.messages (conversation_id, content, type, from_type, status, sent_at)
  VALUES (_conversation_id, v_text, 'text', 'human', 'processing', now())
  RETURNING id INTO v_message_id;
  INSERT INTO public.send_queue (conversation_id, contact_id, content, from_type, message_type, priority, message_id, metadata)
  VALUES (_conversation_id, v_contact_id, v_text, 'human', 'text', 2, v_message_id,
          jsonb_build_object('source','dermo_chat'));
  INSERT INTO public.conversation_handoff_events (conversation_id, event_type, actor_user_id, handoff_reason, metadata)
  VALUES (_conversation_id, 'dermo_reply', auth.uid(), NULL, jsonb_build_object('message_id', v_message_id));
  RETURN v_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.dermo_finish_conversation(_conversation_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.dermo_can_access_conversation(_conversation_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.conversations
     SET attendance_finished = true, attendance_finished_at = now(),
         attendance_finished_by = auth.uid(), human_status = 'finalizado', updated_at = now()
   WHERE id = _conversation_id;
  INSERT INTO public.conversation_handoff_events (conversation_id, event_type, actor_user_id, handoff_reason, metadata)
  VALUES (_conversation_id, 'attendance_finished', auth.uid(), 'finalizado_por_dermoconsultora',
          jsonb_build_object('source','dermo_chat'));
  RETURN true;
END;
$$;

-- 9) Leitura restrita via RLS para o papel dermo (defesa em profundidade)
CREATE POLICY "conversations_select_dermo" ON public.conversations
  FOR SELECT TO authenticated
  USING (public.dermo_can_access_conversation(id));

CREATE POLICY "messages_select_dermo" ON public.messages
  FOR SELECT TO authenticated
  USING (public.dermo_can_access_conversation(conversation_id));

CREATE POLICY "contacts_select_dermo" ON public.contacts
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'dermo') AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.contact_id = contacts.id AND public.dermo_can_access_conversation(c.id)
    )
  );

-- 10) Grants de execução (mesmo padrão das RPCs da expedição)
GRANT EXECUTE ON FUNCTION public.list_my_dermo_conversations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_dermo_messages(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dermo_reply(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dermo_finish_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dermo_can_access_conversation(uuid) TO authenticated;
