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

## 4. Identificador nativo da Shopify

- A Shopify envia os headers `X-Shopify-Webhook-Id` (igual em retries da mesma entrega) e `X-Shopify-Event-Id` (mesmo evento).
- O endpoint recebe os headers, mas **não os salva** em lugar nenhum. Por isso não dá para confirmar com os dados reais como eles se comportam em retries ou em eventos diferentes.
- **Recomendação:** usar `updated_at`, que foi validado nos dados. O ID nativo pode ser registrado depois só para auditoria.

## 5. Chave proposta com `updated_at`

```text
orders/updated:<gid do pedido>:<updated_at bruto do payload>
```

- Nos 767 eventos: todos têm `updated_at` e há 767 combinações distintas de pedido + `updated_at`. Não há nenhuma colisão.
- Nos pares reais `pending -> paid` (2257, 2269 e outros), o `updated_at` mudou entre os dois eventos.
- Um retry idêntico reenvia o mesmo corpo, com o mesmo `updated_at`, e continua sendo descartado.
- Duas mudanças reais com o mesmo `updated_at` (mesmo segundo) não foram observadas. Mesmo que ocorram, o efeito é só perder uma versão intermediária; a seguinte corrige.
- O formato usa o texto ISO com fuso exatamente como vem da Shopify e tem prefixo fixo por tópico, então não colide com outros tópicos.
- O sufixo do rastreio deixa de ser necessário em `orders/updated`, porque `updated_at` já muda quando o rastreio entra.

## 6. Impacto no rastreio e no WhatsApp

- `orders/updated` não está entre os tópicos de envio (`SHIP_TOPICS`) nem de confirmação (`CONFIRM_TOPICS`). Por isso `event_kind = unknown` e o evento termina em `send_status = ignored` na linha 144, **antes** de qualquer contato, conversa, `send_queue` ou trava de rastreio.
- Aceitar mais eventos `orders/updated` não gera mensagem, rastreio, fulfillment, handoff nem outra automação. Os dados confirmam: todos os eventos `orders/updated` gravados estão como `ignored`.
- Os avisos de rastreio vêm de `fulfillments/*` e continuam protegidos por três camadas: a chave própria (inalterada), o `UNIQUE(fulfillment_id, tracking_number)` em `shopify_shipment_notifications` e a trava compartilhada `tracking_send_locks`.

## 7. Impacto em `orders` / `order_items`

- `sync_shopify_order_payload` faz upsert em `orders` por `(source, source_order_id)`: atualiza a mesma linha e nunca cria outra.
- Versões mais antigas que a gravada (`updated_at_source` maior) são ignoradas.
- `order_items` usa upsert por `(order_id, source_line_item_id)` e remove itens que saíram do pedido, sem duplicar.
- `valid_order` é recalculado a cada upsert: com `paid`, sem cancelamento e sem teste, passa a `true`.

## 8. Cenários simulados (com a chave proposta)

| Cenário | Chave | Aceito? | shopify_events | orders | WhatsApp/rastreio |
|---|---|---|---|---|---|
| A. pending sem rastreio, depois paid sem rastreio | `...:<upd1>` e `...:<upd2>` | ambos | 2 linhas, ignored | mesma linha passa a paid e válida | nada |
| B. retry do mesmo pending | `...:<upd1>` repetido | descartado | nada novo | nada | nada |
| C. retry do mesmo paid | `...:<upd2>` repetido | descartado | nada novo | nada | nada |
| D. paid sem rastreio, depois paid com rastreio | `...:<upd2>` e `...:<upd3>` | ambos | 2 linhas, ignored | mesma linha, com status de envio atualizado | nada vindo de `orders/updated`; o aviso sai do `fulfillments/*` |
| E. rastreio repetido (`fulfillments/*`) | chave de fulfillment inalterada | descartado (ou `skipped_duplicate` pelas travas) | no máximo 1 linha a mais | a reconciliação não altera | sem envio duplicado |

## 9. Arquivos, migration e rollback

- **Arquivo alterado:** somente `supabase/functions/_shared/shopify.ts` (o `event_id` quando o tópico for `orders/updated`).
- **Testes:** um arquivo novo, `src/__tests__/shopify-orders-updated-idempotency.test.ts`.
- `index.ts` do webhook fica intocado.
- Depois da alteração, as funções que usam esse arquivo (`shopify-webhook`) são republicadas.
- **Migration:** nenhuma. Banco, índices, `orders` e as funções SQL ficam como estão.
- **Rollback:** reverter as linhas em `shopify.ts` e republicar a função. Não precisa desfazer nada no banco: os eventos extras gravados são inofensivos (`ignored`) e continuam válidos para a reconciliação.

## 10. Riscos residuais

- Na primeira hora após a publicação, um retry de um evento antigo chega com a chave nova e é gravado uma vez. Esse evento é `ignored`, e a versão antiga é descartada em `orders`. Não há efeito visível.
- `shopify_events` cresce um pouco mais (uma linha por atualização real de pedido).
- Os pedidos que já estão `pending` com pagamento perdido **não se corrigem sozinhos**. Eles só se atualizam na próxima alteração do pedido. A recuperação é uma etapa separada, que precisa de aprovação.
- Os headers nativos seguem sem registro.

## 11. Testes exatos do futuro Build

1. `orders/updated` pending e paid do mesmo pedido, com `updated_at` diferentes, geram chaves diferentes.
2. O mesmo payload enviado duas vezes gera a mesma chave.
3. `orders/updated` com rastreio gera chave baseada em `updated_at`, sem depender do rastreio.
4. As chaves de `fulfillments/create` e `fulfillments/update` ficam idênticas às atuais (teste de regressão).
5. Um tópico sem id continua com `event_id = null`.
6. `orders/updated` continua com `event_kind = unknown`, ou seja, sem envio.
7. Suíte completa e typecheck.
8. Depois de publicar: acompanhar o próximo `pending -> paid` real e confirmar 2 eventos e `valid_order = true` no mesmo pedido.

Aguardando a sua aprovação. Nada será implementado antes disso.
