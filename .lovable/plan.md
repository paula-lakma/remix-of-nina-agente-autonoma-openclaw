# Página interna "Envio de rastreio" (manual_tracking) — v4

Nada foi implementado. Nenhum template foi criado, reenviado ou excluído.

## 0. Verificação da sincronização de templates (leitura no banco, feita)

Estado real dos registros hoje:

```text
pedido_enviado           APPROVED  pt_BR UTILITY  meta_id 4390108104576435  updated_at 14/08 11:51
pedido_enviado_correios  PENDING   pt_BR UTILITY  meta_id 1076577855069784  updated_at 19/08 13:13
pedido_enviado_jadlog    PENDING   pt_BR UTILITY  meta_id 3697446527080997  updated_at 19/08 13:15
```

1. **Função que consulta a Meta**: edge function `sync-template-status`, acionada por `useMetaTemplates.syncStatuses()` no botão "Sincronizar" em `/templates`.
2. **IDs e WABA**: a consulta **não usa os IDs**. Lista `GET /{waba_id}/message_templates` com `fields=name,language,status,category,components,id`; `waba_id` vem de `nina_settings.whatsapp_business_account_id` (se vazio, a função devolve 400).
3. **Paginação**: existe (`paging.next`, até 20 páginas, `limit=200`). Não é a causa.
4. **O status é salvo?** Sim, mas **só quando muda** (`local.status !== t.status` ou `meta_template_id` diferente). Se a Meta ainda responde PENDING, nada é escrito e `updated_at` continua o da submissão — exatamente o que se vê.
5. **A UI lê cache?** Não. Refaz o `select` após o sync e escuta `postgres_changes` em `meta_templates`.
6. **Erro silencioso?** **Sim.** `syncStatuses()` verifica só o erro de transporte do `functions.invoke`; **não verifica `data.error`** (o `submit()` verifica). Um 400 (`waba_id` ausente, token expirado, escopo `whatsapp_business_management` faltando) produz o toast "Status atualizado" sem atualizar nada. O array `errors[]` por template também é ignorado.
7. **Localização por nome ou ID?** Por `name + language`. O `meta_template_id` só entra na comparação para decidir o update.

**Duas hipóteses**: (A) a Meta realmente responde PENDING e o sync está correto; (B) o sync falha em silêncio. Distinguir exige uma leitura ao vivo, que **não farei em modo Plan** (exigiria ler o token do banco e chamar a Graph API).

## 1. Ordem de segurança (obrigatória, antes de tudo)

**Etapa 1 — leitura ao vivo na Meta (somente leitura)**
- `GET /{waba_id}/message_templates?fields=name,language,status,id&limit=200`
- `GET /3697446527080997?fields=name,status,category,components`
- `GET /1076577855069784?fields=name,status,category,components`
- Nenhuma submissão, exclusão ou reenvio.

**Etapa 2 — correção do erro silencioso do botão Sincronizar** (`data.error` + `errors[]` verificados; toast só afirma sucesso quando houve sucesso; retorno distingue `updated` de `unchanged`; consulta por ID como complemento para linhas que têm `meta_template_id` e não aparecem na listagem).

**Portões de parada:**
- Erro de autenticação, WABA incorreto ou permissão ausente na Etapa 1 → **implementação interrompida**, apenas o erro é reportado. **Nenhuma alteração no `shopify-webhook`.**
- Templates realmente PENDING → a página pode ser construída **oculta e com envio desligado**; **nenhum teste real** e **nenhuma liberação para a expedição**.
- Só após as Etapas 1 e 2 concluídas com sucesso o `shopify-webhook` pode ser tocado.

## 2. Templates usados pela página manual

| Transportadora | Template | Meta ID | Status hoje |
|---|---|---|---|
| Correios | `pedido_enviado_correios` | 1076577855069784 | PENDING |
| Jadlog | `pedido_enviado_jadlog` | 3697446527080997 | PENDING |

Corpo aprovado (3 variáveis, link fixo no corpo):

```text
Boa notícia, {{1}}! Seu pedido {{2}} foi enviado pelos Correios.
Código de rastreio: {{3}}
Acompanhe sua entrega em: https://rastreamento.correios.com.br/
```

- `{{1}}` primeiro nome · `{{2}}` pedido normalizado (`cleanOrderNumber`, ex. `#1885`) · `{{3}}` código de rastreio.
- **Nenhuma segunda mensagem**, **nenhum botão dinâmico**, **nenhum link extra**.
- O Chat ao Vivo grava exatamente o corpo aprovado com as três variáveis substituídas.
- `pedido_enviado` (4 variáveis) permanece intacto, usado **somente** pelo fluxo Shopify. A página manual nunca o usa, nem como fallback.

## 3. Bloqueio por status do template

