-- =====================================================================
-- PROPOSTA v3 — NÃO APLICADA
-- RLS por papel nas seis tabelas sensíveis.
--
-- Acesso direto permitido:
--   contacts, messages, conversations, deals, appointments -> admin, manager, sdr
--   nina_settings -> SELECT: admin, manager | INSERT/UPDATE/DELETE: admin
--
-- Bloqueados: expedicao, user, moderator, qualquer outro app_role,
-- autenticado sem linha em user_roles, e anon.
-- service_role permanece intacto (bypass de RLS).
--
-- Policies permissivas são combinadas com OR: por isso as seis policies
-- amplas atuais são REMOVIDAS, não complementadas.
--
-- Total de policies criadas: 5 tabelas x 4 comandos = 20, mais 4 em
-- nina_settings = 24.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Funções auxiliares
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 2) Remoção das seis policies amplas
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users access all contacts"      ON public.contacts;
DROP POLICY IF EXISTS "Authenticated users access all messages"      ON public.messages;
DROP POLICY IF EXISTS "Authenticated users access all conversations" ON public.conversations;
DROP POLICY IF EXISTS "Authenticated access all deals"               ON public.deals;
DROP POLICY IF EXISTS "Authenticated access all appointments"        ON public.appointments;
DROP POLICY IF EXISTS "Authenticated access nina_settings"           ON public.nina_settings;

-- ---------------------------------------------------------------------
-- 3) 20 policies operacionais (admin | manager | sdr)
-- ---------------------------------------------------------------------
-- contacts (1-4)
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

-- messages (5-8)
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

-- conversations (9-12)
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

-- deals (13-16)
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

-- appointments (17-20)
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

-- ---------------------------------------------------------------------
-- 4) 4 policies em nina_settings (21-24)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 5) Grants
-- ---------------------------------------------------------------------
REVOKE ALL ON public.contacts, public.messages, public.conversations,
  public.deals, public.appointments, public.nina_settings FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts, public.messages,
  public.conversations, public.deals, public.appointments, public.nina_settings
  TO authenticated;

GRANT ALL ON public.contacts, public.messages, public.conversations,
  public.deals, public.appointments, public.nina_settings TO service_role;
-- Chaves primárias são UUID: nenhum grant de sequência é alterado.

-- ---------------------------------------------------------------------
-- 6) Validação estrutural
-- ---------------------------------------------------------------------
DO $$
DECLARE
  tabelas text[] := ARRAY['contacts','messages','conversations','deals','appointments','nina_settings'];
  t text;
  n int;
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    -- RLS habilitado
    IF NOT (SELECT c.relrowsecurity FROM pg_class c
              JOIN pg_namespace ns ON ns.oid = c.relnamespace
             WHERE ns.nspname='public' AND c.relname=t) THEN
      RAISE EXCEPTION 'RLS desabilitado em %', t;
    END IF;

    -- nenhuma policy FOR ALL remanescente
    SELECT count(*) INTO n FROM pg_policies
     WHERE schemaname='public' AND tablename=t AND cmd='ALL';
    IF n <> 0 THEN
      RAISE EXCEPTION 'Policy ampla (FOR ALL) remanescente em %: %', t, n;
    END IF;

    -- exatamente 4 policies por tabela
    SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename=t;
    IF n <> 4 THEN
      RAISE EXCEPTION 'Esperado 4 policies em %, encontrado %', t, n;
    END IF;
  END LOOP;

  -- total exato de 24 policies
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename = ANY(tabelas);
  IF n <> 24 THEN
    RAISE EXCEPTION 'Esperado 24 policies no total, encontrado %', n;
  END IF;

  -- anon sem privilégios diretos
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE grantee='anon' AND table_schema='public' AND table_name = ANY(tabelas);
  IF n <> 0 THEN
    RAISE EXCEPTION 'anon ainda possui % privilégios diretos', n;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 7) Asserts com identidades controladas
--    Usuários sintéticos criados e removidos dentro da própria transação.
--    Nenhum dado de cliente é lido: só se verifica permitido/bloqueado.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  ids jsonb := '{}'::jsonb;
  papeis text[] := ARRAY['admin','manager','sdr','expedicao','user','moderator'];
  p text;
  uid uuid;
  t text;
  tabelas text[] := ARRAY['contacts','messages','conversations','deals','appointments'];
  visivel boolean;
  esperado boolean;
