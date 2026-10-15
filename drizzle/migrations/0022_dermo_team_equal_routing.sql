CREATE OR REPLACE FUNCTION public.pick_next_dermoconsultora()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
SELECT tm.id
FROM public.team_members tm
JOIN public.team_functions tf ON tf.id = tm.function_id
WHERE tm.status = 'active'
  AND tf.is_active IS DISTINCT FROM false
  AND tf.name ILIKE '%dermoconsultor%'
ORDER BY
  (SELECT count(*) FROM public.conversations c
     WHERE c.assigned_user_id = tm.id
       AND c.human_takeover_required = true
       AND c.attendance_finished = false) ASC,
  (SELECT max(e.created_at) FROM public.conversation_handoff_events e
     WHERE e.event_type = 'handoff_dermoconsultant'
       AND (e.metadata->>'assigned_team_member_id')::uuid = tm.id
       AND coalesce(e.metadata->>'synthetic','false') <> 'true') ASC NULLS FIRST,
  tm.id ASC
LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.pick_dermo_assignee(_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_laura uuid;
BEGIN
  IF public.is_sensitive_dermo_reason(_reason) THEN
    SELECT tm.id INTO v_laura
    FROM public.team_members tm
    WHERE tm.id = 'dcf6c6ed-a8df-4849-93f2-859b0d59ae9c'::uuid
      AND tm.status = 'active';
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
$function$;