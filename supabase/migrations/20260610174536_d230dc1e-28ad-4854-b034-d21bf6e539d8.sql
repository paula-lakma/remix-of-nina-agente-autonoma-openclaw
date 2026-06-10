CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $$ BEGIN CREATE TYPE public.appointment_type AS ENUM ('demo', 'meeting', 'support', 'followup'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  time TIME NOT NULL,
  duration INTEGER NOT NULL DEFAULT 60,
  type appointment_type NOT NULL DEFAULT 'meeting',
  attendees TEXT[] DEFAULT '{}',
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  meeting_url TEXT,
  status TEXT DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth all appointments" ON public.appointments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;

DO $$ BEGIN CREATE TYPE public.member_role AS ENUM ('admin', 'manager', 'agent'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.member_status AS ENUM ('active', 'invited', 'disabled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT DEFAULT '#3b82f6',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;

CREATE TABLE public.team_functions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_functions TO authenticated;
GRANT ALL ON public.team_functions TO service_role;

CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role public.member_role NOT NULL DEFAULT 'agent',
  status public.member_status NOT NULL DEFAULT 'invited',
  avatar TEXT,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  function_id UUID REFERENCES public.team_functions(id) ON DELETE SET NULL,
  weight INTEGER DEFAULT 1,
  last_active TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth all teams" ON public.teams FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth all team_functions" ON public.team_functions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth all team_members" ON public.team_members FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_team_functions_updated_at BEFORE UPDATE ON public.team_functions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_team_members_updated_at BEFORE UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.teams (name, description, color) VALUES
  ('Vendas', 'Equipe de vendas e prospecção', '#3b82f6'),
  ('Suporte', 'Equipe de atendimento ao cliente', '#10b981'),
  ('Marketing', 'Equipe de marketing e comunicação', '#f59e0b');

INSERT INTO public.team_functions (name, description) VALUES
  ('SDR', 'Sales Development Representative - Prospecção'),
  ('Closer', 'Fechador de vendas'),
  ('CS', 'Customer Success - Sucesso do cliente'),
  ('Suporte Técnico', 'Atendimento técnico especializado'),
  ('Analista de Marketing', 'Análise e estratégias de marketing');

ALTER PUBLICATION supabase_realtime ADD TABLE public.teams;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_functions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_members;

ALTER TABLE public.send_queue ADD COLUMN IF NOT EXISTS message_id UUID REFERENCES public.messages(id);

ALTER TABLE public.nina_settings ADD COLUMN company_name text DEFAULT NULL;
ALTER TABLE public.nina_settings ADD COLUMN sdr_name text DEFAULT NULL;

CREATE TABLE public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  company TEXT,
  value NUMERIC DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'new',
  priority TEXT DEFAULT 'medium',
  tags TEXT[] DEFAULT '{}',
  due_date DATE,
  owner_id UUID REFERENCES public.team_members(id),
  notes TEXT,
  lost_reason TEXT,
  won_at TIMESTAMPTZ,
  lost_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deals TO authenticated;
GRANT ALL ON public.deals TO service_role;
CREATE TRIGGER update_deals_updated_at BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.create_deal_for_new_contact()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.deals (contact_id, title, company, stage, priority)
  VALUES (NEW.id, COALESCE(NEW.name, NEW.call_name, 'Novo Lead'), NULL, 'new', 'medium');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_create_deal_on_contact AFTER INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.create_deal_for_new_contact();

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth all deals" ON public.deals FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.deal_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'note',
  title TEXT NOT NULL,
  description TEXT,
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  is_completed BOOLEAN DEFAULT false,
  created_by UUID REFERENCES public.team_members(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT deal_activities_type_check CHECK (type IN ('note', 'call', 'email', 'meeting', 'task'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_activities TO authenticated;
GRANT ALL ON public.deal_activities TO service_role;
ALTER TABLE public.deal_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth all deal_activities" ON public.deal_activities FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_deal_activities_deal_id ON public.deal_activities(deal_id);
CREATE INDEX idx_deal_activities_created_at ON public.deal_activities(created_at DESC);
CREATE TRIGGER update_deal_activities_updated_at BEFORE UPDATE ON public.deal_activities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'border-slate-500',
  position INTEGER NOT NULL DEFAULT 0,
  is_system BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  ai_trigger_criteria TEXT DEFAULT NULL,
  is_ai_managed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_stages TO authenticated;
GRANT ALL ON public.pipeline_stages TO service_role;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth all pipeline_stages" ON public.pipeline_stages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_pipeline_stages_position ON public.pipeline_stages(position);
CREATE INDEX idx_pipeline_stages_is_active ON public.pipeline_stages(is_active);
CREATE TRIGGER update_pipeline_stages_updated_at BEFORE UPDATE ON public.pipeline_stages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.pipeline_stages (title, color, position, is_system) VALUES
  ('Novos Leads', 'border-slate-500', 0, false),
  ('Qualificação', 'border-cyan-500', 1, false),
  ('Apresentação', 'border-violet-500', 2, false),
  ('Negociação', 'border-orange-500', 3, false),
  ('Fechado / Ganho', 'border-emerald-500', 4, true),
  ('Perdido', 'border-red-500', 5, true);

ALTER TABLE public.deals ADD COLUMN stage_id UUID REFERENCES public.pipeline_stages(id);
UPDATE public.deals d SET stage_id = ps.id FROM public.pipeline_stages ps
WHERE (d.stage = 'new' AND ps.title = 'Novos Leads')
   OR (d.stage = 'qualified' AND ps.title = 'Qualificação')
   OR (d.stage = 'proposal' AND ps.title = 'Apresentação')
   OR (d.stage = 'negotiation' AND ps.title = 'Negociação')
   OR (d.stage = 'won' AND ps.title = 'Fechado / Ganho')
   OR (d.stage = 'lost' AND ps.title = 'Perdido');
UPDATE public.deals SET stage_id = (SELECT id FROM public.pipeline_stages ORDER BY position LIMIT 1) WHERE stage_id IS NULL;
ALTER TABLE public.deals ALTER COLUMN stage_id SET NOT NULL;
ALTER TABLE public.deals ALTER COLUMN stage DROP NOT NULL;

ALTER TABLE public.nina_settings ADD COLUMN ai_model_mode TEXT DEFAULT 'flash' CHECK (ai_model_mode IN ('flash', 'pro', 'pro3', 'adaptive'));

INSERT INTO public.tag_definitions (key, label, color, category, is_active) VALUES
  ('hot_lead', '🔥 Lead Quente', '#ef4444', 'status', true),
  ('warm_lead', '🌡️ Lead Morno', '#f97316', 'status', true),
  ('cold_lead', '❄️ Lead Frio', '#3b82f6', 'status', true),
  ('interested', '✅ Interessado', '#22c55e', 'interest', true),
  ('not_interested', '❌ Sem Interesse', '#6b7280', 'interest', true),
  ('comparing', '🔄 Comparando', '#8b5cf6', 'interest', true),
  ('needs_followup', '📞 Follow-up', '#eab308', 'action', true),
  ('scheduled_demo', '📅 Demo Agendada', '#06b6d4', 'action', true),
  ('waiting_response', '⏳ Aguardando', '#a855f7', 'action', true),
  ('qualified', '⭐ Qualificado', '#10b981', 'qualification', true),
  ('disqualified', '🚫 Desqualificado', '#ef4444', 'qualification', true),
  ('vip', '👑 VIP', '#fbbf24', 'custom', true),
  ('urgent', '🚨 Urgente', '#dc2626', 'custom', true)
ON CONFLICT (key) DO NOTHING;