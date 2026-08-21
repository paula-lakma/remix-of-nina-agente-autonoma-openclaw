# RLS por papel — proposta revisada (v2)

Restringir o acesso direto ao banco nas seis tabelas sensíveis, deixando cada papel exatamente com o que precisa. Nada é aplicado nesta etapa.

## Estado verificado agora

- As seis tabelas (`contacts`, `messages`, `conversations`, `deals`, `appointments`, `nina_settings`) têm RLS habilitado, sem FORCE, e exatamente uma policy permissiva `FOR ALL` com `auth.role() = 'authenticated'` — ou seja, qualquer usuário logado tem CRUD total hoje.
- Grants atuais nas seis tabelas: `anon`, `authenticated` e `service_role` com todos os privilégios.
- Papéis realmente existentes em `user_roles`: 5 `sdr` e 1 `admin`. Nenhum usuário com `user`, `moderator`, `manager` ou `expedicao`.
- Leticia (`financeiro@lakma.com.br`) está com papel `sdr`; `MANUAL_TRACKING_SEND_ENABLED` removido (envio manual desligado); trava Shopify ativa.

## Decisão sobre `user` e `moderator`

Removidos do acesso, conforme solicitado. Não há nenhum arquivo, hook ou edge function que exija esses papéis para operar as tabelas — eles aparecem apenas como rótulos de UI em `src/hooks/useUserRole.ts` (mapa de permissões e ordem de prioridade), sem nenhum usuário atribuído.

Um ponto de atenção verificado: a edge function `initialize-system` atribui o papel `user` a contas que ainda não têm papel. Com a nova regra, uma conta criada por esse caminho ficaria sem acesso nenhum. O plano inclui alinhar essa função para atribuir `sdr` (mesmo padrão do gatilho `handle_new_user`), ou deixá-la sem atribuição automática — decisão a confirmar na implementação.

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
| expedicao / user / moderator / sem papel / anon | não | não | não | não |
| service_role | preservado | preservado | preservado | preservado |

## Policies removidas, criadas e alteradas

Removidas (6, todas amplas — precisam sair porque policies permissivas se somam com OR):

- `Authenticated users access all contacts`
- `Authenticated users access all messages`
- `Authenticated users access all conversations`
- `Authenticated access all deals`
- `Authenticated access all appointments`
- `Authenticated access nina_settings`

Criadas (24 nas operacionais + 4 em `nina_settings`): uma policy por comando (SELECT, INSERT, UPDATE, DELETE) por tabela, sempre `TO authenticated`, com `USING` nos comandos de leitura/alteração e `WITH CHECK` nos de escrita.

Funções auxiliares criadas: `public.is_operational_staff(uuid)` (admin/manager/sdr) e `public.is_admin_or_manager(uuid)`, além do já existente `public.has_role`. Todas `SECURITY DEFINER`, `STABLE`, `LANGUAGE sql`, `SET search_path = public`, retornando apenas boolean, consultando `user_roles` por `auth.uid()` — sem confiar em nada vindo do navegador e sem recursão de RLS. `EXECUTE` revogado de `PUBLIC` e `anon`, concedido apenas a `authenticated` e `service_role`.

## Grants

- `REVOKE ALL` de `anon` nas seis tabelas.
- `authenticated`: mantém SELECT/INSERT/UPDATE/DELETE (o controle efetivo passa a ser RLS).
- `service_role`: mantém `ALL`.

## Impacto por módulo

- **Chat ao Vivo, Contatos, Pipeline, Agendamentos**: inalterados para admin, manager e sdr — são exatamente os papéis que já usam essas telas.
- **Cérebro / Configurações**: continuam funcionando para admin; manager passa a ter apenas leitura das configurações; sdr perde o acesso direto (a UI já não expõe essas telas para ele).
- **NINA, WhatsApp, Shopify, sender, filas, envio de rastreio**: nenhum impacto — todas as edge functions usam `service_role`, que faz bypass de RLS.
- **expedicao**: perde qualquer leitura direta da base de clientes e conversas; a página de rastreio não depende dessas tabelas no cliente.

## Migration atômica (estrutura)

1. `BEGIN`.
2. `CREATE OR REPLACE` das funções auxiliares + `REVOKE`/`GRANT` de EXECUTE.
3. `DROP POLICY` das seis policies amplas.
4. `CREATE POLICY` das 28 policies por comando.
5. Bloco de validação: verifica que as seis tabelas seguem com RLS habilitado, que nenhuma policy ampla sobrou, que cada tabela tem o número esperado de policies, e que `anon` não tem mais privilégios.
6. Asserts com identidades controladas: usando `set_config('request.jwt.claims', ...)` e `SET LOCAL ROLE authenticated`, simula um usuário de cada papel (admin, manager, sdr, expedicao, sem papel) e confirma permitido/bloqueado em cada comando. Qualquer divergência dispara `RAISE EXCEPTION`.
7. `COMMIT` apenas se tudo passar; qualquer exceção aborta a transação inteira, sem estado parcial.

Os usuários de teste dos asserts são criados e removidos dentro da mesma transação, sem tocar em contas reais e sem ler dados de clientes.

## Testes pós-migração

Banco (identidades controladas, sem exibir dados):

- Cada comando em cada uma das seis tabelas para admin, manager, sdr, expedicao, papel inexistente e anon.
- Confirmação explícita de bloqueio total de `expedicao` nas seis tabelas.
- Linter de segurança do backend.

Aplicação (smoke):

- Chat ao Vivo: abrir conversa, enviar mensagem, atualizar status, finalizar atendimento.
- Pipeline: criar e mover negócio.
- Contatos: listar, criar, editar.
- Agendamentos: criar e listar.
- Configurações: leitura e gravação como admin; leitura como manager; bloqueio como sdr.
- NINA: webhook de entrada gerando resposta (service_role).
- Shopify: recebimento de evento e trava compartilhada mantida ativa.
- Envio de rastreio: continua desligado (`MANUAL_TRACKING_SEND_ENABLED` ausente) e a rota permanece inacessível para sdr.

## Rollback

Script único que remove as 28 policies novas, recria as seis policies amplas originais com o texto exato de hoje, restaura os privilégios de `anon` e remove as funções auxiliares criadas. Executável em uma transação, restaurando o estado atual byte a byte.

## Invariantes mantidas

- `MANUAL_TRACKING_SEND_ENABLED` desligado.
- Leticia permanece `sdr`, mesmo user_id, e-mail e senha.
- Shopify, templates, webhook, sender, filas e históricos intactos.
