REVOKE EXECUTE ON FUNCTION public.claim_message_grouping_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_stale_message_grouping() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_message_grouper() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_message_grouping_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_message_grouping() TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_message_grouper() TO postgres;