Antes de qualquer trava ou enfileiramento, `send-manual-tracking` exige do template correspondente à transportadora: `name` correto, `language = pt_BR`, `category = UTILITY`, `status = APPROVED`, BODY com exatamente 3 variáveis (`{{1}}`–`{{3}}`, sem `{{4}}`).

Falhando qualquer condição (inclusive inexistente, PENDING, REJECTED, PAUSED): **não cria trava**, **não enfileira**, **não envia**; retorna `template_not_approved` e a UI mostra **"Este template ainda não está aprovado pela Meta."**

## 4. Coordenação entre a trava antiga e a nova (correção central da v4)

### 4.1 Problema da v3
Na v3, o webhook adquiria a trava antiga (`shopify_shipment_notifications`, chave `fulfillment_id + tracking_number`) e **depois** tentava a nova (`tracking_send_locks`, chave `tracking_key`). Se a nova falhasse, o registro antigo já estaria em `processing` — e como nada o devolveria a `failed`, aquele fulfillment ficaria **bloqueado para sempre**. Isso é inaceitável e está corrigido abaixo.

### 4.2 Correção: uma única função transacional
Toda aquisição, compensação e liberação passa a ocorrer dentro de **uma função `SECURITY DEFINER` no banco**, chamada por RPC, executada em uma única transação:

```text
public.acquire_tracking_send_lock(
  p_tracking_key, p_source, p_fulfillment_id, p_order_number,
  p_phone, p_carrier, p_customer_name, p_template_name, p_sent_by
) RETURNS ('acquired' | 'duplicate' | 'retry_claimed')
```

Regras internas, na mesma transação:

```text
BEGIN
  -- (a) trava antiga (só quando p_fulfillment_id existe = origem Shopify)
  INSERT INTO shopify_shipment_notifications (... status='processing')
    ON CONFLICT (fulfillment_id, tracking_number) DO NOTHING
  se conflito:
     UPDATE ... SET status='processing' WHERE status='failed'   -- claim condicional
     se 0 linhas -> RETURN 'duplicate'                          -- nada foi escrito
  -- (b) trava nova, compartilhada
  INSERT INTO tracking_send_locks (tracking_key, source, status='processing')
    ON CONFLICT (tracking_key) DO NOTHING
  se conflito:
     UPDATE ... SET status='processing', source=p_source
       WHERE tracking_key=p_tracking_key AND status='failed'
     se 0 linhas -> ROLLBACK  -> RETURN 'duplicate'
COMMIT
```

O `ROLLBACK` é o ponto-chave: como (a) e (b) estão na **mesma transação**, a falha em (b) **desfaz automaticamente** a escrita em (a). Nunca sobra um registro antigo preso em `processing` por causa da trava nova. Não há compensação manual a esquecer.

A liberação também é atômica, por uma segunda função:

```text
public.release_tracking_send_lock(p_tracking_key, p_fulfillment_id, p_result)
  p_result='sent'   -> ambas as linhas viram 'sent'
  p_result='failed' -> ambas as linhas voltam para 'failed'   (reivindicáveis)
```

Chamada obrigatoriamente em `finally`: se o enfileiramento em `send_queue` falhar depois da trava adquirida, as **duas** linhas voltam a `failed`.

### 4.3 Os quatro cenários perguntados

| Cenário | Comportamento na v4 |
|---|---|
| Shopify pega a trava antiga, mas a nova já está `processing` por um envio manual | A transação inteira faz `ROLLBACK`: a linha antiga **não é gravada** como `processing`. O webhook responde `skipped_duplicate`. O fulfillment continua reivindicável no futuro. |
| O envio manual que detinha a nova trava falha depois disso | `release_tracking_send_lock(..., 'failed')` devolve a chave a `failed`. Uma nova tentativa (manual **ou** um novo webhook da Shopify para o mesmo fulfillment) reivindica normalmente. Nenhuma mensagem foi enviada e nenhuma origem fica bloqueada. |
| Shopify pega a trava antiga e falha antes de enfileirar | O `finally` chama `release(..., 'failed')`; se o processo morrer antes disso, entra a rede de segurança do §4.4. |
| Duas origens disputam o mesmo código ao mesmo tempo | O `INSERT` com `UNIQUE(tracking_key)` serializa no banco: uma transação vence e envia; a outra recebe `duplicate` e não escreve nada (rollback). Exatamente um WhatsApp. |

### 4.4 Rede de segurança contra `processing` órfão
Um crash entre o `COMMIT` da trava e o `finally` deixaria `processing` sem dono. Mitigação: **`processing` expira**. Linhas em `processing` com `updated_at` anterior a **30 minutos** e sem `send_queue_id` ativo (`send_queue` inexistente, `completed` ou `failed`) são tratadas como `failed` pela cláusula de claim das duas funções. Assim a garantia "nada fica bloqueado para sempre" vale mesmo em falha catastrófica, sem afrouxar a dedup em operação normal.

