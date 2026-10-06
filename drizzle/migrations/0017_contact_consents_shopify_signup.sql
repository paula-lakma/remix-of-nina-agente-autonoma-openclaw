-- Consentimento de marketing (histórico auditável) + inscrição da página Shopify.
-- Sem backfill. Rollback do gatilho: restaurar create_deal_for_new_contact sem o bloco "lakma.contact_origin".

CREATE TABLE public.contact_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp')),
  purpose text NOT NULL CHECK (purpose IN ('marketing')),
  status text NOT NULL CHECK (status IN ('opted_in','opted_out')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('shopify_site','nina','whatsapp_keyword','shopify','cadastro_profissional','manual')),
  consent_version text,
  consent_text text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contact_consents_current ON public.contact_consents (contact_id, channel, purpose, occurred_at DESC, created_at DESC);
GRANT SELECT ON public.contact_consents TO authenticated;
GRANT ALL ON public.contact_consents TO service_role;
ALTER TABLE public.contact_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY contact_consents_select_admin ON public.contact_consents FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

-- histórico imutável: sem UPDATE/DELETE nem para o backend
CREATE OR REPLACE FUNCTION public.contact_consents_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'contact_consents é somente inserção'; END; $$;
CREATE TRIGGER contact_consents_no_update BEFORE UPDATE ON public.contact_consents
  FOR EACH ROW EXECUTE FUNCTION public.contact_consents_immutable();

-- estado atual = evento mais recente por contato/canal/finalidade
CREATE VIEW public.contact_consent_current WITH (security_invoker = true) AS
SELECT DISTINCT ON (contact_id, channel, purpose)
  contact_id, channel, purpose, status, occurred_at, source, consent_version, id AS consent_id
FROM public.contact_consents
ORDER BY contact_id, channel, purpose, occurred_at DESC, created_at DESC;
GRANT SELECT ON public.contact_consent_current TO authenticated, service_role;

