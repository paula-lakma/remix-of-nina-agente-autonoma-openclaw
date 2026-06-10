CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.auto_create_deal_on_contact()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE default_stage_id UUID;
BEGIN
  SELECT id INTO default_stage_id FROM public.pipeline_stages WHERE is_active = true ORDER BY position ASC LIMIT 1;
  IF default_stage_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.deals (contact_id, title, stage_id, user_id) VALUES (NEW.id, COALESCE(NEW.name, 'Novo Lead') || ' - Deal', default_stage_id, NEW.user_id);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS auto_create_deal_on_contact_trigger ON public.contacts;
CREATE TRIGGER auto_create_deal_on_contact_trigger AFTER INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.auto_create_deal_on_contact();

CREATE TABLE IF NOT EXISTS public.nina_test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL UNIQUE,
  owner_user_id uuid NOT NULL DEFAULT auth.uid(),
  conversation_id uuid, content text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nina_test_results TO authenticated;
GRANT ALL ON public.nina_test_results TO service_role;
CREATE INDEX IF NOT EXISTS nina_test_results_run_id_idx ON public.nina_test_results (run_id);
ALTER TABLE public.nina_test_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_nina_test_results" ON public.nina_test_results FOR ALL TO authenticated USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "service_role_all_nina_test_results" ON public.nina_test_results FOR ALL USING (auth.role() = 'service_role');
CREATE TRIGGER nina_test_results_updated_at_trigger BEFORE UPDATE ON public.nina_test_results FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.brain_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL, summary text, details_md text,
  position int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brain_products TO authenticated;