### 4.5 Invariantes garantidos
- `sent` e `processing` (ativo) bloqueiam duplicidade.
- `failed` — e `processing` expirado — podem ser reivindicados com segurança, por claim condicional atômico.
- Nenhuma combinação de falhas deixa as duas origens bloqueadas sem mensagem enviada (rollback + release + expiração).
- A dedup por `fulfillment_id + tracking_number` **continua existindo** e é avaliada primeiro, dentro da mesma transação.
- **Nenhuma linha histórica é alterada**: as funções só escrevem em linhas novas ou em linhas em `failed`/`processing` expirado; linhas `sent` nunca são tocadas.
- A página manual permanece **desativada durante toda a migração**.
- **Imediatamente antes de liberar a página**, roda um **seed idempotente final** (`INSERT ... SELECT DISTINCT ON (tracking_key) ... ON CONFLICT DO NOTHING`) trazendo de `shopify_shipment_notifications` os rastreios `sent` e os `processing` **realmente ativos** (dentro da janela de 30 min). Idempotente: pode rodar quantas vezes for preciso sem alterar a origem nem sobrescrever travas existentes.

## 5. Estruturas novas

**Banco**
- `public.tracking_send_locks`: `tracking_key text UNIQUE` (normalizado: `upper`, sem espaços/hífens), `source` (`shopify` | `manual_tracking`), `status` (`processing` | `sent` | `failed`), `template_name`, `carrier`, `order_number`, `phone_number`, `customer_name`, `sent_by uuid`, `send_queue_id uuid`, `error_message`, `created_at`, `updated_at`.
- `public.manual_tracking_logs`: auditoria por tentativa (§8).
- Funções `acquire_tracking_send_lock` e `release_tracking_send_lock` (`SECURITY DEFINER`, `search_path = public`), executáveis apenas por `service_role`.
- RLS + GRANTs nas duas tabelas; escrita só por `service_role`. `expedicao`, `admin` e `manager` podem **ler** `manual_tracking_logs` e `tracking_send_locks` (histórico da página), nada além.
- Seed inicial e seed final conforme §4.5.

**Backend**
- `send-manual-tracking` (nova): valida JWT → valida papel no servidor (§6) → valida campos → valida template (§3) → normaliza telefone/pedido → RPC de aquisição → enfileira em `send_queue` → `release` no `finally`. Retorna `queued` | `duplicate` | `template_not_approved` | `forbidden` | `invalid`.
- `shopify-webhook`: substitui o bloco de trava atual pela chamada da RPC (mesma semântica, agora transacional) e chama `release` no `finally`. HMAC, tópicos, filtros, retry de `failed` e o template `pedido_enviado` permanecem idênticos. Só é tocado após o §1.

**Frontend**
- `src/pages/TrackingSend.tsx`, `src/hooks/useManualTracking.ts`, rota `/tracking` oculta no menu, interruptor de envio desligado por padrão.
- Ajuste em `useMetaTemplates.syncStatuses()` (§1, Etapa 2).

## 6. Papel `expedicao`

**Migração do enum** — `ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'expedicao';`
- `ADD VALUE` é aditivo: não altera, não remove e não reordena valores existentes. **Nenhuma linha de `user_roles` é modificada** — nenhum usuário atual muda de papel.
- Postgres exige que o novo valor seja adicionado em transação própria antes de ser usado em outra; a migração portanto separa o `ADD VALUE` do restante (duas migrações, ou `ADD VALUE` isolado no início).
- Nenhuma política RLS existente é reescrita; `has_role(uuid, app_role)` continua funcionando sem alteração.
- A atribuição do papel a pessoas reais é feita depois, manualmente, inserindo em `user_roles` — não faz parte desta migração.

**Permissões**
- `ROLE_PERMISSIONS.expedicao = ['tracking']` — nada de dashboard, pipeline, chat, contacts, scheduling, campaigns, templates, team, cerebro, settings.
- `admin` e `manager` também recebem `'tracking'`. `sdr` e `user` **não**.
- Prioridade de resolução em `useUserRole`: `admin > manager > moderator > sdr > expedicao > user` (expedição nunca eleva ninguém).
- Redirecionamento: um usuário `expedicao` que abrir qualquer outra rota vai para `/tracking`.

**Validação no backend** (a garantia real, não a UI): `send-manual-tracking` resolve o usuário pelo JWT (`_shared/userauth.ts`) e consulta `user_roles` com `service_role`, aceitando apenas `admin`, `manager` ou `expedicao`; qualquer outro → `403 forbidden`, sem trava, sem fila, sem envio.

