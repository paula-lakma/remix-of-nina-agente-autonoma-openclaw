# Validação final: correção da duplicidade de `orders/updated` (read-only)

Nada foi alterado. Esta validação vem de leitura do código, dos índices do banco e de 767 eventos `orders/updated` já gravados.

## 1. Causa raiz confirmada

Uma atualização `pending -> paid` sem rastreio gera a mesma chave do primeiro evento do pedido. O webhook a descarta como duplicada antes de gravar, então ela nunca chega a `shopify_events` nem a `orders`.

## 2. Onde está a chave

- **Onde é gerada:** `supabase/functions/_shared/shopify.ts`, função `normalizeShopifyPayload`, campo `event_id` (linhas 142–144).
- **Onde é verificada:** `supabase/functions/shopify-webhook/index.ts`, função `process`, linhas 108–119. O webhook procura `shopify_events.shopify_event_id` e sai sem gravar se encontrar.
- **Onde é persistida:** coluna `shopify_events.shopify_event_id`, com índice único parcial `shopify_events_event_id_key`.

Lógica atual:

```text
id  = admin_graphql_api_id | id | order.id
key = <topic>:<id>[:<tracking_number>]
```

## 3. Chave atual por tópico

| Tópico | Chave |
|---|---|
| orders/updated sem rastreio | `orders/updated:gid://shopify/Order/<id>` (igual em todas as atualizações) |
| orders/updated com rastreio | `orders/updated:gid://shopify/Order/<id>:<rastreio>` |
| fulfillments/create | `fulfillments/create:gid://shopify/Fulfillment/<id>:<rastreio>` |
| fulfillments/update | `fulfillments/update:gid://shopify/Fulfillment/<id>:<rastreio>` |

Como o tópico faz parte da chave, é possível isolar a mudança em `orders/updated`.

## 4. Chave decidida: Webhook ID da Shopify

A chave principal de `orders/updated` passa a ser o header `X-Shopify-Webhook-Id`:

```text
orders/updated:<X-Shopify-Webhook-Id>
```

- Um retry da mesma entrega mantém o mesmo Webhook ID e é descartado.
- Uma atualização real posterior do mesmo pedido chega com outro Webhook ID e é aceita.
- O header é lido em `index.ts` (hoje disponível via `req.headers`, mas não salvo) e repassado à normalização.
- A coluna `shopify_events.shopify_event_id` é do tipo `text` e o índice único continua valendo. Não precisa de migration.

## 5. Alternativa (somente sem o header)

Se `X-Shopify-Webhook-Id` estiver ausente ou vazio no request:

```text
orders/updated:<gid do pedido>:<updated_at bruto do payload>
```

- Nos 767 eventos: todos têm `updated_at` e há 767 combinações distintas de pedido + `updated_at`. Não há nenhuma colisão.
- Nos pares reais `pending -> paid`, o `updated_at` mudou entre os dois eventos. Um retry idêntico repete o `updated_at`.
- O sufixo do rastreio deixa de ser usado em `orders/updated`.
- `fulfillments/create` e `fulfillments/update` mantêm exatamente a lógica atual (`<topic>:<id>[:<rastreio>]`) e ignoram o header.

## 6. Impacto no rastreio e no WhatsApp

- `orders/updated` não está entre os tópicos de envio (`SHIP_TOPICS`) nem de confirmação (`CONFIRM_TOPICS`). Por isso `event_kind = unknown` e o evento termina em `send_status = ignored` na linha 144, **antes** de qualquer contato, conversa, `send_queue` ou trava de rastreio.
- Aceitar mais eventos `orders/updated` não gera mensagem, rastreio, fulfillment, handoff nem outra automação. Os dados confirmam: todos os eventos `orders/updated` gravados estão como `ignored`.
- Os avisos de rastreio vêm de `fulfillments/*` e continuam protegidos por três camadas: a chave própria (inalterada), o `UNIQUE(fulfillment_id, tracking_number)` em `shopify_shipment_notifications` e a trava compartilhada `tracking_send_locks`.

