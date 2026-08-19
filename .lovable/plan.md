# Página interna "Envio de rastreio" (manual_tracking) — v3

Nada foi implementado. Nenhum template foi criado, reenviado ou excluído.

## 0. Verificação da sincronização de templates (feita agora, somente leitura no banco)

Estado real dos registros hoje:

```text
pedido_enviado           APPROVED  pt_BR UTILITY  meta_id 4390108104576435  updated_at 14/08 11:51
pedido_enviado_correios  PENDING   pt_BR UTILITY  meta_id 1076577855069784  updated_at 19/08 13:13
pedido_enviado_jadlog    PENDING   pt_BR UTILITY  meta_id 3697446527080997  updated_at 19/08 13:15
```

Respostas às perguntas:

1. **Qual função consulta a Meta**: a edge function `sync-template-status`, chamada pelo hook `useMetaTemplates.syncStatuses()` a partir do botão "Sincronizar" em `/templates`.
2. **IDs e WABA corretos?** A consulta **não usa os IDs dos templates**. Ela lista `GET /{waba_id}/message_templates` com `fields=name,language,status,category,components,id`. O `waba_id` vem de `nina_settings.whatsapp_business_account_id`; se estiver vazio a função retorna erro 400 (ver item 6). Como os dois templates novos já têm `meta_template_id` gravado, eles foram aceitos pela Meta na submissão — mas a sincronização os reencontra pela listagem, não por ID.
3. **Paginação**: sim, existe — segue `paging.next` até 20 páginas, com `limit=200`. Não é a causa.
4. **O status é salvo?** Sim, mas **só quando muda**: o `UPDATE` só ocorre se `local.status !== t.status` ou o `meta_template_id` diferir. Se a Meta ainda responde `PENDING`, nada é escrito e `updated_at` permanece o da submissão — exatamente o que os registros mostram.
5. **A interface lê cache?** Não. `useMetaTemplates` refaz o `select` após o sync e ainda escuta `postgres_changes` em `meta_templates`. A tela reflete o banco.
6. **Erro silencioso?** **Sim, existe um caminho real.** `syncStatuses()` verifica apenas o `error` de transporte do `functions.invoke`; **não verifica `data.error`** (ao contrário de `submit()`, que verifica). Ou seja, se a função responder 400 com `{ error: "whatsapp_business_account_id ausente…" }` ou um erro da Graph API (token expirado, escopo `whatsapp_business_management` faltando), a tela mostra **"Status atualizado"** sem ter atualizado nada. O array `errors[]` por template também é ignorado pela UI.
7. **Localização por nome ou ID?** Por **`name + language`** (`keyOf(name, language)`). O `meta_template_id` só é comparado para decidir se atualiza. Nomes distintos (`_correios`, `_jadlog`) não conflitam, então isso não bloqueia — mas é frágil se a Meta renomear/duplicar idioma.

**Conclusão do diagnóstico**: há duas hipóteses vivas e elas se distinguem por uma única leitura na Meta:
- (A) a Meta realmente ainda retorna `PENDING` para os dois (aprovação de UTILITY costuma levar de minutos a 24h) — nesse caso o sync está correto e não há bug de dados;
- (B) o sync está falhando silenciosamente (WABA ausente/token) e a tela mente com "Status atualizado".

**Consulta ao vivo na Meta**: não é possível em modo Plan sem ler o `whatsapp_access_token` do banco e disparar uma chamada externa — não farei isso agora. **Primeiro passo da implementação** (antes de qualquer código novo): chamar `GET /{waba_id}/message_templates?fields=name,language,status,id&limit=200` e também `GET /{meta_template_id}?fields=name,status,category,components` para `3697446527080997` e `1076577855069784`, apenas leitura, e reportar o status exato. Nenhuma submissão, nenhuma exclusão, nenhum reenvio.

**Correção mínima que entra nesta entrega** (não altera o fluxo Shopify):
- `useMetaTemplates.syncStatuses()` passa a checar `data.error` e a propagar `errors[]`; o toast só diz "Status atualizado" quando a função realmente retornou sucesso, e informa quantos foram atualizados.
- `sync-template-status` ganha um retorno explícito de `unchanged` e, opcionalmente, uma verificação por ID (`GET /{meta_template_id}`) para linhas que possuem `meta_template_id` mas não aparecem na listagem — cobre o caso de template invisível na paginação por filtro da Meta.
- Nada de renomear, recriar ou reenviar templates.

## 1. Templates usados pela página manual (substituem `pedido_enviado` nesta página)

| Transportadora | Template | Meta ID | Status hoje |
|---|---|---|---|
| Correios | `pedido_enviado_correios` | 1076577855069784 | PENDING |
| Jadlog | `pedido_enviado_jadlog` | 3697446527080997 | PENDING |

Corpo aprovado (3 variáveis, link fixo no próprio corpo):

```text
Boa notícia, {{1}}! Seu pedido {{2}} foi enviado pelos Correios.
Código de rastreio: {{3}}
Acompanhe sua entrega em: https://rastreamento.correios.com.br/
```

