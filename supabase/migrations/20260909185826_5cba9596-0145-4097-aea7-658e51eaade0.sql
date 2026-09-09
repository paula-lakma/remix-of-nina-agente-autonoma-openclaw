CREATE OR REPLACE FUNCTION public.admin_assign_expedicao(
  _conversation_id uuid,
  _team_member_id uuid,
  _reason text DEFAULT 'order_financial_question'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text := lower(btrim(coalesce(_reason, 'order_financial_question')));
  v_is_expedicao boolean;
  v_already boolean;
BEGIN
  IF NOT public.is_admin_or_manager(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT public.is_expedicao_handoff_reason(v_reason) THEN
    RAISE EXCEPTION 'reason_not_allowed';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tm
    JOIN public.user_roles ur ON ur.user_id = tm.user_id AND ur.role = 'expedicao'
    WHERE tm.id = _team_member_id AND tm.status = 'active'
  ) INTO v_is_expedicao;

  IF NOT v_is_expedicao THEN
    RAISE EXCEPTION 'team_member_not_expedicao';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.conversations c
    JOIN public.conversation_access_grants g
      ON g.conversation_id = c.id AND g.is_active AND g.team_member_id = _team_member_id
    WHERE c.id = _conversation_id
      AND c.assigned_user_id = _team_member_id
      AND c.handoff_type = 'financeiro'
      AND c.ai_paused
      AND public.is_expedicao_handoff_reason(c.handoff_reason)
      AND public.is_expedicao_handoff_reason(g.reason)
      AND NOT c.attendance_finished
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('applied', false, 'already_assigned', true);
  END IF;

  RETURN public.apply_expedicao_handoff(
    _conversation_id := _conversation_id,
    _reason := v_reason,
    _origin := 'manual',
    _run_id := NULL,
    _trigger_message_id := NULL,
    _trigger_snippet := NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_clear_expedicao_assignment(
  _conversation_id uuid,
  _new_team_member_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_revoked int := 0;
BEGIN
  IF NOT public.is_admin_or_manager(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  PERFORM 1 FROM public.conversations WHERE id = _conversation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'conversation_not_found'; END IF;

  WITH revoked AS (
    UPDATE public.conversation_access_grants
       SET is_active = false,
           revoked_at = v_now,
           revoked_by = auth.uid(),
           revoke_reason = CASE WHEN _new_team_member_id IS NULL THEN 'unassigned' ELSE 'reassigned' END
     WHERE conversation_id = _conversation_id AND is_active
     RETURNING 1
  )
  SELECT count(*) INTO v_revoked FROM revoked;

  UPDATE public.conversations
     SET handoff_type = NULL,
         handoff_reason = NULL,
         handoff_created_at = NULL,
         human_status = NULL,
         human_takeover_required = false,
         requires_dermoconsultant = false,
         outside_dermoconsultant_hours = false,
         ai_paused = false,
         status = 'nina',
         assigned_user_id = _new_team_member_id,
         assigned_at = CASE WHEN _new_team_member_id IS NULL THEN NULL ELSE v_now END,
         attendance_finished = false,
         attendance_finished_at = NULL,
         attendance_finished_by = NULL
   WHERE id = _conversation_id;

  INSERT INTO public.conversation_handoff_events
    (conversation_id, event_type, actor_user_id, handoff_reason, metadata)
  VALUES
    (_conversation_id,
     CASE WHEN _new_team_member_id IS NULL THEN 'unassigned_manual' ELSE 'reassigned_manual' END,
     auth.uid(), NULL,
     jsonb_build_object(
       'origin', 'manual',
       'revoked_grants', v_revoked,
       'new_team_member_id', _new_team_member_id
     ));

  RETURN jsonb_build_object('cleared', true, 'revoked_grants', v_revoked,
                            'assigned_user_id', _new_team_member_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_assign_expedicao(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_clear_expedicao_assignment(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_assign_expedicao(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_clear_expedicao_assignment(uuid, uuid) TO authenticated, service_role;