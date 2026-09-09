CREATE OR REPLACE FUNCTION public.list_expedicao_team_member_ids()
RETURNS TABLE(team_member_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tm.id
  FROM public.team_members tm
  JOIN public.user_roles ur ON ur.user_id = tm.user_id AND ur.role = 'expedicao'
  WHERE tm.status = 'active'
$$;

REVOKE ALL ON FUNCTION public.list_expedicao_team_member_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_expedicao_team_member_ids() TO authenticated, service_role;