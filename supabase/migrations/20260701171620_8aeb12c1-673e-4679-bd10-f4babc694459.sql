
-- === CONTACTS extension for CSV import ===
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS company TEXT,
  ADD COLUMN IF NOT EXISTS score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_lead TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS whatsapp_valid BOOLEAN;

-- === BROADCAST CAMPAIGNS ===
CREATE TABLE IF NOT EXISTS public.broadcast_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT NOT NULL,
  message_template TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  media_url TEXT,
  media_urls TEXT[] NOT NULL DEFAULT '{}',
  media_rotation_mode TEXT NOT NULL DEFAULT 'random',
  batch_size INTEGER NOT NULL DEFAULT 10,
  delay_min_ms INTEGER NOT NULL DEFAULT 5000,
  delay_max_ms INTEGER NOT NULL DEFAULT 15000,
  delay_between_batches INTEGER NOT NULL DEFAULT 300,
  delay_between_batches_max INTEGER NOT NULL DEFAULT 300,
  rotation_strategy TEXT NOT NULL DEFAULT 'single',
  column_mapping JSONB DEFAULT '{}'::jsonb,
  custom_fields TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  next_batch_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  template_name TEXT,
  template_language TEXT DEFAULT 'pt_BR',
  template_header_media JSONB DEFAULT '{}'::jsonb,
  meta_template_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_campaigns TO authenticated;
GRANT ALL ON public.broadcast_campaigns TO service_role;
ALTER TABLE public.broadcast_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated access broadcast_campaigns"
  ON public.broadcast_campaigns FOR ALL TO authenticated
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_status ON public.broadcast_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_created ON public.broadcast_campaigns(created_at DESC);
CREATE TRIGGER update_broadcast_campaigns_updated_at
  BEFORE UPDATE ON public.broadcast_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- === BROADCAST RECIPIENTS ===
CREATE TABLE IF NOT EXISTS public.broadcast_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.broadcast_campaigns(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  variables JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  sent_media_url TEXT,
  variation_indices INTEGER[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_recipients TO authenticated;
GRANT ALL ON public.broadcast_recipients TO service_role;
ALTER TABLE public.broadcast_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated access broadcast_recipients"
  ON public.broadcast_recipients FOR ALL TO authenticated
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_campaign_status
  ON public.broadcast_recipients(campaign_id, status);

-- === CONTACT LISTS ===
CREATE TABLE IF NOT EXISTS public.contact_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_lists TO authenticated;
GRANT ALL ON public.contact_lists TO service_role;
ALTER TABLE public.contact_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated access contact_lists"
  ON public.contact_lists FOR ALL TO authenticated
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE TRIGGER update_contact_lists_updated_at
  BEFORE UPDATE ON public.contact_lists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.contact_list_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES public.contact_lists(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (list_id, contact_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_list_members TO authenticated;
GRANT ALL ON public.contact_list_members TO service_role;
ALTER TABLE public.contact_list_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated access contact_list_members"
  ON public.contact_list_members FOR ALL TO authenticated
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- === MESSAGE TEMPLATES (internal drafts) ===
CREATE TABLE IF NOT EXISTS public.message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  content TEXT NOT NULL DEFAULT '',
  message_type TEXT NOT NULL DEFAULT 'text',
  media_urls TEXT[] NOT NULL DEFAULT '{}',
  media_rotation_enabled BOOLEAN NOT NULL DEFAULT false,
  media_rotation_mode TEXT NOT NULL DEFAULT 'random',
  tags TEXT[] NOT NULL DEFAULT '{}',
  usage_count INTEGER NOT NULL DEFAULT 0,
  is_ai_generated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated access message_templates"
  ON public.message_templates FOR ALL TO authenticated
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE TRIGGER update_message_templates_updated_at
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- === META TEMPLATES (approved HSM at Meta) ===
CREATE TABLE IF NOT EXISTS public.meta_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'MARKETING',
  language TEXT NOT NULL DEFAULT 'pt_BR',
  components JSONB NOT NULL DEFAULT '[]'::jsonb,
  samples JSONB DEFAULT '{}'::jsonb,
  labels TEXT[],
  meta_template_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  validation_score INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_templates TO authenticated;
GRANT ALL ON public.meta_templates TO service_role;
ALTER TABLE public.meta_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated access meta_templates"
  ON public.meta_templates FOR ALL TO authenticated
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE INDEX IF NOT EXISTS idx_meta_templates_status ON public.meta_templates(status);
CREATE TRIGGER update_meta_templates_updated_at
  BEFORE UPDATE ON public.meta_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Optional FK from campaign → meta template
ALTER TABLE public.broadcast_campaigns
  DROP CONSTRAINT IF EXISTS broadcast_campaigns_meta_template_id_fkey,
  ADD CONSTRAINT broadcast_campaigns_meta_template_id_fkey
    FOREIGN KEY (meta_template_id) REFERENCES public.meta_templates(id) ON DELETE SET NULL;
