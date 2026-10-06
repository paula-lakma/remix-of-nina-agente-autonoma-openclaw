CREATE OR REPLACE FUNCTION public.resume_safe_name(_call_name text, _name text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE
  re constant text := '^[A-Za-zÀ-ÖØ-öø-ÿ]+([ ''-][A-Za-zÀ-ÖØ-öø-ÿ]+)*$';
  c text := btrim(regexp_replace(coalesce(_call_name,''), '\s+', ' ', 'g'));
  f text := split_part(btrim(regexp_replace(coalesce(_name,''), '\s+', ' ', 'g')), ' ', 1);
BEGIN
  IF char_length(c) BETWEEN 2 AND 30 AND c ~ re THEN RETURN c; END IF;
  IF char_length(f) BETWEEN 2 AND 30 AND f ~ re THEN RETURN f; END IF;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.expedicao_resume_template_status(_conversation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  conv record; w record; tpl_ok boolean; nm text; recent boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('available', false, 'reason', 'unauthorized'); END IF;
  IF NOT public.expedicao_can_access_conversation(_conversation_id) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'forbidden');
  END IF;
  SELECT c.id, c.attendance_finished, ct.call_name, ct.name INTO conv
    FROM public.conversations c JOIN public.contacts ct ON ct.id = c.contact_id
   WHERE c.id = _conversation_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('available', false, 'reason', 'forbidden'); END IF;
  IF COALESCE(conv.attendance_finished, false) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'resume_conversation_finished');
  END IF;
  SELECT * INTO w FROM public.whatsapp_freeform_window(_conversation_id, clock_timestamp());
  IF COALESCE(w.is_window_open, false) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'resume_window_open');
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.meta_templates
     WHERE name = 'retomada_atendimento_lakma' AND language = 'pt_BR' AND status = 'APPROVED') INTO tpl_ok;
  IF NOT tpl_ok THEN RETURN jsonb_build_object('available', false, 'reason', 'resume_template_not_approved'); END IF;
  nm := public.resume_safe_name(conv.call_name, conv.name);
  IF nm IS NULL THEN RETURN jsonb_build_object('available', false, 'reason', 'resume_invalid_name'); END IF;
  SELECT EXISTS (SELECT 1 FROM public.messages m
     WHERE m.conversation_id = _conversation_id
       AND m.metadata->>'template_name' = 'retomada_atendimento_lakma'
       AND m.created_at > clock_timestamp() - interval '10 minutes'
       AND m.status <> 'failed') INTO recent;
  IF recent THEN RETURN jsonb_build_object('available', false, 'reason', 'resume_recent_duplicate', 'name', nm); END IF;
  RETURN jsonb_build_object('available', true, 'reason', null, 'name', nm);
END; $$;

CREATE OR REPLACE FUNCTION public.expedicao_send_resume_template(_conversation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_contact uuid; st jsonb; nm text; body text; meta jsonb; v_msg uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.expedicao_can_access_conversation(_conversation_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  -- trava a conversa: serializa cliques concorrentes (idempotência)
  SELECT c.contact_id INTO v_contact FROM public.conversations c WHERE c.id = _conversation_id FOR UPDATE;
  st := public.expedicao_resume_template_status(_conversation_id);
  IF NOT COALESCE((st->>'available')::boolean, false) THEN
    RAISE EXCEPTION '%', COALESCE(st->>'reason', 'forbidden');
  END IF;
  nm := st->>'name';
  body := 'Olá, ' || nm || '! Aqui é a equipe da Lakma Dermocosméticos. Estamos retornando o seu atendimento. Quando puder, responda esta mensagem para continuarmos por aqui.';
  meta := jsonb_build_object(
    'template_name', 'retomada_atendimento_lakma',
    'template_language', 'pt_BR',
    'template_variables', jsonb_build_object('body', jsonb_build_array(nm)),
    'source', 'expedicao_resume',
    'sent_by_user_id', auth.uid(),
    'team_member_id', public.current_team_member_id());

  INSERT INTO public.messages (conversation_id, content, type, from_type, status, sent_at, metadata)
  VALUES (_conversation_id, body, 'text', 'human', 'processing', now(), meta)
  RETURNING id INTO v_msg;

  INSERT INTO public.send_queue (conversation_id, contact_id, content, from_type, message_type, priority, message_id, metadata)
  VALUES (_conversation_id, v_contact, body, 'human', 'template', 2, v_msg, meta);

  INSERT INTO public.conversation_handoff_events (conversation_id, event_type, actor_user_id, handoff_reason, metadata)
  VALUES (_conversation_id, 'expedicao_reply', auth.uid(), NULL,
          jsonb_build_object('message_id', v_msg, 'kind', 'resume_template'));
  RETURN v_msg;
END; $$;

REVOKE ALL ON FUNCTION public.expedicao_resume_template_status(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expedicao_send_resume_template(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expedicao_resume_template_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expedicao_send_resume_template(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resume_safe_name(text, text) TO authenticated, service_role;