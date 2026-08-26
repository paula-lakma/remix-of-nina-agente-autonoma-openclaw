DROP FUNCTION IF EXISTS public.list_my_expedicao_conversations();

CREATE OR REPLACE FUNCTION public.list_my_expedicao_conversations()
RETURNS TABLE (
  conversation_id uuid,
  contact_name text,
  contact_phone_masked text,
  reason text,
  granted_at timestamp with time zone,
  last_message_at timestamp with time zone,
  human_status text,
  attendance_finished boolean,
  handoff_at timestamp with time zone,
  trigger_message_id uuid,
  trigger_snippet text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id,
         coalesce(ct.call_name, ct.name, 'Cliente'),
         CASE WHEN ct.phone_number IS NULL THEN NULL
              ELSE regexp_replace(ct.phone_number, '^(.{0,4}).*(.{4})$', '\1****\2')
         END,
         g.reason,
         g.created_at,
         c.last_message_at,
         c.human_status,
         c.attendance_finished,
         coalesce(c.handoff_created_at, g.created_at),
         g.trigger_message_id,
         g.trigger_snippet
  FROM public.conversation_access_grants g
  JOIN public.conversations c ON c.id = g.conversation_id
  LEFT JOIN public.contacts ct ON ct.id = c.contact_id
  WHERE g.is_active
    AND g.team_member_id = public.current_team_member_id()
    AND c.assigned_user_id = g.team_member_id
    AND public.has_role(auth.uid(), 'expedicao')
    AND public.is_expedicao_handoff_reason(g.reason)
  ORDER BY c.last_message_at DESC
$$;

REVOKE ALL ON FUNCTION public.list_my_expedicao_conversations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_expedicao_conversations() TO authenticated;