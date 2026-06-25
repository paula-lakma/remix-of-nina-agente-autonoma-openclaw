
-- Add dermo/handoff fields to conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS ai_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_dermoconsultant boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS human_takeover_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS handoff_type text,
  ADD COLUMN IF NOT EXISTS handoff_reason text,
  ADD COLUMN IF NOT EXISTS handoff_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS human_status text,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS nina_reactivated_by uuid,
  ADD COLUMN IF NOT EXISTS nina_reactivated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_conversations_requires_dermo
  ON public.conversations (requires_dermoconsultant) WHERE requires_dermoconsultant = true;
CREATE INDEX IF NOT EXISTS idx_conversations_ai_paused
  ON public.conversations (ai_paused) WHERE ai_paused = true;

-- Audit log for handoff events
CREATE TABLE IF NOT EXISTS public.conversation_handoff_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  event_type text NOT NULL, -- 'handoff_dermoconsultant' | 'assumed' | 'nina_reactivated'
  actor_user_id uuid,
  handoff_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_handoff_events TO authenticated;
GRANT ALL ON public.conversation_handoff_events TO service_role;

ALTER TABLE public.conversation_handoff_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view handoff events"
  ON public.conversation_handoff_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert handoff events"
  ON public.conversation_handoff_events FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_handoff_events_conversation
  ON public.conversation_handoff_events (conversation_id, created_at DESC);
