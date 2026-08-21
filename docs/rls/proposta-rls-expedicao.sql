-- PROPOSTA (NÃO APLICADA) — Restrição de RLS por papel
-- Objetivo: bloquear completamente o papel `expedicao` em contacts, messages,
-- conversations, deals, appointments e nina_settings, preservando admin,
-- manager, sdr (e legado user/moderator) e o acesso das edge functions
-- (service_role continua fazendo bypass de RLS).
--
-- IMPORTANTE: policies permissivas são combinadas com OR. Por isso as policies
-- amplas atuais ("...access all...", USING auth.role() = 'authenticated')
-- precisam ser REMOVIDAS, não apenas complementadas.

BEGIN;

-- 1) Helper: operador de atendimento (tudo menos expedicao)
CREATE OR REPLACE FUNCTION public.is_operator(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','manager','sdr','user','moderator')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','manager')
  )
$$;

-- 2) Remover as policies amplas atuais
DROP POLICY IF EXISTS "Authenticated users access all contacts"      ON public.contacts;
DROP POLICY IF EXISTS "Authenticated users access all messages"      ON public.messages;
DROP POLICY IF EXISTS "Authenticated users access all conversations" ON public.conversations;
DROP POLICY IF EXISTS "Authenticated access all deals"               ON public.deals;
DROP POLICY IF EXISTS "Authenticated access all appointments"        ON public.appointments;
DROP POLICY IF EXISTS "Authenticated access nina_settings"           ON public.nina_settings;

-- 3) Policies operacionais (admin, manager, sdr, user, moderator)
CREATE POLICY "Operators manage contacts" ON public.contacts
  FOR ALL TO authenticated
  USING (public.is_operator(auth.uid()))
  WITH CHECK (public.is_operator(auth.uid()));

CREATE POLICY "Operators manage messages" ON public.messages
  FOR ALL TO authenticated
  USING (public.is_operator(auth.uid()))
  WITH CHECK (public.is_operator(auth.uid()));

CREATE POLICY "Operators manage conversations" ON public.conversations
  FOR ALL TO authenticated
  USING (public.is_operator(auth.uid()))
  WITH CHECK (public.is_operator(auth.uid()));

CREATE POLICY "Operators manage deals" ON public.deals
  FOR ALL TO authenticated
  USING (public.is_operator(auth.uid()))
  WITH CHECK (public.is_operator(auth.uid()));

CREATE POLICY "Operators manage appointments" ON public.appointments
  FOR ALL TO authenticated
  USING (public.is_operator(auth.uid()))
  WITH CHECK (public.is_operator(auth.uid()));

-- 4) nina_settings restrito a admin/manager
CREATE POLICY "Admins and managers read nina_settings" ON public.nina_settings
  FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins write nina_settings" ON public.nina_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5) Grants (inalterados, apenas reafirmados; service_role faz bypass de RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts, public.messages,
  public.conversations, public.deals, public.appointments, public.nina_settings
  TO authenticated;
GRANT ALL ON public.contacts, public.messages, public.conversations,
  public.deals, public.appointments, public.nina_settings TO service_role;
-- Opcional (endurecimento adicional, avaliar separadamente):
-- REVOKE ALL ON public.contacts, public.messages, public.conversations,
--   public.deals, public.appointments, public.nina_settings FROM anon;

COMMIT;

-- ============================ ROLLBACK =============================
-- BEGIN;
-- DROP POLICY IF EXISTS "Operators manage contacts"        ON public.contacts;
-- DROP POLICY IF EXISTS "Operators manage messages"        ON public.messages;
-- DROP POLICY IF EXISTS "Operators manage conversations"   ON public.conversations;
-- DROP POLICY IF EXISTS "Operators manage deals"           ON public.deals;
-- DROP POLICY IF EXISTS "Operators manage appointments"    ON public.appointments;
-- DROP POLICY IF EXISTS "Admins and managers read nina_settings" ON public.nina_settings;
-- DROP POLICY IF EXISTS "Admins write nina_settings"       ON public.nina_settings;
-- CREATE POLICY "Authenticated users access all contacts" ON public.contacts
--   FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
-- CREATE POLICY "Authenticated users access all messages" ON public.messages
--   FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
-- CREATE POLICY "Authenticated users access all conversations" ON public.conversations
--   FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
-- CREATE POLICY "Authenticated access all deals" ON public.deals
--   FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
-- CREATE POLICY "Authenticated access all appointments" ON public.appointments
--   FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
-- CREATE POLICY "Authenticated access nina_settings" ON public.nina_settings
--   FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
-- COMMIT;