Regras derivadas:
- `{{1}}` primeiro nome do cliente · `{{2}}` número do pedido normalizado (`cleanOrderNumber`, ex. `#1885`) · `{{3}}` código de rastreio.
- **Nenhuma segunda mensagem de texto**, **nenhum botão dinâmico**, **nenhum link extra**. O link já está no corpo.
- O Chat ao Vivo grava **exatamente** o corpo aprovado do template escolhido, com as três variáveis substituídas — nada anexado.
- `pedido_enviado` (4 variáveis) **permanece intacto** e continua sendo usado **apenas** pelo fluxo automático da Shopify. A página manual **nunca** o usa, nem como fallback.

## 2. Bloqueio por status (pré-condição rígida)

Antes de qualquer trava ou enfileiramento, `send-manual-tracking` lê `meta_templates` e exige, para o template correspondente à transportadora:

- `name` = `pedido_enviado_correios` ou `pedido_enviado_jadlog` (conforme seleção);
- `language` = `pt_BR`;
- `category` = `UTILITY`;
- `status` = `APPROVED`;
- BODY com exatamente **3 variáveis** (`{{1}}`, `{{2}}`, `{{3}}` presentes e sem `{{4}}`).

Falhando qualquer condição — inclusive template inexistente, `PENDING`, `REJECTED` ou `PAUSED`:
- **não** cria trava de deduplicação, **não** insere em `send_queue`, **não** chama a Meta;
- retorna `template_not_approved` e a UI exibe: **"Este template ainda não está aprovado pela Meta."**

Consequência prática: enquanto os dois templates estiverem PENDING, a página existe mas não envia nada — o que é o comportamento desejado.

## 3. O que já existe e será reutilizado (sem alterar comportamento)

| Peça atual | Uso na página manual |
|---|---|
| `_shared/shopify.ts` → `normalizePhone`, `cleanOrderNumber` | importadas sem alteração |
| `send_queue` (`message_type: 'template'`) | mesmo formato de enfileiramento |
| `whatsapp-sender` | único ponto de envio à Meta; grava em `messages` |
| `contacts` / `conversations` | mesma resolução por telefone |
| `meta_templates` | validação do §2 |
| `shopify_shipment_notifications` | **permanece intocada** |
| `App.tsx`, `Sidebar.tsx`, `RoleGate.tsx`, `useUserRole.ts` | rota e controle de acesso |

Verificado: `send_queue` **não** aciona a IA — `nina_processing_queue` só é alimentada pelo `whatsapp-webhook` a partir de mensagens recebidas do cliente.

## 4. O que será criado

**Banco (tudo novo)**
- `public.tracking_send_locks`: `tracking_key text` (código normalizado: `upper`, sem espaços/hífens) **UNIQUE**, `source` (`shopify` | `manual_tracking`), `status` (`processing` | `sent` | `failed`), `template_name`, `carrier`, `order_number`, `phone_number`, `customer_name`, `sent_by uuid`, `send_queue_id uuid`, `error_message`, `created_at`, `updated_at`.
  - **Seed**: `INSERT ... SELECT DISTINCT ON (tracking_key)` das linhas `sent` de `shopify_shipment_notifications`, gravadas como `sent`/`shopify`. Insert em tabela nova; nenhuma linha original alterada.
- `public.manual_tracking_logs`: auditoria por tentativa (§8).
- RLS + GRANTs nas duas; escrita só por service_role.

**Backend**
- `send-manual-tracking` (nova): valida JWT + papel no servidor → valida campos → **valida template (§2)** → normaliza telefone e pedido → adquire trava → enfileira → retorna `queued` | `duplicate` | `template_not_approved` | `invalid`.
- `shopify-webhook`: **um único acréscimo** — após a trava atual (`fulfillment_id + tracking_number`, mantida como está), tentar também `tracking_send_locks`. Conflito → `skipped_duplicate` (comportamento já existente). HMAC, tópicos, filtros, retry de `failed` e o template `pedido_enviado` permanecem idênticos.

**Frontend**
- `src/pages/TrackingSend.tsx`, `src/hooks/useManualTracking.ts`, rota `/tracking` oculta no menu.
- Ajuste pontual em `useMetaTemplates.syncStatuses()` (§0).

## 5. Deduplicação compartilhada — atômica, em tabela nova

Chave: **somente o código de rastreio normalizado**. O envio manual não conhece o `fulfillment_id`, então o código é a única chave capaz de ligar as duas origens.

```text
INSERT INTO tracking_send_locks (tracking_key, source, status='processing')
  ├─ sucesso  -> segue para send_queue
  └─ conflito (unique violation)
       └─ UPDATE ... SET status='processing', source=<origem>
          WHERE tracking_key=$1 AND status='failed'   -- claim atômico condicional
             ├─ 1 linha  -> retry permitido
             └─ 0 linhas -> BLOQUEADO: "Este código de rastreio já foi enviado."
```

