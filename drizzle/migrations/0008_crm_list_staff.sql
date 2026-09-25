CREATE OR REPLACE FUNCTION public.crm_list_staff()
RETURNS TABLE(user_id uuid, display_name text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.user_id,
         COALESCE(NULLIF(btrim(tm.name),''), NULLIF(btrim(p.full_name),''), p.email, 'Usuário') AS display_name,
         (SELECT string_agg(r.role::text, ',') FROM public.user_roles r WHERE r.user_id = p.user_id) AS role
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT t.name FROM public.team_members t WHERE t.user_id = p.user_id ORDER BY t.created_at LIMIT 1
  ) tm ON true
  WHERE public.is_operational_staff(auth.uid())
    AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.user_id AND r.role IN ('admin','manager','sdr'))
$$;
REVOKE ALL ON FUNCTION public.crm_list_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_list_staff() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.crm_user_names(_ids uuid[])
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.user_id,
         COALESCE(NULLIF(btrim(tm.name),''), NULLIF(btrim(p.full_name),''), p.email, 'Usuário')
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT t.name FROM public.team_members t WHERE t.user_id = p.user_id ORDER BY t.created_at LIMIT 1
  ) tm ON true
  WHERE public.is_operational_staff(auth.uid()) AND p.user_id = ANY(_ids)
$$;
REVOKE ALL ON FUNCTION public.crm_user_names(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_user_names(uuid[]) TO authenticated, service_role;