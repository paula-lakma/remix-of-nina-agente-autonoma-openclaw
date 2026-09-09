CREATE OR REPLACE FUNCTION public.pick_next_dermoconsultora()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH cand AS (
  SELECT tm.id,
         GREATEST(COALESCE(tm.weight, 1), 1) AS w,
         (SELECT count(*) FROM public.conversations c
           WHERE c.assigned_user_id = tm.id
             AND c.human_takeover_required = true
             AND c.attendance_finished = false) AS active_load,
         (SELECT max(e.created_at) FROM public.conversation_handoff_events e
           WHERE e.event_type = 'handoff_dermoconsultant'
             AND (e.metadata->>'assigned_team_member_id')::uuid = tm.id
             AND coalesce(e.metadata->>'synthetic','false') <> 'true') AS last_any,
         (SELECT max(e.created_at) FROM public.conversation_handoff_events e
           WHERE e.event_type = 'handoff_dermoconsultant'
             AND e.metadata->>'dermo_mode' = 'balanced'
             AND (e.metadata->>'assigned_team_member_id')::uuid = tm.id
             AND coalesce(e.metadata->>'synthetic','false') <> 'true') AS last_common
  FROM public.team_members tm
  JOIN public.team_functions tf ON tf.id = tm.function_id
  WHERE tm.status = 'active'
    AND tf.is_active IS DISTINCT FROM false
    AND tf.name ILIKE '%dermoconsultor%'
), scored AS (
  SELECT c.*,
         (SELECT count(*) FROM public.conversation_handoff_events e
           WHERE e.event_type = 'handoff_dermoconsultant'
             AND e.metadata->>'dermo_mode' = 'balanced'
             AND coalesce(e.metadata->>'synthetic','false') <> 'true'
             AND (e.metadata->>'assigned_team_member_id') IS NOT NULL
             AND (c.last_common IS NULL OR e.created_at > c.last_common)) AS common_since,
         (SELECT min(o.active_load) FROM cand o WHERE o.w <= 1) AS min_load_normal
  FROM cand c
), eligible AS (
  SELECT s.*
  FROM scored s
  WHERE s.w <= 1
     OR s.common_since >= s.w
     OR coalesce(s.min_load_normal, 999) >= 2
), pool AS (
  SELECT * FROM eligible
  UNION ALL
  SELECT * FROM scored WHERE NOT EXISTS (SELECT 1 FROM eligible)
)
SELECT id FROM pool
ORDER BY active_load ASC,
         last_any ASC NULLS FIRST,
         id ASC
LIMIT 1
$function$;