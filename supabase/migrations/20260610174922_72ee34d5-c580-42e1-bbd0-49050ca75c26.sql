DROP POLICY IF EXISTS "Users manage own deals" ON public.deals;
CREATE POLICY "Authenticated access all deals" ON public.deals FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Users manage own appointments" ON public.appointments;
CREATE POLICY "Authenticated access all appointments" ON public.appointments FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP POLICY IF EXISTS "Authenticated read nina_settings" ON public.nina_settings;
DROP POLICY IF EXISTS "Admins read nina_settings" ON public.nina_settings;
DROP POLICY IF EXISTS "Admins modify nina_settings" ON public.nina_settings;
CREATE POLICY "Authenticated access nina_settings" ON public.nina_settings FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE OR REPLACE VIEW public.nina_settings_public WITH (security_invoker = true) AS
SELECT id, company_name, sdr_name, is_active, auto_response_enabled, timezone, business_hours_start, business_hours_end, business_days
FROM public.nina_settings;
GRANT SELECT ON public.nina_settings_public TO authenticated, anon;

DROP POLICY IF EXISTS "Authenticated all message_grouping_queue" ON public.message_grouping_queue;
CREATE POLICY "Authenticated access message_grouping_queue" ON public.message_grouping_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated all message_processing_queue" ON public.message_processing_queue;
CREATE POLICY "Authenticated access message_processing_queue" ON public.message_processing_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated all nina_processing_queue" ON public.nina_processing_queue;
CREATE POLICY "Authenticated access nina_processing_queue" ON public.nina_processing_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated all send_queue" ON public.send_queue;
CREATE POLICY "Authenticated access send_queue" ON public.send_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);

REVOKE EXECUTE ON FUNCTION public.claim_message_processing_batch(integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.claim_nina_processing_batch(integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.claim_send_queue_batch(integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_or_create_conversation_state(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.update_client_memory(uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.update_conversation_state(uuid, text, text, jsonb) FROM anon, public;

ALTER TABLE public.nina_settings
  ADD COLUMN IF NOT EXISTS brain_provider text NOT NULL DEFAULT 'lovable',
  ADD COLUMN IF NOT EXISTS openclaw_gateway_url text,
  ADD COLUMN IF NOT EXISTS openclaw_gateway_token text,
  ADD COLUMN IF NOT EXISTS openclaw_model text DEFAULT 'openclaw',
  ADD COLUMN IF NOT EXISTS brain_repo_url text;
ALTER TABLE public.nina_settings DROP CONSTRAINT IF EXISTS nina_settings_brain_provider_check;
ALTER TABLE public.nina_settings ADD CONSTRAINT nina_settings_brain_provider_check CHECK (brain_provider IN ('lovable', 'openclaw'));

CREATE TABLE IF NOT EXISTS public.instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL DEFAULT auth.uid(),
  hostname text,
  openclaw_version text,
  ingress_url text,
  hooks_token text,
  openclaw_dashboard_token text,
  status text NOT NULL DEFAULT 'pending',
  last_heartbeat timestamptz,
  system_prompt text,
  agent_type text NOT NULL DEFAULT 'nina_sdr',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instances TO authenticated;
GRANT ALL ON public.instances TO service_role;
CREATE UNIQUE INDEX IF NOT EXISTS instances_owner_hostname_uniq ON public.instances (owner_user_id, hostname);
ALTER TABLE public.instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_instances" ON public.instances FOR ALL TO authenticated USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "service_role_all_instances" ON public.instances FOR ALL USING (auth.role() = 'service_role');
CREATE TRIGGER instances_updated_at_trigger BEFORE UPDATE ON public.instances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.installer_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  owner_user_id uuid NOT NULL DEFAULT auth.uid(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.installer_tokens TO authenticated;
GRANT ALL ON public.installer_tokens TO service_role;
ALTER TABLE public.installer_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_select_installer_tokens" ON public.installer_tokens FOR SELECT TO authenticated USING (auth.uid() = owner_user_id);
CREATE POLICY "owner_insert_installer_tokens" ON public.installer_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "service_role_all_installer_tokens" ON public.installer_tokens FOR ALL USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.get_secret(secret_name text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = secret_name LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_secret(text) TO service_role;