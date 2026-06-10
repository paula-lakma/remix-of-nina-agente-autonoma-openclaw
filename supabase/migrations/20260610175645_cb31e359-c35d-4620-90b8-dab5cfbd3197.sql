
DROP POLICY IF EXISTS "Authenticated access message_grouping_queue" ON public.message_grouping_queue;
DROP POLICY IF EXISTS "Authenticated access message_processing_queue" ON public.message_processing_queue;
DROP POLICY IF EXISTS "Authenticated access nina_processing_queue" ON public.nina_processing_queue;
DROP POLICY IF EXISTS "Authenticated access send_queue" ON public.send_queue;

CREATE POLICY "service_role_all_message_grouping_queue" ON public.message_grouping_queue FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_message_processing_queue" ON public.message_processing_queue FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_nina_processing_queue" ON public.nina_processing_queue FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_send_queue" ON public.send_queue FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE EXECUTE ON FUNCTION public.auto_create_deal_on_contact() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_deal_for_new_contact() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_conversation_last_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_processed_message_queue() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_processed_queues() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_message_processing_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_nina_processing_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_send_queue_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_conversation_state(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_conversation_state(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_client_memory(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_reaper() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_stale_leads() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_secret(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_secret(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_auth_user_id() FROM PUBLIC, anon;