BEGIN
  -- identidades sintéticas
  FOREACH p IN ARRAY papeis LOOP
    uid := gen_random_uuid();
    INSERT INTO public.user_roles (user_id, role) VALUES (uid, p::public.app_role);
    ids := ids || jsonb_build_object(p, uid::text);
  END LOOP;
  ids := ids || jsonb_build_object('sem_papel', gen_random_uuid()::text);

  -- tabelas operacionais: staff = permitido, demais = bloqueado
  FOREACH p IN ARRAY papeis || ARRAY['sem_papel'] LOOP
    uid := (ids->>p)::uuid;
    esperado := p IN ('admin','manager','sdr');
    visivel := public.is_operational_staff(uid);
    IF visivel <> esperado THEN
      RAISE EXCEPTION 'is_operational_staff(%) = %, esperado %', p, visivel, esperado;
    END IF;
  END LOOP;

  -- nina_settings: leitura admin/manager, escrita admin
  FOREACH p IN ARRAY papeis || ARRAY['sem_papel'] LOOP
    uid := (ids->>p)::uuid;
    esperado := p IN ('admin','manager');
    IF public.is_admin_or_manager(uid) <> esperado THEN
      RAISE EXCEPTION 'is_admin_or_manager(%) incorreto', p;
    END IF;
    esperado := (p = 'admin');
    IF public.has_role(uid, 'admin') <> esperado THEN
      RAISE EXCEPTION 'has_role(%, admin) incorreto', p;
    END IF;
  END LOOP;

  -- verificação de que cada tabela operacional tem um predicado por comando
  FOREACH t IN ARRAY tabelas LOOP
    IF (SELECT count(*) FROM pg_policies
         WHERE schemaname='public' AND tablename=t
           AND cmd IN ('SELECT','INSERT','UPDATE','DELETE')) <> 4 THEN
      RAISE EXCEPTION 'Cobertura de comandos incompleta em %', t;
    END IF;
  END LOOP;

  -- limpeza das identidades sintéticas
  FOREACH p IN ARRAY papeis LOOP
    DELETE FROM public.user_roles WHERE user_id = (ids->>p)::uuid;
  END LOOP;
END $$;

COMMIT;

-- =====================================================================
-- TESTES PÓS-MIGRAÇÃO (executar fora da transação, com JWTs reais)
-- =====================================================================
-- Para cada papel (admin, manager, sdr, expedicao, user, moderator,
-- autenticado sem papel), com SET LOCAL ROLE authenticated e
-- set_config('request.jwt.claims', json_build_object('sub', <uid>)::text, true):
--   SELECT/INSERT/UPDATE/DELETE em cada uma das seis tabelas.
-- Resultado esperado: apenas admin/manager/sdr nas cinco operacionais;
-- em nina_settings apenas admin (CRUD) e manager (SELECT).
--
-- Como anon: qualquer comando nas seis tabelas deve falhar por permissão.
-- Como service_role: todos os comandos continuam funcionando.
--
-- Smoke de aplicação: Chat ao Vivo (abrir conversa, criar/atualizar mensagem,
-- finalizar atendimento), Pipeline (criar/mover negócio), Contatos (listar,
-- criar, editar), Agendamentos (criar/listar), Configurações (admin escreve,
-- manager só lê, sdr bloqueado), webhook da NINA respondendo via service_role,
-- evento Shopify com a trava compartilhada ativa, e envio de rastreio
-- permanecendo desligado.
--
-- Rodar também o linter de segurança do backend.

-- =====================================================================
-- ROLLBACK INTEGRAL (restaura exatamente o estado anterior)
-- =====================================================================
-- BEGIN;
-- DROP POLICY IF EXISTS contacts_select_staff      ON public.contacts;
-- DROP POLICY IF EXISTS contacts_insert_staff      ON public.contacts;
-- DROP POLICY IF EXISTS contacts_update_staff      ON public.contacts;
-- DROP POLICY IF EXISTS contacts_delete_staff      ON public.contacts;
-- DROP POLICY IF EXISTS messages_select_staff      ON public.messages;
-- DROP POLICY IF EXISTS messages_insert_staff      ON public.messages;
-- DROP POLICY IF EXISTS messages_update_staff      ON public.messages;
-- DROP POLICY IF EXISTS messages_delete_staff      ON public.messages;
-- DROP POLICY IF EXISTS conversations_select_staff ON public.conversations;
-- DROP POLICY IF EXISTS conversations_insert_staff ON public.conversations;
-- DROP POLICY IF EXISTS conversations_update_staff ON public.conversations;
-- DROP POLICY IF EXISTS conversations_delete_staff ON public.conversations;
-- DROP POLICY IF EXISTS deals_select_staff         ON public.deals;
-- DROP POLICY IF EXISTS deals_insert_staff         ON public.deals;
-- DROP POLICY IF EXISTS deals_update_staff         ON public.deals;
-- DROP POLICY IF EXISTS deals_delete_staff         ON public.deals;
-- DROP POLICY IF EXISTS appointments_select_staff  ON public.appointments;
-- DROP POLICY IF EXISTS appointments_insert_staff  ON public.appointments;
-- DROP POLICY IF EXISTS appointments_update_staff  ON public.appointments;
-- DROP POLICY IF EXISTS appointments_delete_staff  ON public.appointments;
-- DROP POLICY IF EXISTS nina_settings_select_admin_manager ON public.nina_settings;
-- DROP POLICY IF EXISTS nina_settings_insert_admin ON public.nina_settings;
-- DROP POLICY IF EXISTS nina_settings_update_admin ON public.nina_settings;
-- DROP POLICY IF EXISTS nina_settings_delete_admin ON public.nina_settings;
--
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
--
-- GRANT ALL ON public.contacts, public.messages, public.conversations,
--   public.deals, public.appointments, public.nina_settings TO anon;
-- DROP FUNCTION IF EXISTS public.is_operational_staff(uuid);
-- DROP FUNCTION IF EXISTS public.is_admin_or_manager(uuid);
-- COMMIT;