-- tentativas de inscrição (dados minimizados: só hashes, retenção curta)
CREATE TABLE public.signup_attempts (
  id bigserial PRIMARY KEY,
  phone_hash text,
  net_hash text,
  outcome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_signup_attempts_phone ON public.signup_attempts (phone_hash, created_at DESC);
CREATE INDEX idx_signup_attempts_net ON public.signup_attempts (net_hash, created_at DESC);
GRANT ALL ON public.signup_attempts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.signup_attempts_id_seq TO service_role;
ALTER TABLE public.signup_attempts ENABLE ROW LEVEL SECURITY;

-- revisão de conflitos (nome/tipo/duplicidade) sem merge destrutivo
CREATE TABLE public.signup_review_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  kind text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.signup_review_flags TO authenticated;
GRANT ALL ON public.signup_review_flags TO service_role;
ALTER TABLE public.signup_review_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY signup_review_flags_select_admin ON public.signup_review_flags FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

-- registra tentativa e diz se está dentro do limite (5/telefone/dia; 30/rede/hora)
CREATE OR REPLACE FUNCTION public.signup_rate_check(_phone_hash text, _net_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p int; n int;
BEGIN
  DELETE FROM signup_attempts WHERE created_at < now() - interval '7 days';
  SELECT count(*) INTO p FROM signup_attempts WHERE phone_hash = _phone_hash AND created_at > now() - interval '1 day';
  SELECT count(*) INTO n FROM signup_attempts WHERE _net_hash IS NOT NULL AND net_hash = _net_hash AND created_at > now() - interval '1 hour';
  INSERT INTO signup_attempts (phone_hash, net_hash, outcome)
    VALUES (_phone_hash, _net_hash, CASE WHEN p >= 5 OR n >= 30 THEN 'rate_limited' ELSE 'attempt' END);
  RETURN NOT (p >= 5 OR n >= 30);
END; $$;
REVOKE ALL ON FUNCTION public.signup_rate_check(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.signup_rate_check(text, text) TO service_role;

-- gatilho do funil: exceção só para contatos criados pela inscrição do site
CREATE OR REPLACE FUNCTION public.create_deal_for_new_contact()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('lakma.contact_origin', true) = 'shopify_site' THEN
    RETURN NEW; -- inscrição de marketing não vira oportunidade
  END IF;
  INSERT INTO public.deals (contact_id, title, company, stage, stage_id, priority, user_id)
  VALUES (NEW.id, COALESCE(NEW.name, NEW.call_name, 'Novo Lead'), NULL, 'new', public.pipeline_stage_id('new'), 'medium', NEW.user_id)
  ON CONFLICT (contact_id) WHERE won_at IS NULL AND lost_at IS NULL DO NOTHING;
  RETURN NEW;
END; $function$;

-- aplicação atômica da inscrição (só service_role)
CREATE OR REPLACE FUNCTION public.apply_shopify_signup(
  _phone text, _legacy_phone text, _name text, _contact_type text,
  _version text, _consent_text text, _evidence jsonb
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ids uuid[]; cid uuid; cur_name text; cur_type text; last record; created boolean := false;
BEGIN
  IF _phone !~ '^55[1-9][0-9]9[0-9]{8}$' THEN RAISE EXCEPTION 'invalid_phone'; END IF;
  IF _contact_type NOT IN ('profissional_estetica','cliente_final') THEN RAISE EXCEPTION 'invalid_type'; END IF;
  IF _version IS NULL OR _consent_text IS NULL THEN RAISE EXCEPTION 'invalid_version'; END IF;

  SELECT array_agg(id ORDER BY created_at, id) INTO ids FROM contacts
   WHERE phone_number = _phone OR (_legacy_phone IS NOT NULL AND phone_number = _legacy_phone);

  IF ids IS NULL THEN
    PERFORM set_config('lakma.contact_origin', 'shopify_site', true);
    INSERT INTO contacts (phone_number, name, tags) VALUES (_phone, _name, ARRAY['origem:shopify_site'])
      ON CONFLICT (phone_number) DO NOTHING RETURNING id INTO cid;
    PERFORM set_config('lakma.contact_origin', '', true);
    IF cid IS NULL THEN SELECT id INTO cid FROM contacts WHERE phone_number = _phone; ELSE created := true; END IF;
  ELSE
    cid := ids[1];
    IF array_length(ids, 1) > 1 THEN
      INSERT INTO signup_review_flags (contact_id, kind, details)
        VALUES (cid, 'duplicate_phone_formats', jsonb_build_object('contact_ids', to_jsonb(ids)));
    END IF;
    SELECT name INTO cur_name FROM contacts WHERE id = cid;
    IF cur_name IS NULL OR btrim(cur_name) = '' THEN UPDATE contacts SET name = _name WHERE id = cid; END IF;
  END IF;

  SELECT contact_type INTO cur_type FROM crm_contact_profiles WHERE contact_id = cid;
  IF NOT FOUND THEN
    INSERT INTO crm_contact_profiles (contact_id, contact_type) VALUES (cid, _contact_type);
  ELSIF cur_type IS NULL THEN
    UPDATE crm_contact_profiles SET contact_type = _contact_type, updated_at = now() WHERE contact_id = cid;
  ELSIF cur_type <> _contact_type THEN
    INSERT INTO signup_review_flags (contact_id, kind, details)
      VALUES (cid, 'contact_type_conflict', jsonb_build_object('current', cur_type, 'submitted', _contact_type));
  END IF;

  SELECT status, consent_version INTO last FROM contact_consent_current
   WHERE contact_id = cid AND channel = 'whatsapp' AND purpose = 'marketing';
  IF FOUND AND last.status = 'opted_in' AND last.consent_version = _version THEN
    RETURN CASE WHEN created THEN 'created' ELSE 'already_opted_in' END;
  END IF;

  INSERT INTO contact_consents (contact_id, channel, purpose, status, source, consent_version, consent_text, evidence)
    VALUES (cid, 'whatsapp', 'marketing', 'opted_in', 'shopify_site', _version, _consent_text, coalesce(_evidence, '{}'::jsonb));
  RETURN CASE WHEN created THEN 'created' ELSE 'opted_in_existing' END;
END; $$;
REVOKE ALL ON FUNCTION public.apply_shopify_signup(text, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_shopify_signup(text, text, text, text, text, text, jsonb) TO service_role;
