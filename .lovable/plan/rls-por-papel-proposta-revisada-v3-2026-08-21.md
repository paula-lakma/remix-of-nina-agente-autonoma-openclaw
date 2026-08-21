# RLS por papel — proposta revisada (v3)

Restringir o acesso direto ao banco nas seis tabelas sensíveis, deixando cada papel exatamente com o que precisa. Nada é aplicado nesta etapa.

## Estado verificado agora

- As seis tabelas (`contacts`, `messages`, `conversations`, `deals`, `appointments`, `nina_settings`) têm RLS habilitado, sem FORCE, e exatamente uma policy permissiva `FOR ALL` com `auth.role() = 'authenticated'` — ou seja, qualquer usuário logado tem CRUD total hoje.
- Grants atuais nas seis tabelas: `anon`, `authenticated` e `service_role` com todos os privilégios.
- Papéis realmente existentes em `user_roles`: 5 `sdr` e 1 `admin`. Nenhum usuário com `user`, `moderator`, `manager` ou `expedicao`.
- Leticia (`financeiro@lakma.com.br`) está com papel `sdr`; `MANUAL_TRACKING_SEND_ENABLED` removido (envio manual desligado); trava Shopify ativa.

## Papel padrão de novas contas — sem alteração

Esta migration não toca no fluxo de criação de contas. `initialize-system` continua atribuindo `user` a contas sem papel, e o gatilho de cadastro segue como está. Nenhuma promoção automática para `sdr`.

Consequência desejada: uma conta nova nasce **sem acesso operacional**. `user`, `moderator`, `expedicao` e autenticado sem papel permanecem bloqueados nas seis tabelas até que um administrador atribua explicitamente `admin`, `manager` ou `sdr`.

`expedicao` continua acessando apenas a funcionalidade de rastreio pelo backend autorizado (`send-manual-tracking`, que roda com `service_role`), sem nenhum acesso direto a clientes, conversas ou configurações.

## Decisão sobre `user` e `moderator`

Removidos do acesso. Não há arquivo, hook ou edge function que exija esses papéis para operar as tabelas — aparecem apenas como rótulos de UI em `src/hooks/useUserRole.ts` (mapa de permissões e ordem de prioridade), sem nenhum usuário atribuído.

## Sobre `anon`

Nenhum fluxo público usa essas tabelas com a chave anônima: o frontend só as consulta autenticado, e webhooks (Shopify, WhatsApp, NINA) usam `service_role`. As seis tabelas usam identificadores UUID gerados por padrão, sem sequências associadas, então não há grant de sequência a preservar. Os privilégios diretos de `anon` serão revogados.

## Matriz de acesso proposta

Cinco tabelas operacionais (`contacts`, `messages`, `conversations`, `deals`, `appointments`):

| Papel | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | sim | sim | sim | sim |
| manager | sim | sim | sim | sim |
| sdr | sim | sim | sim | sim |
| expedicao | não | não | não | não |
| user | não | não | não | não |
| moderator | não | não | não | não |
| autenticado sem papel | não | não | não | não |
| anon | não | não | não | não |
| service_role | preservado (bypass de RLS) | preservado | preservado | preservado |

`nina_settings`:

| Papel | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | sim | sim | sim | sim |
| manager | sim | não | não | não |
| sdr | não | não | não | não |
| expedicao | não | não | não | não |
| user | não | não | não | não |
| moderator | não | não | não | não |
| autenticado sem papel | não | não | não | não |
| anon | não | não | não | não |
| service_role | preservado | preservado | preservado | preservado |

## Policies removidas

Seis policies amplas (precisam sair: policies permissivas se somam com OR, então adicionar restrições não basta):

1. `Authenticated users access all contacts`
2. `Authenticated users access all messages`
3. `Authenticated users access all conversations`
4. `Authenticated access all deals`
5. `Authenticated access all appointments`
6. `Authenticated access nina_settings`

## Policies criadas — exatamente 24

5 tabelas operacionais × 4 comandos = 20, mais 4 em `nina_settings` = **24**. Todas `TO authenticated`, uma por comando, sem nenhuma policy `FOR ALL` e sem duplicação:

`contacts` — 1. `contacts_select_staff` (SELECT) · 2. `contacts_insert_staff` (INSERT) · 3. `contacts_update_staff` (UPDATE) · 4. `contacts_delete_staff` (DELETE)

`messages` — 5. `messages_select_staff` · 6. `messages_insert_staff` · 7. `messages_update_staff` · 8. `messages_delete_staff`

`conversations` — 9. `conversations_select_staff` · 10. `conversations_insert_staff` · 11. `conversations_update_staff` · 12. `conversations_delete_staff`

`deals` — 13. `deals_select_staff` · 14. `deals_insert_staff` · 15. `deals_update_staff` · 16. `deals_delete_staff`

`appointments` — 17. `appointments_select_staff` · 18. `appointments_insert_staff` · 19. `appointments_update_staff` · 20. `appointments_delete_staff`

