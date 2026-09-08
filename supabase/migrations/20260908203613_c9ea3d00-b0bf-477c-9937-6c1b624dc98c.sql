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
  ORDER BY (
    SELECT count(*) FROM public.conversations c
    WHERE c.assigned_user_id = tm.id
      AND c.human_takeover_required = true
      AND c.attendance_finished = false
  ) ASC,
  (
    SELECT max(e.created_at)
    FROM public.conversation_handoff_events e
    WHERE e.event_type = 'handoff_dermoconsultant'
      AND e.metadata->>'assigned_team_member_id' = tm.id::text
      AND coalesce(e.metadata->>'synthetic', 'false') <> 'true'
  ) ASC NULLS FIRST,
  tm.id ASC
  LIMIT 1
$function$;