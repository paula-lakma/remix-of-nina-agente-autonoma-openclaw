
-- Attendance finalization fields
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS attendance_finished boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attendance_finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS attendance_finished_by uuid;

CREATE INDEX IF NOT EXISTS idx_conversations_attendance_finished
  ON public.conversations (attendance_finished)
  WHERE attendance_finished = true;

-- Trigger: when a new incoming user message arrives in a finished conversation,
-- automatically reopen it and hand control back to Nina.
CREATE OR REPLACE FUNCTION public.reopen_finished_conversation_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.from_type = 'user' THEN
    UPDATE public.conversations
       SET attendance_finished = false,
           attendance_finished_at = NULL,
           attendance_finished_by = NULL,
           ai_paused = false,
           human_takeover_required = false,
           requires_dermoconsultant = false,
           handoff_type = NULL,
           handoff_reason = NULL,
           human_status = NULL,
           status = 'nina',
           updated_at = now()
     WHERE id = NEW.conversation_id
       AND attendance_finished = true;

    IF FOUND THEN
      INSERT INTO public.conversation_handoff_events
        (conversation_id, event_type, actor_user_id, reason)
      VALUES (NEW.conversation_id, 'reopened_by_message', NULL, 'new_incoming_message');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reopen_finished_conversation ON public.messages;
CREATE TRIGGER trg_reopen_finished_conversation
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.reopen_finished_conversation_on_message();
