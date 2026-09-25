CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm ON public.contacts USING gin (name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_call_name_trgm ON public.contacts USING gin (call_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_email_trgm ON public.contacts USING gin (email extensions.gin_trgm_ops);

-- Notas internas
CREATE TABLE public.crm_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (length(btrim(content)) > 0 AND length(content) <= 5000),
  author_user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  CONSTRAINT crm_notes_deleted_consistency CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
);
GRANT SELECT, INSERT, UPDATE ON public.crm_notes TO authenticated;
GRANT ALL ON public.crm_notes TO service_role;
ALTER TABLE public.crm_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_notes_select ON public.crm_notes FOR SELECT TO authenticated
  USING (public.is_operational_staff(auth.uid()) AND deleted_at IS NULL);
CREATE POLICY crm_notes_insert ON public.crm_notes FOR INSERT TO authenticated
  WITH CHECK (public.is_operational_staff(auth.uid()) AND author_user_id = auth.uid() AND deleted_at IS NULL);
CREATE POLICY crm_notes_update ON public.crm_notes FOR UPDATE TO authenticated
  USING (public.is_operational_staff(auth.uid()) AND deleted_at IS NULL
         AND (author_user_id = auth.uid() OR public.is_admin_or_manager(auth.uid())))
  WITH CHECK (public.is_operational_staff(auth.uid())
         AND (author_user_id = auth.uid() OR public.is_admin_or_manager(auth.uid()))
         AND (deleted_by IS NULL OR deleted_by = auth.uid()));
CREATE INDEX idx_crm_notes_contact ON public.crm_notes (contact_id, created_at DESC);

-- Follow-ups
CREATE TABLE public.crm_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  assigned_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  due_at timestamptz NOT NULL,
  has_time boolean NOT NULL DEFAULT false,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0 AND length(reason) <= 300),
  notes text CHECK (notes IS NULL OR length(notes) <= 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','canceled')),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  completed_by uuid REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  canceled_at timestamptz,
  CONSTRAINT crm_followups_state_consistency CHECK (
    (status = 'open' AND completed_at IS NULL AND completed_by IS NULL AND canceled_at IS NULL)
    OR (status = 'done' AND completed_at IS NOT NULL AND completed_by IS NOT NULL AND canceled_at IS NULL)
    OR (status = 'canceled' AND canceled_at IS NOT NULL AND completed_at IS NULL AND completed_by IS NULL)
  )
);
GRANT SELECT, INSERT, UPDATE ON public.crm_followups TO authenticated;
GRANT ALL ON public.crm_followups TO service_role;
ALTER TABLE public.crm_followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_followups_select ON public.crm_followups FOR SELECT TO authenticated
  USING (public.is_operational_staff(auth.uid()));
CREATE POLICY crm_followups_insert ON public.crm_followups FOR INSERT TO authenticated
  WITH CHECK (public.is_operational_staff(auth.uid()) AND created_by = auth.uid() AND status = 'open');
CREATE POLICY crm_followups_update ON public.crm_followups FOR UPDATE TO authenticated
  USING (public.is_operational_staff(auth.uid()))
  WITH CHECK (public.is_operational_staff(auth.uid()));
CREATE INDEX idx_crm_followups_contact ON public.crm_followups (contact_id);
CREATE INDEX idx_crm_followups_assigned ON public.crm_followups (assigned_user_id, status, due_at);
CREATE INDEX idx_crm_followups_status_due ON public.crm_followups (status, due_at);

-- Interesses confirmados
CREATE TABLE public.crm_contact_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  interest_key text NOT NULL CHECK (interest_key IN ('manchas','acne','peeling','rejuvenescimento','limpeza_de_pele','corporal','outro')),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_contact_interests_unique UNIQUE (contact_id, interest_key)
);
GRANT SELECT, INSERT, DELETE ON public.crm_contact_interests TO authenticated;
GRANT ALL ON public.crm_contact_interests TO service_role;
ALTER TABLE public.crm_contact_interests ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_interests_select ON public.crm_contact_interests FOR SELECT TO authenticated
  USING (public.is_operational_staff(auth.uid()));
CREATE POLICY crm_interests_insert ON public.crm_contact_interests FOR INSERT TO authenticated
  WITH CHECK (public.is_operational_staff(auth.uid()) AND created_by = auth.uid());
CREATE POLICY crm_interests_delete ON public.crm_contact_interests FOR DELETE TO authenticated
  USING (public.is_operational_staff(auth.uid()));

-- Perfil CRM (tipo de contato)
CREATE TABLE public.crm_contact_profiles (
  contact_id uuid PRIMARY KEY REFERENCES public.contacts(id) ON DELETE CASCADE,
  contact_type text CHECK (contact_type IS NULL OR contact_type IN ('profissional_estetica','cliente_final','distribuidor','influenciador','outro')),
  updated_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.crm_contact_profiles TO authenticated;
GRANT ALL ON public.crm_contact_profiles TO service_role;
ALTER TABLE public.crm_contact_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_profiles_select ON public.crm_contact_profiles FOR SELECT TO authenticated
  USING (public.is_operational_staff(auth.uid()));
CREATE POLICY crm_profiles_insert ON public.crm_contact_profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_operational_staff(auth.uid()) AND updated_by = auth.uid());
CREATE POLICY crm_profiles_update ON public.crm_contact_profiles FOR UPDATE TO authenticated
  USING (public.is_operational_staff(auth.uid()))
  WITH CHECK (public.is_operational_staff(auth.uid()) AND updated_by = auth.uid());
CREATE INDEX idx_crm_profiles_type ON public.crm_contact_profiles (contact_type);

-- updated_at somente nas próprias tabelas do CRM
CREATE TRIGGER trg_crm_notes_updated BEFORE UPDATE ON public.crm_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_crm_followups_updated BEFORE UPDATE ON public.crm_followups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_crm_profiles_updated BEFORE UPDATE ON public.crm_contact_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
