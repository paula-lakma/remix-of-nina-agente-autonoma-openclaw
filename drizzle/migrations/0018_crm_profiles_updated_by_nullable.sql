-- Inscrição pública (shopify-signup) grava o tipo de cliente sem usuário da equipe.
ALTER TABLE public.crm_contact_profiles ALTER COLUMN updated_by DROP NOT NULL;
COMMENT ON COLUMN public.crm_contact_profiles.updated_by IS 'Usuário da equipe que definiu o tipo; NULL quando veio da inscrição pública (shopify_site).';