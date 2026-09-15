ALTER TABLE public.message_grouping_queue
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS skipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS skip_reason text;

CREATE INDEX IF NOT EXISTS idx_mgq_pending
  ON public.message_grouping_queue (process_after)
  WHERE processed = false AND skipped_at IS NULL;

-- Atomic claim with lease. processed is NEVER used to claim.
CREATE OR REPLACE FUNCTION public.claim_message_grouping_batch(p_limit integer DEFAULT 50)
RETURNS SETOF public.message_grouping_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH cte AS (
    SELECT id FROM public.message_grouping_queue
    WHERE processed = false
      AND skipped_at IS NULL
      AND process_after <= now()
      AND process_after > now() - interval '2 hours'
      AND (claim_expires_at IS NULL OR claim_expires_at < now())
    ORDER BY process_after ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.message_grouping_queue q
     SET claimed_at = now(),
         claim_expires_at = now() + interval '5 minutes'
   WHERE q.id IN (SELECT id FROM cte)
  RETURNING q.*;
END;
$$;

-- Mark messages that blew past the 2h recovery window, without pretending they were processed
CREATE OR REPLACE FUNCTION public.expire_stale_message_grouping()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count integer;
BEGIN
  WITH expired AS (
    UPDATE public.message_grouping_queue
       SET skipped_at = now(),
           skip_reason = 'expired_recovery_window'
     WHERE processed = false
       AND skipped_at IS NULL
       AND process_after <= now() - interval '2 hours'
     RETURNING 1
  )
  SELECT count(*) INTO v_count FROM expired;
  RETURN v_count;
END;
$$;

-- Periodic safety net: only triggers the existing grouper
CREATE OR REPLACE FUNCTION public.trigger_message_grouper()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_url text := rtrim(coalesce(public.get_secret('SUPABASE_URL'), ''), '/');
  v_token text := coalesce(public.get_secret('PANEL_TOKEN'), '');
BEGIN
  IF v_url = '' OR v_token = '' THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.message_grouping_queue
     WHERE processed = false
       AND skipped_at IS NULL
       AND process_after <= now()
       AND (claim_expires_at IS NULL OR claim_expires_at < now())
  ) THEN
    PERFORM public.expire_stale_message_grouping();
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := v_url || '/functions/v1/message-grouper',
    headers := jsonb_build_object('Content-Type','application/json','X-Panel-Token', v_token),
    body := jsonb_build_object('triggered_by','cron-safety-net')
  );
END;
$$;

-- Remove the 7 audited duplicate rows (all completed) and lock duplicates out for good
DELETE FROM public.nina_processing_queue
 WHERE id IN (
   '6a596a35-4c5b-436d-8eb5-2b341f36b972',
   '6720927f-4762-4dcd-b7a6-6c0a1ae8f2c5',
   'b56f0ccc-bd17-4039-b501-ee47b76ab21a',
   '1f375f76-a1a1-43e7-bd5d-b89d1ff30b3b',
   '00afe588-67b6-492c-8360-0d50c951870e',
   'd2a99550-f0db-45a3-bb16-c74560c87ee3',
   '37c58b91-ecd1-466e-b43d-66d11fa9b7c2'
 );

CREATE UNIQUE INDEX IF NOT EXISTS nina_processing_queue_message_id_key
  ON public.nina_processing_queue (message_id);