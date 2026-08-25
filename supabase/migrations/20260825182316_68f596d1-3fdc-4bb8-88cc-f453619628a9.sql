CREATE OR REPLACE FUNCTION public.apply_expedicao_handoff(
  _conversation_id uuid,
  _reason text,
  _origin text DEFAULT 'nina'::text,
  _run_id text DEFAULT NULL::text,
  _trigger_message_id uuid DEFAULT NULL::uuid,
  _trigger_snippet text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reason text := lower(btrim(coalesce(_reason, '')));
  v_origin text := CASE WHEN lower(btrim(coalesce(_origin, ''))) = 'manual' THEN 'manual' ELSE 'nina' END;
  v_team_member_id uuid;
  v_grant_id uuid;
  v_now timestamptz := now();
BEGIN
  IF NOT public.is_expedicao_handoff_reason(v_reason) THEN
    RAISE EXCEPTION 'reason_not_allowed';
  END IF;

  PERFORM 1 FROM public.conversations WHERE id = _conversation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'conversation_not_found'; END IF;

  SELECT tm.id INTO v_team_member_id
  FROM public.team_members tm
  JOIN public.user_roles ur ON ur.user_id = tm.user_id AND ur.role = 'expedicao'
  WHERE lower(tm.email) = 'financeiro@lakma.com.br' AND tm.status = 'active'
  ORDER BY tm.created_at ASC LIMIT 1;

  IF v_team_member_id IS NULL THEN RAISE EXCEPTION 'expedicao_assignee_not_found'; END IF;

  UPDATE public.conversations
     SET ai_paused = true,
         human_takeover_required = true,
         requires_dermoconsultant = false,
         outside_dermoconsultant_hours = false,
         handoff_type = 'financeiro',
         handoff_reason = v_reason,
         handoff_created_at = v_now,
         human_status = 'aguardando_humano',
         status = 'paused',
         assigned_user_id = v_team_member_id,
         assigned_at = v_now,
         attendance_finished = false,
         attendance_finished_at = NULL,
         attendance_finished_by = NULL
   WHERE id = _conversation_id;

  UPDATE public.conversation_access_grants
     SET is_active = false, revoked_at = v_now, revoke_reason = 'superseded'
   WHERE conversation_id = _conversation_id AND is_active;

  INSERT INTO public.conversation_access_grants
    (conversation_id, team_member_id, reason, origin, trigger_message_id,
     trigger_snippet, is_active, created_by)
  VALUES
    (_conversation_id, v_team_member_id, v_reason, v_origin, _trigger_message_id,
     left(coalesce(_trigger_snippet, ''), 500), true, auth.uid())
  RETURNING id INTO v_grant_id;

  INSERT INTO public.conversation_handoff_events
    (conversation_id, event_type, actor_user_id, handoff_reason, metadata)
  VALUES
    (_conversation_id, 'handoff_financeiro', auth.uid(), v_reason,
     jsonb_build_object(
       'run_id', _run_id,
       'snippet', left(coalesce(_trigger_snippet, ''), 200),
       'destination', 'financeiro',
       'assigned_team_member_id', v_team_member_id,
       'assigned_email', 'financeiro@lakma.com.br',
       'origin', v_origin,
       'reason_source', lower(btrim(coalesce(_origin, 'nina'))),
       'grant_id', v_grant_id
     ));

  RETURN jsonb_build_object(
    'applied', true,
    'team_member_id', v_team_member_id,
    'grant_id', v_grant_id,
    'reason', v_reason,
    'destination', 'financeiro'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_expedicao_handoff(uuid, text, text, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_expedicao_handoff(uuid, text, text, text, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.apply_expedicao_handoff(uuid, text, text, text, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_expedicao_handoff(uuid, text, text, text, uuid, text) TO service_role;