**Limites do papel**: só a página Envio de rastreio; leitura apenas do histórico dessa página; nenhuma permissão de escrita em templates, configurações, integrações ou outros módulos (garantido pelas policies — `expedicao` não recebe GRANT/policy em nenhuma outra tabela).

## 7. Status real do envio (sem "Enviado" prematuro)

- Resposta imediata: `queued` com `send_queue_id` → UI mostra **"Aguardando processamento"**.
- Acompanhamento por realtime/polling: `send_queue.status = 'completed'` **e** `whatsapp_message_id` presente → **Enviado**; `failed` → **Falhou** com o erro; timeout → permanece **Aguardando** (nunca "Enviado").
- As travas viram `sent`/`failed` a partir do resultado real, não do enfileiramento. O `whatsapp-sender` não é alterado.
- O formulário só é limpo no estado **Enviado**.

## 8. Histórico

`manual_tracking_logs` registra por tentativa: usuário, papel, pedido, nome, telefone normalizado, transportadora, template usado, código, `send_queue_id`, resultado (`queued` → `sent` | `failed` | `duplicate` | `template_not_approved` | `forbidden` | `invalid`), erro, timestamps.

## 9. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Registro antigo preso em `processing` | aquisição das duas travas na mesma transação + rollback + release em `finally` + expiração de 30 min |
| Enviar com template não aprovado | validação obrigatória do §3 antes de qualquer trava |
| Fallback indevido para `pedido_enviado` | proibido; nome derivado da transportadora |
| Alterar registros históricos | funções só escrevem em linhas novas, `failed` ou `processing` expirado; `sent` intocado |
| Duplicidade entre origens | `UNIQUE(tracking_key)` + claim condicional atômico dentro de transação |
| Escalonar privilégio via `expedicao` | permissão única `tracking`, validada no servidor; sem GRANT em outras tabelas |
| Sucesso falso na UI | estado derivado de `send_queue`/`messages` |
| Sync mentindo "Status atualizado" | `data.error`/`errors[]` verificados (Etapa 2) |
| Página disparar a IA | `send_queue` não alimenta `nina_processing_queue` (verificado) |

## 10. Testes antes de qualquer publicação

Sem envio real: template PENDING → mensagem exata de bloqueio · transportadora sem template · campos vazios · telefone inválido e normalização · clique duplo concorrente · manual e webhook simultâneos com o mesmo código (exatamente um vence) · **falha na trava nova após a antiga → verificar que a linha antiga não ficou `processing`** · falha após aquisição → ambas voltam a `failed` e nova tentativa funciona · `processing` órfão além de 30 min é reivindicável · retry de `failed` · `expedicao` acessa só `/tracking` e recebe `forbidden` em chamadas indevidas · `sdr`/`user` bloqueados na UI e no backend · `nina_processing_queue` sem novas linhas · contagem e hash de status de `shopify_events` e `shopify_shipment_notifications` antes/depois.

Com envio real (após sua autorização, número seu, template APPROVED): Aguardando → Enviado · corpo no Chat ao Vivo idêntico ao recebido · falha simulada e retry.

## 11. Ordem de implementação

1. Leitura ao vivo na Meta dos dois IDs + listagem do WABA (somente leitura). **Erro de auth/WABA/permissão → parar e reportar.**
2. Correção do erro silencioso do botão Sincronizar.
3. Migração A: `ALTER TYPE app_role ADD VALUE 'expedicao'` (isolada).
4. Migração B: `tracking_send_locks`, `manual_tracking_logs`, funções de aquisição/liberação, RLS, GRANTs, seed inicial idempotente.
5. Edge function `send-manual-tracking` (validação de papel + template + RPC).
6. `shopify-webhook` migrado para a RPC transacional — **somente após 1 e 2**.
7. Frontend com rota oculta, envio desligado, acesso `admin`/`manager`/`expedicao`.
8. Bateria de testes sem envio real (§10).
9. Teste real após sua autorização e com templates APPROVED.
10. Novo teste assinado do webhook Shopify.
11. **Seed idempotente final** (`sent` + `processing` ativos).
12. Liberação do item no menu e atribuição do papel `expedicao` às pessoas.

## 12. Rollback

Remover rota/página e a edge function; reverter o `shopify-webhook` para o bloco de trava anterior (mudança isolada); `DROP FUNCTION` das duas RPCs; `DROP TABLE tracking_send_locks, manual_tracking_logs`. O valor `expedicao` do enum permanece (Postgres não remove valores), inofensivo enquanto não houver `user_roles` apontando para ele. Nada em `shopify_shipment_notifications`, `shopify_events` ou `meta_templates` foi alterado, então o fluxo Shopify volta ao estado atual sem perda de registro.
