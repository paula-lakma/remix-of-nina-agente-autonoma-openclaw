BEGIN;

CREATE OR REPLACE FUNCTION public.is_operational_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','manager','sdr')
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
    WHERE user_id = _user_id
      AND role IN ('admin','manager')
  )
$$;

REVOKE ALL ON FUNCTION public.is_operational_staff(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin_or_manager(uuid)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_operational_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_manager(uuid)  TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated users access all contacts"      ON public.contacts;
DROP POLICY IF EXISTS "Authenticated users access all messages"      ON public.messages;
DROP POLICY IF EXISTS "Authenticated users access all conversations" ON public.conversations;
DROP POLICY IF EXISTS "Authenticated access all deals"               ON public.deals;
DROP POLICY IF EXISTS "Authenticated access all appointments"        ON public.appointments;
DROP POLICY IF EXISTS "Authenticated access nina_settings"           ON public.nina_settings;

CREATE POLICY contacts_select_staff ON public.contacts
  FOR SELECT TO authenticated USING (public.is_operational_staff(auth.uid()));
CREATE POLICY contacts_insert_staff ON public.contacts
  FOR INSERT TO authenticated WITH CHECK (public.is_operational_staff(auth.uid()));
CREATE POLICY contacts_update_staff ON public.contacts
  FOR UPDATE TO authenticated
  USING (public.is_operational_staff(auth.uid()))
  WITH CHECK (public.is_operational_staff(auth.uid()));
CREATE POLICY contacts_delete_staff ON public.contacts
  FOR DELETE TO authenticated USING (public.is_operational_staff(auth.uid()));

CREATE POLICY messages_select_staff ON public.messages
  FOR SELECT TO authenticated USING (public.is_operational_staff(auth.uid()));
CREATE POLICY messages_insert_staff ON public.messages
  FOR INSERT TO authenticated WITH CHECK (public.is_operational_staff(auth.uid()));
CREATE POLICY messages_update_staff ON public.messages
  FOR UPDATE TO authenticated
  USING (public.is_operational_staff(auth.uid()))
  WITH CHECK (public.is_operational_staff(auth.uid()));
CREATE POLICY messages_delete_staff ON public.messages
  FOR DELETE TO authenticated USING (public.is_operational_staff(auth.uid()));

CREATE POLICY conversations_select_staff ON public.conversations
  FOR SELECT TO authenticated USING (public.is_operational_staff(auth.uid()));
CREATE POLICY conversations_insert_staff ON public.conversations
  FOR INSERT TO authenticated WITH CHECK (public.is_operational_staff(auth.uid()));
CREATE POLICY conversations_update_staff ON public.conversations
  FOR UPDATE TO authenticated
  USING (public.is_operational_staff(auth.uid()))
  WITH CHECK (public.is_operational_staff(auth.uid()));
CREATE POLICY conversations_delete_staff ON public.conversations
  FOR DELETE TO authenticated USING (public.is_operational_staff(auth.uid()));

CREATE POLICY deals_select_staff ON public.deals
  FOR SELECT TO authenticated USING (public.is_operational_staff(auth.uid()));
CREATE POLICY deals_insert_staff ON public.deals
  FOR INSERT TO authenticated WITH CHECK (public.is_operational_staff(auth.uid()));
CREATE POLICY deals_update_staff ON public.deals
  FOR UPDATE TO authenticated
  USING (public.is_operational_staff(auth.uid()))
  WITH CHECK (public.is_operational_staff(auth.uid()));
CREATE POLICY deals_delete_staff ON public.deals
  FOR DELETE TO authenticated USING (public.is_operational_staff(auth.uid()));

CREATE POLICY appointments_select_staff ON public.appointments
  FOR SELECT TO authenticated USING (public.is_operational_staff(auth.uid()));
CREATE POLICY appointments_insert_staff ON public.appointments
  FOR INSERT TO authenticated WITH CHECK (public.is_operational_staff(auth.uid()));
CREATE POLICY appointments_update_staff ON public.appointments
  FOR UPDATE TO authenticated
  USING (public.is_operational_staff(auth.uid()))
  WITH CHECK (public.is_operational_staff(auth.uid()));
CREATE POLICY appointments_delete_staff ON public.appointments
  FOR DELETE TO authenticated USING (public.is_operational_staff(auth.uid()));

CREATE POLICY nina_settings_select_admin_manager ON public.nina_settings
  FOR SELECT TO authenticated USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY nina_settings_insert_admin ON public.nina_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY nina_settings_update_admin ON public.nina_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY nina_settings_delete_admin ON public.nina_settings
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.contacts, public.messages, public.conversations,
  public.deals, public.appointments, public.nina_settings FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts, public.messages,
  public.conversations, public.deals, public.appointments, public.nina_settings
  TO authenticated;

GRANT ALL ON public.contacts, public.messages, public.conversations,
  public.deals, public.appointments, public.nina_settings TO service_role;

DO $$
DECLARE
  tabelas text[] := ARRAY['contacts','messages','conversations','deals','appointments','nina_settings'];
  t text;
  n int;
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    IF NOT (SELECT c.relrowsecurity FROM pg_class c
              JOIN pg_namespace ns ON ns.oid = c.relnamespace
             WHERE ns.nspname='public' AND c.relname=t) THEN
      RAISE EXCEPTION 'RLS desabilitado em %', t;
    END IF;

    SELECT count(*) INTO n FROM pg_policies
     WHERE schemaname='public' AND tablename=t AND cmd='ALL';
    IF n <> 0 THEN
      RAISE EXCEPTION 'Policy ampla (FOR ALL) remanescente em %: %', t, n;
    END IF;

    SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename=t;
    IF n <> 4 THEN
      RAISE EXCEPTION 'Esperado 4 policies em %, encontrado %', t, n;
    END IF;

    SELECT count(*) INTO n FROM pg_policies
     WHERE schemaname='public' AND tablename=t
       AND cmd IN ('SELECT','INSERT','UPDATE','DELETE');
    IF n <> 4 THEN
      RAISE EXCEPTION 'Cobertura de comandos incompleta em %', t;
    END IF;
  END LOOP;

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename = ANY(tabelas);
  IF n <> 24 THEN
    RAISE EXCEPTION 'Esperado 24 policies no total, encontrado %', n;
  END IF;

  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE grantee='anon' AND table_schema='public' AND table_name = ANY(tabelas);
  IF n <> 0 THEN
    RAISE EXCEPTION 'anon ainda possui % privilegios diretos', n;
  END IF;
END $$;

DO $$
DECLARE
  uid uuid;
  n int;
BEGIN
  uid := gen_random_uuid();
  IF public.is_operational_staff(uid) THEN
    RAISE EXCEPTION 'usuario sem papel foi aceito como staff';
  END IF;
  IF public.is_admin_or_manager(uid) THEN
    RAISE EXCEPTION 'usuario sem papel foi aceito como admin/manager';
  END IF;
  IF public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'usuario sem papel foi aceito como admin';
  END IF;

  SELECT count(*) INTO n FROM public.user_roles ur
   WHERE ur.role IN ('admin','manager','sdr')
     AND NOT public.is_operational_staff(ur.user_id);
  IF n <> 0 THEN
    RAISE EXCEPTION 'staff real rejeitado pela funcao: %', n;
  END IF;

  SELECT count(*) INTO n FROM public.user_roles ur
   WHERE ur.role NOT IN ('admin','manager','sdr')
     AND NOT EXISTS (SELECT 1 FROM public.user_roles x
                      WHERE x.user_id = ur.user_id
                        AND x.role IN ('admin','manager','sdr'))
     AND public.is_operational_staff(ur.user_id);
  IF n <> 0 THEN
    RAISE EXCEPTION 'papel nao autorizado aceito como staff: %', n;
  END IF;

  SELECT count(*) INTO n FROM public.user_roles ur
   WHERE ur.role = 'admin' AND NOT public.has_role(ur.user_id, 'admin');
  IF n <> 0 THEN
    RAISE EXCEPTION 'admin real rejeitado por has_role';
  END IF;
END $$;

COMMIT;