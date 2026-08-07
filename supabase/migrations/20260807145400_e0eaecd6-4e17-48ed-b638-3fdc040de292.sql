
CREATE OR REPLACE FUNCTION public.pick_next_dermoconsultora()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tm.id
  FROM public.team_members tm
  JOIN public.team_functions tf ON tf.id = tm.function_id
  WHERE tm.status = 'active'
    AND tf.is_active IS DISTINCT FROM false
    AND tf.name ILIKE '%dermoconsultor%'
  ORDER BY (
    SELECT count(*) FROM public.conversations c
    WHERE c.assigned_user_id = tm.id
      AND c.assigned_at > now() - interval '30 days'
  ) ASC,
  random()
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.pick_next_dermoconsultora() TO authenticated, service_role;
