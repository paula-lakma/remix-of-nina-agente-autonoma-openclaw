
ALTER TABLE public.message_grouping_queue DROP CONSTRAINT IF EXISTS message_grouping_queue_message_id_fkey;
ALTER TABLE public.message_grouping_queue ADD CONSTRAINT message_grouping_queue_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;

ALTER TABLE public.nina_processing_queue DROP CONSTRAINT IF EXISTS nina_processing_queue_conversation_id_fkey;
ALTER TABLE public.nina_processing_queue ADD CONSTRAINT nina_processing_queue_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

ALTER TABLE public.nina_processing_queue DROP CONSTRAINT IF EXISTS nina_processing_queue_message_id_fkey;
ALTER TABLE public.nina_processing_queue ADD CONSTRAINT nina_processing_queue_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;

ALTER TABLE public.send_queue DROP CONSTRAINT IF EXISTS send_queue_conversation_id_fkey;
ALTER TABLE public.send_queue ADD CONSTRAINT send_queue_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

ALTER TABLE public.send_queue DROP CONSTRAINT IF EXISTS send_queue_message_id_fkey;
ALTER TABLE public.send_queue ADD CONSTRAINT send_queue_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;
