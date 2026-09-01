CREATE OR REPLACE FUNCTION public.reopen_finished_conversation_on_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
           handoff_created_at = NULL,
           assigned_user_id = NULL,
           assigned_at = NULL,
           human_status = NULL,
           status = 'nina',
           updated_at = now()
     WHERE id = NEW.conversation_id
       AND attendance_finished = true;

    IF FOUND THEN
      INSERT INTO public.conversation_handoff_events
        (conversation_id, event_type, actor_user_id, handoff_reason)
      VALUES (NEW.conversation_id, 'reopened_by_message', NULL, 'new_incoming_message');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;