`nina_settings` — 21. `nina_settings_select_admin_manager` (SELECT) · 22. `nina_settings_insert_admin` · 23. `nina_settings_update_admin` · 24. `nina_settings_delete_admin`

Predicados: nas 20 operacionais, `public.is_operational_staff(auth.uid())` (admin/manager/sdr) em `USING` (SELECT, UPDATE, DELETE) e em `WITH CHECK` (INSERT, UPDATE). Em `nina_settings`, SELECT usa `public.is_admin_or_manager(auth.uid())`; INSERT/UPDATE/DELETE usam `public.has_role(auth.uid(), 'admin')`.

## Funções auxiliares

`public.is_operational_staff(uuid)` e `public.is_admin_or_manager(uuid)`, ao lado do já existente `public.has_role`. Todas: `LANGUAGE sql`, `STABLE`, `SECURITY DEFINER`, `SET search_path = public`, retornando apenas boolean, consultando `user_roles` por `auth.uid()` — sem depender de qualquer informação vinda do navegador e sem recursão de RLS. `EXECUTE` revogado de `PUBLIC` e `anon`; concedido apenas a `authenticated` e `service_role`.

## Grants

- `REVOKE ALL` de `anon` nas seis tabelas.
- `authenticated`: mantém SELECT/INSERT/UPDATE/DELETE (o controle efetivo passa a ser RLS).
- `service_role`: mantém `ALL`.
- Nenhum grant de sequência é alterado (todas as chaves são UUID).

## Impacto por módulo

- **Chat ao Vivo, Contatos, Pipeline, Agendamentos**: inalterados para admin, manager e sdr — exatamente os papéis que já usam essas telas.
- **Cérebro / Configurações**: seguem funcionando para admin; manager passa a ter apenas leitura; sdr perde o acesso direto (a UI já não expõe essas telas para ele).
- **NINA, WhatsApp, Shopify, sender, filas, envio de rastreio**: nenhum impacto — todas as edge functions usam `service_role`, que faz bypass de RLS.
- **expedicao**: perde qualquer leitura direta da base de clientes e conversas; a página de rastreio não consulta essas tabelas pelo cliente.
- **Contas novas**: continuam nascendo como `user` e permanecem sem acesso até promoção explícita por um administrador.

## Migration atômica (estrutura)

1. `BEGIN`.
2. `CREATE OR REPLACE` das duas funções auxiliares + `REVOKE`/`GRANT` de EXECUTE.
3. `DROP POLICY` das 6 policies amplas.
4. `CREATE POLICY` das 24 policies por comando.
5. Validação estrutural: RLS habilitado nas seis tabelas; nenhuma policy `FOR ALL` remanescente; contagem exata de 4 policies por tabela e 24 no total; `anon` sem privilégios diretos.
6. Asserts com identidades controladas: via `set_config('request.jwt.claims', ...)` e `SET LOCAL ROLE authenticated`, simula admin, manager, sdr, expedicao, user, moderator e autenticado sem papel, confirmando permitido/bloqueado em cada comando de cada tabela. Divergência dispara `RAISE EXCEPTION`.
7. `COMMIT` somente se todos os asserts passarem; qualquer exceção aborta a transação inteira, sem estado parcial.

Os usuários de teste dos asserts são criados e removidos dentro da mesma transação, sem tocar em contas reais e sem ler dados de clientes.

## Testes pós-migração

Banco (identidades controladas, sem exibir dados):

- Cada comando em cada uma das seis tabelas para admin, manager, sdr, expedicao, user, moderator, autenticado sem papel e anon.
- Confirmação explícita de bloqueio total de `expedicao` nas seis tabelas.
- Contagem de policies = 24 e ausência de policies amplas.
- Linter de segurança do backend.

Aplicação (smoke):

- Chat ao Vivo: abrir conversa, criar e atualizar mensagem, finalizar atendimento.
- Pipeline: criar e atualizar negócio, mover de etapa.
- Contatos: listar, criar, editar.
- Agendamentos: criar e listar.
- Configurações: leitura e gravação como admin; somente leitura como manager; bloqueio como sdr.
- NINA: webhook de entrada gerando resposta (service_role).
- Shopify: recebimento de evento com a trava compartilhada ativa.
- Envio de rastreio: permanece desligado e inacessível para sdr.

## Rollback

Script único e transacional que remove as 24 policies novas, recria as 6 policies amplas originais com o texto atual, restaura os privilégios de `anon` e remove as duas funções auxiliares criadas — restaurando exatamente o estado de hoje.

## Invariantes mantidas nesta etapa e na implementação futura

- Nenhuma migration aplicada agora; nenhum usuário ou papel alterado.
- Leticia permanece `sdr`.
- `MANUAL_TRACKING_SEND_ENABLED` desligado; nenhum WhatsApp enviado.
- Shopify, webhook, templates, sender, filas e históricos intactos; trava compartilhada ativa.
- Nenhuma publicação de nova versão.
- O arquivo `docs/rls/proposta-rls-expedicao.sql` será reescrito para refletir esta v3 (24 policies, sem `user`/`moderator`) na etapa de implementação aprovada.