Cobertura: clique duplo · manual e Shopify simultâneos · manual antes do webhook · webhook antes do manual (inclusive histórico via seed) · retry apenas de `failed`. `sent` e `processing` nunca liberam. Falha após a trava devolve a linha para `failed`.

A dedup antiga por `fulfillment_id + tracking_number` continua ativa e é avaliada **antes** da nova.

## 6. Status real do envio (sem "Enviado" prematuro)

- Resposta imediata: `queued` (com `send_queue_id`) → UI mostra **"Aguardando processamento"**.
- A página acompanha por realtime/polling: `send_queue.status = 'completed'` **e** `whatsapp_message_id` presente → **Enviado**; `failed` → **Falhou** com o erro; timeout → permanece **Aguardando**.
- `tracking_send_locks.status` vira `sent`/`failed` a partir do resultado real, não do enfileiramento. O `whatsapp-sender` **não é alterado**: a conciliação é feita na leitura e pelo `send_queue_id` guardado na trava.
- O formulário só é limpo quando o estado chega a **Enviado**.

## 7. Controle de acesso

- Enum atual `app_role`: `admin`, `manager`, `sdr`, `user`. Não existe papel de expedição.
- Nesta entrega: `RoleGate area="tracking"` liberado **somente para `admin` e `manager`**. Nenhuma permissão existente é ampliada.
- Futuro papel `expedicao` (fora desta entrega): mapear apenas `['tracking']`.
- A edge function valida o JWT e consulta `user_roles` no servidor; a checagem de UI não é a garantia.

## 8. Publicação em duas etapas e segurança durante a implementação

1. Página **oculta no menu**, acessível só por URL direta atrás do RoleGate.
2. **Interruptor de envio desligado por padrão**.
3. Nenhum telefone de cliente em teste; nenhum envio real sem sua autorização e um número seu.
4. Nenhum evento antigo reprocessado; nenhum registro antigo alterado.
5. Fluxo Shopify, HMAC, dedup atual, Chat ao Vivo e IA preservados.
6. Liberação no menu só após: envio manual validado + novo teste assinado do webhook Shopify confirmando o fluxo automático intacto.

## 9. Histórico

`manual_tracking_logs` registra por tentativa: usuário, pedido, nome, telefone normalizado, transportadora, template usado, código, `send_queue_id`, resultado (`queued` → `sent` | `failed` | `duplicate` | `template_not_approved` | `invalid`), erro, timestamps.

## 10. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Enviar com template não aprovado | validação obrigatória do §2 antes da trava |
| Fallback indevido para `pedido_enviado` | proibido explicitamente; nome derivado da transportadora |
| Quebrar a dedup da Shopify | tabela e índice atuais intocados; trava nova é adicional |
| Alterar registros históricos | nenhuma escrita em `shopify_shipment_notifications` / `shopify_events` |
| Duplicidade entre origens | `UNIQUE(tracking_key)` + claim condicional atômico |
| Sucesso falso na UI | estado derivado de `send_queue`/`messages` |
| Sync mentindo "Status atualizado" | `data.error`/`errors[]` passam a ser verificados |
| Página disparar a IA | `send_queue` não alimenta `nina_processing_queue` (verificado) |

## 11. Testes antes de qualquer publicação

Sem envio real: template PENDING → bloqueio com a mensagem exata · transportadora sem template correspondente · campos vazios · telefone inválido e normalização · clique duplo concorrente · rastreio duplicado manual · rastreio vindo do seed Shopify · manual seguido de webhook assinado com o mesmo código (`skipped_duplicate`) · retry de `failed` · `nina_processing_queue` sem novas linhas · contagem e hash de status de `shopify_events` e `shopify_shipment_notifications` antes/depois.

Com envio real (após sua autorização, número seu, template APPROVED): Aguardando → Enviado · corpo no Chat ao Vivo idêntico ao recebido · falha simulada e retry.

## 12. Ordem de implementação

1. Leitura ao vivo na Meta dos dois IDs + listagem do WABA; reportar status exato (somente leitura).
2. Correção do erro silencioso no botão Sincronizar.
3. Migração: `tracking_send_locks` (+ seed) e `manual_tracking_logs`, com RLS e GRANTs.
4. Edge function `send-manual-tracking` com a validação de template do §2.
5. Acréscimo mínimo da trava nova no `shopify-webhook`.
6. Frontend com rota oculta, interruptor desligado e acesso admin/manager.
7. Bateria de testes sem envio real.
8. Teste real após sua autorização (depende dos templates ficarem APPROVED).
9. Novo teste assinado do webhook Shopify.
10. Liberação do item no menu.

## 13. Rollback

Remover rota/página e a edge function; reverter o bloco isolado no `shopify-webhook`; `DROP TABLE tracking_send_locks` e `manual_tracking_logs`. Nada em `shopify_shipment_notifications`, `shopify_events` ou `meta_templates` foi tocado, então o fluxo Shopify volta ao estado atual sem perda de registro.
