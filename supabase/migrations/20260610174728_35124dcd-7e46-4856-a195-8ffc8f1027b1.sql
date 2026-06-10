INSERT INTO public.nina_settings (company_name, sdr_name, is_active, auto_response_enabled, ai_model_mode, message_breaking_enabled, adaptive_response_enabled, response_delay_min, response_delay_max, business_hours_start, business_hours_end, business_days, timezone, elevenlabs_voice_id, elevenlabs_stability, elevenlabs_similarity_boost, elevenlabs_style, elevenlabs_speaker_boost, whatsapp_verify_token)
SELECT 'Sua Empresa', 'Agente', true, true, 'flash', true, true, 1000, 3000, '09:00', '18:00', ARRAY[1,2,3,4,5], 'America/Sao_Paulo', 'alloy', 0.75, 0.80, 0.30, true, 'viver-de-ia-nina-webhook'
WHERE NOT EXISTS (SELECT 1 FROM public.nina_settings LIMIT 1);

CREATE OR REPLACE FUNCTION public.create_deal_for_new_contact()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE first_stage_id UUID;
BEGIN
  SELECT id INTO first_stage_id FROM public.pipeline_stages WHERE is_active = true ORDER BY position LIMIT 1;
  IF first_stage_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.deals (contact_id, title, company, stage, stage_id, priority)
  VALUES (NEW.id, COALESCE(NEW.name, NEW.call_name, 'Novo Lead'), NULL, 'new', first_stage_id, 'medium');
  RETURN NEW;
END; $$;

ALTER TABLE public.nina_settings ADD COLUMN IF NOT EXISTS audio_response_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.nina_settings ALTER COLUMN elevenlabs_voice_id SET DEFAULT '9BWtsMINqrJLrRacOk9x';
ALTER TABLE public.nina_settings ADD COLUMN IF NOT EXISTS ai_scheduling_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_appointments_metadata_source ON public.appointments USING GIN (metadata jsonb_path_ops);
ALTER TABLE public.nina_settings ADD COLUMN IF NOT EXISTS whatsapp_business_account_id TEXT;

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.contacts REPLICA IDENTITY FULL;
ALTER TABLE public.deals REPLICA IDENTITY FULL;
ALTER TABLE public.pipeline_stages REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='deals')
  THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.deals; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='pipeline_stages')
  THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_stages; END IF;
END $$;

ALTER TABLE public.nina_settings DROP COLUMN IF EXISTS calcom_api_key;
ALTER TABLE public.nina_settings DROP COLUMN IF EXISTS openai_api_key;
ALTER TABLE public.nina_settings DROP COLUMN IF EXISTS openai_model;
ALTER TABLE public.nina_settings DROP COLUMN IF EXISTS openai_assistant_id;

DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin', 'user'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT, avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.get_auth_user_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT auth.uid() $$;

CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name) VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name');
  IF (SELECT COUNT(*) FROM public.user_roles) = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.nina_settings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.pipeline_stages ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.tag_definitions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.team_functions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Authenticated all nina_settings" ON public.nina_settings;
DROP POLICY IF EXISTS "Authenticated read contacts" ON public.contacts;
DROP POLICY IF EXISTS "Authenticated write contacts" ON public.contacts;
DROP POLICY IF EXISTS "Authenticated read conversations" ON public.conversations;
DROP POLICY IF EXISTS "Authenticated write conversations" ON public.conversations;
DROP POLICY IF EXISTS "Auth all deals" ON public.deals;
DROP POLICY IF EXISTS "Auth all appointments" ON public.appointments;
DROP POLICY IF EXISTS "Auth all pipeline_stages" ON public.pipeline_stages;
DROP POLICY IF EXISTS "Authenticated all tag_definitions" ON public.tag_definitions;
DROP POLICY IF EXISTS "Auth all teams" ON public.teams;
DROP POLICY IF EXISTS "Auth all team_members" ON public.team_members;
DROP POLICY IF EXISTS "Auth all team_functions" ON public.team_functions;

CREATE POLICY "Users manage own nina_settings" ON public.nina_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own contacts" ON public.contacts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own conversations" ON public.conversations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own deals" ON public.deals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own appointments" ON public.appointments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own pipeline_stages" ON public.pipeline_stages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own tag_definitions" ON public.tag_definitions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own teams" ON public.teams FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own team_members" ON public.team_members FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own team_functions" ON public.team_functions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP VIEW IF EXISTS public.contacts_with_stats;
CREATE VIEW public.contacts_with_stats WITH (security_invoker = true) AS
SELECT c.id, c.phone_number, c.whatsapp_id, c.name, c.call_name, c.email, c.profile_picture_url, c.is_business, c.is_blocked, c.blocked_at, c.blocked_reason, c.tags, c.notes, c.client_memory, c.first_contact_date, c.last_activity, c.created_at, c.updated_at, c.user_id,
  COALESCE(msg_stats.total_messages, 0::bigint) AS total_messages,
  COALESCE(msg_stats.nina_messages, 0::bigint) AS nina_messages,
  COALESCE(msg_stats.user_messages, 0::bigint) AS user_messages,
  COALESCE(msg_stats.human_messages, 0::bigint) AS human_messages
FROM public.contacts c
LEFT JOIN (
  SELECT conv.contact_id,
    count(m.id) AS total_messages,
    count(CASE WHEN m.from_type = 'nina'::message_from THEN 1 END) AS nina_messages,
    count(CASE WHEN m.from_type = 'user'::message_from THEN 1 END) AS user_messages,
    count(CASE WHEN m.from_type = 'human'::message_from THEN 1 END) AS human_messages
  FROM public.conversations conv JOIN public.messages m ON m.conversation_id = conv.id
  GROUP BY conv.contact_id
) msg_stats ON msg_stats.contact_id = c.id;
GRANT SELECT ON public.contacts_with_stats TO authenticated;
GRANT ALL ON public.contacts_with_stats TO service_role;

ALTER TABLE public.tag_definitions DROP CONSTRAINT IF EXISTS tag_definitions_key_key;
ALTER TABLE public.tag_definitions ADD CONSTRAINT tag_definitions_user_key_unique UNIQUE (user_id, key);
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_name_key;
ALTER TABLE public.teams ADD CONSTRAINT teams_user_name_unique UNIQUE (user_id, name);