## 7. Impacto em `orders` / `order_items`

- `sync_shopify_order_payload` faz upsert em `orders` por `(source, source_order_id)`: atualiza a mesma linha e nunca cria outra.
- Versões mais antigas que a gravada (`updated_at_source` maior) são ignoradas.
- `order_items` usa upsert por `(order_id, source_line_item_id)` e remove itens que saíram do pedido, sem duplicar.
- `valid_order` é recalculado a cada upsert: com `paid`, sem cancelamento e sem teste, passa a `true`.

## 8. Cenários simulados (com a chave decidida)

| Cenário | Chave | Aceito? | shopify_events | orders | WhatsApp/rastreio |
|---|---|---|---|---|---|
| A. pending, depois paid (Webhook IDs diferentes) | `orders/updated:<wid1>` e `orders/updated:<wid2>` | ambos | 2 linhas, ignored | mesma linha passa a paid e válida | nada |
| B. retry do mesmo pending | `<wid1>` repetido | descartado | nada novo | nada | nada |
| C. retry do mesmo paid | `<wid2>` repetido | descartado | nada novo | nada | nada |
| D. paid sem rastreio, depois paid com rastreio | `<wid2>` e `<wid3>` | ambos | 2 linhas, ignored | mesma linha | o aviso sai só de `fulfillments/*` |
| E. rastreio repetido (`fulfillments/*`) | chave de fulfillment atual | descartado (ou `skipped_duplicate`) | no máximo 1 linha a mais | a reconciliação não altera | sem envio duplicado |
| F. sem header | `orders/updated:<gid>:<updated_at>` | conforme `updated_at` | idem A/B/C | idem | nada |

## 9. Arquivos, migration e rollback

- `supabase/functions/_shared/shopify.ts`: `normalizeShopifyPayload` recebe um `webhookId` opcional. Em `orders/updated`, monta a chave pelo Webhook ID ou pela alternativa. Os demais tópicos ficam sem mudança.
- `supabase/functions/shopify-webhook/index.ts`: apenas lê `X-Shopify-Webhook-Id` e o repassa em `process` e em `normalizeShopifyPayload`. O resto do fluxo não muda.
- Testes: um arquivo novo, `src/__tests__/shopify-orders-updated-idempotency.test.ts`.
- Depois da alteração, `shopify-webhook` é republicada.
- **Migration:** nenhuma.
- **Rollback:** reverter os dois arquivos e republicar a função. Não precisa desfazer nada no banco: os eventos extras são `ignored` e inofensivos.

## 10. Riscos residuais

- Logo após a publicação, um retry de um evento antigo chega com a chave nova e é gravado uma vez. Esse evento é `ignored` e a versão antiga é descartada em `orders`, sem efeito visível.
- `shopify_events` cresce um pouco mais (uma linha por atualização real).
- Os pedidos já `pending` com pagamento perdido não se corrigem sozinhos. A recuperação é uma etapa separada, que precisa de aprovação.

## 11. Testes exatos do futuro Build

1. `orders/updated` pending e paid do mesmo pedido com Webhook IDs diferentes: chaves diferentes, ambos aceitos.
2. Retry do mesmo pending com o mesmo Webhook ID: mesma chave, descartado.
3. Retry do mesmo paid com o mesmo Webhook ID: mesma chave, descartado.
4. Sem o header: a chave usa `order_id` + `updated_at`, e muda quando o `updated_at` muda.
5. As chaves de `fulfillments/create` e `fulfillments/update` ficam idênticas às atuais, com ou sem header.
6. `orders/updated` continua com `event_kind = unknown`, ou seja, sem envio.
7. Suíte completa e typecheck.
8. Depois de publicar: acompanhar o próximo `pending -> paid` real e confirmar 2 eventos e `valid_order = true` no mesmo pedido.

Aguardando a sua aprovação. Nada será implementado antes disso.