GRANT ALL ON public.brain_products TO service_role;
ALTER TABLE public.brain_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_brain_products" ON public.brain_products FOR ALL TO authenticated USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "service_role_all_brain_products" ON public.brain_products FOR ALL USING (auth.role() = 'service_role');
CREATE TRIGGER brain_products_updated_at_trigger BEFORE UPDATE ON public.brain_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.brain_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL, slug text NOT NULL, content_md text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brain_knowledge TO authenticated;
GRANT ALL ON public.brain_knowledge TO service_role;
ALTER TABLE public.brain_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_brain_knowledge" ON public.brain_knowledge FOR ALL TO authenticated USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "service_role_all_brain_knowledge" ON public.brain_knowledge FOR ALL USING (auth.role() = 'service_role');
CREATE TRIGGER brain_knowledge_updated_at_trigger BEFORE UPDATE ON public.brain_knowledge FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.nina_settings ADD COLUMN IF NOT EXISTS brain_identity jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.set_secret(secret_name text, secret_value text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE existing_id uuid;
BEGIN
  SELECT id INTO existing_id FROM vault.secrets WHERE name = secret_name;
  IF existing_id IS NULL THEN PERFORM vault.create_secret(secret_value, secret_name);
  ELSE PERFORM vault.update_secret(existing_id, secret_value, secret_name); END IF;
END; $$;
REVOKE ALL ON FUNCTION public.set_secret(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_secret(text, text) TO service_role;

CREATE INDEX IF NOT EXISTS messages_reaper_idx ON public.messages (from_type, processed_by_nina, created_at);

CREATE TABLE IF NOT EXISTS public.reaper_lock (
  id boolean PRIMARY KEY DEFAULT true,
  locked_at timestamptz,
  CONSTRAINT reaper_lock_singleton CHECK (id = true)
);
GRANT ALL ON public.reaper_lock TO service_role;
INSERT INTO public.reaper_lock (id, locked_at) VALUES (true, NULL) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.reaper_lock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_reaper_lock" ON public.reaper_lock FOR ALL USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.trigger_reaper()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_url text := rtrim(coalesce(public.get_secret('SUPABASE_URL'), ''), '/');
  v_token text := coalesce(public.get_secret('PANEL_TOKEN'), '');
BEGIN
  IF v_url = '' OR v_token = '' THEN RETURN; END IF;
  PERFORM net.http_post(url := v_url || '/functions/v1/reap-orphan-runs', headers := jsonb_build_object('Content-Type','application/json','X-Panel-Token', v_token), body := '{}'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.trigger_reaper() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_reaper() TO postgres, service_role;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='reap-orphan-runs-2min') THEN PERFORM cron.unschedule('reap-orphan-runs-2min'); END IF; END $$;
SELECT cron.schedule('reap-orphan-runs-2min', '*/2 * * * *', $CRON$SELECT public.trigger_reaper();$CRON$);

CREATE TABLE IF NOT EXISTS public.skill_packs (
  slug text PRIMARY KEY, name text NOT NULL, description text,
  level text NOT NULL CHECK (level IN ('conhecimento','ferramenta')),
  requires_secrets text[] NOT NULL DEFAULT '{}',
  requires_edge_fns text[] NOT NULL DEFAULT '{}',
  config_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  active_by_default boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.skill_packs TO authenticated;
GRANT ALL ON public.skill_packs TO service_role;
ALTER TABLE public.skill_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read_skill_packs" ON public.skill_packs FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_role_all_skill_packs" ON public.skill_packs FOR ALL USING (auth.role() = 'service_role');
CREATE TRIGGER skill_packs_updated_at_trigger BEFORE UPDATE ON public.skill_packs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.installed_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL DEFAULT auth.uid(),
  pack_slug text NOT NULL REFERENCES public.skill_packs(slug) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, pack_slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.installed_packs TO authenticated;
GRANT ALL ON public.installed_packs TO service_role;
ALTER TABLE public.installed_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_installed_packs" ON public.installed_packs FOR ALL TO authenticated USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "service_role_all_installed_packs" ON public.installed_packs FOR ALL USING (auth.role() = 'service_role');
CREATE TRIGGER installed_packs_updated_at_trigger BEFORE UPDATE ON public.installed_packs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.skill_packs (slug, name, description, level, requires_secrets, requires_edge_fns, config_schema, active_by_default, position)
VALUES
  ('follow-up', 'Follow-up automático', 'Detecta leads parados e dispara um follow-up consultivo automaticamente.', 'ferramenta', '{}', ARRAY['nina-stale-leads'], '{"janela_valor": 23, "janela_unidade": "horas"}'::jsonb, false, 1),
  ('pesquisa-empresa', 'Pesquisa de empresa', 'Pesquisa o site/empresa do prospect (Firecrawl), resume e enriquece a memória do lead.', 'ferramenta', ARRAY['FIRECRAWL_API_KEY'], ARRAY['nina-enrich'], '{}'::jsonb, false, 2),
  ('tratamento-objecoes', 'Tratamento de objeções', 'Base de conhecimento para responder objeções comuns de forma consultiva.', 'conhecimento', '{}', '{}', '{}'::jsonb, false, 3)
ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, level=EXCLUDED.level, requires_secrets=EXCLUDED.requires_secrets, requires_edge_fns=EXCLUDED.requires_edge_fns, config_schema=EXCLUDED.config_schema, active_by_default=EXCLUDED.active_by_default, position=EXCLUDED.position, updated_at=now();

CREATE TABLE IF NOT EXISTS public.stale_leads_lock (
  id boolean PRIMARY KEY DEFAULT true, locked_at timestamptz,
  CONSTRAINT stale_leads_lock_singleton CHECK (id = true)
);
GRANT ALL ON public.stale_leads_lock TO service_role;
INSERT INTO public.stale_leads_lock (id, locked_at) VALUES (true, NULL) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.stale_leads_lock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_stale_leads_lock" ON public.stale_leads_lock FOR ALL USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.trigger_stale_leads()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_url text := rtrim(coalesce(public.get_secret('SUPABASE_URL'), ''), '/');
        v_token text := coalesce(public.get_secret('PANEL_TOKEN'), '');
BEGIN
  IF v_url = '' OR v_token = '' THEN RETURN; END IF;
  PERFORM net.http_post(url := v_url || '/functions/v1/nina-stale-leads', headers := jsonb_build_object('Content-Type','application/json','X-Panel-Token', v_token), body := '{}'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.trigger_stale_leads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_stale_leads() TO postgres, service_role;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='nina-stale-leads-tick') THEN PERFORM cron.unschedule('nina-stale-leads-tick'); END IF;
END $$;
SELECT cron.schedule('nina-stale-leads-tick', '*/13 * * * *', $CRON$SELECT public.trigger_stale_leads();$CRON$);

CREATE TABLE IF NOT EXISTS public.custom_knowledge_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL DEFAULT auth.uid(),
  slug text NOT NULL, name text NOT NULL, description text, content text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_knowledge_skills_slug_safe CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  UNIQUE (owner_user_id, slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_knowledge_skills TO authenticated;
GRANT ALL ON public.custom_knowledge_skills TO service_role;
ALTER TABLE public.custom_knowledge_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_custom_knowledge_skills" ON public.custom_knowledge_skills FOR ALL TO authenticated USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "service_role_all_custom_knowledge_skills" ON public.custom_knowledge_skills FOR ALL USING (auth.role() = 'service_role');
CREATE TRIGGER custom_knowledge_skills_updated_at_trigger BEFORE UPDATE ON public.custom_knowledge_skills FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();