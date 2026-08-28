
REVOKE EXECUTE ON FUNCTION public.pick_next_dermoconsultora() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pick_dermo_assignee(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.internal_grant_dermo_access(uuid, uuid, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_dermo_handoff_reason(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_sensitive_dermo_reason(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_my_dermo_conversations() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_dermo_messages(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dermo_reply(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dermo_finish_conversation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dermo_can_access_conversation(uuid) FROM PUBLIC, anon;
