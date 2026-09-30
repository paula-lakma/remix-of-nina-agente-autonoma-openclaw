# Recuperação dos pedidos `pending` históricos (read-only)

Nada foi alterado. Os números abaixo vêm do banco em 30/09/2026, às 15:11 (horário de São Paulo).

## 1. Pedidos pending no banco hoje

- **Total:** 65 pedidos. Nenhum é teste ou cancelado.
- **Período:** de 16/08 a 30/09. Agosto tem 18 pedidos e setembro, 47.
- **Rastreio:** nenhum dos 65 tem despacho ou rastreio. Todos têm um único evento salvo, o `pending` inicial.
- **Contato no Chat:** 28 dos 65 têm contato vinculado.

| Dias | Pedidos | Valor total (R$) |
|---|---|---|
| 16/08 a 31/08 (12 dias com pedidos) | 18 | 10.527 |
| 01/09 a 27/09 (19 dias com pedidos) | 31 | 11.923 |
| 28/09 | 5 | 1.659,86 |
| 29/09 | 4 | 768,07 |
| 30/09 (hoje) | 7 | 2.327,05 |

- Desde ontem, 28/09 caiu de 11 para 5 pedidos pending e 29/09 caiu de 8 para 4. Esses pedidos foram despachados e o status "pago" chegou junto.
- Os 7 de hoje já entram pela correção nova.

## 2. Acesso de leitura à Shopify

**Não existe hoje.** O projeto só tem o segredo de assinatura do webhook (`SHOPIFY_WEBHOOK_SECRET`). Não há token da Admin API, domínio da loja nem permissão `read_orders`.

Por isso **não foi possível** fazer as comparações das seções 3 e 4:

- quantos continuam pending, pagos, cancelados, reembolsados ou não encontrados;
- a separação por data.

**O que é preciso da Lakma (bloqueio):**

1. Na Shopify, criar um app personalizado com **somente** a permissão `read_orders`.
2. Se houver pedidos com mais de 60 dias, liberar também o acesso a pedidos antigos (`read_all_orders`). Com o histórico atual, só alguns pedidos de meados de agosto passam de 60 dias.
3. Informar o token de acesso e o domínio `.myshopify.com`. Eles seriam guardados como segredos do projeto.

Com isso, as consultas usam a Admin API (REST 2025-07, `GET /orders/{id}.json`), que devolve o pedido no mesmo formato do webhook.

## 3. O que se sabe sem a Shopify

- Nenhum dos 65 recebeu depois qualquer evento salvo. Por isso, é impossível dizer pelo banco quais foram pagos.
- Muitos devem ser Pix ou cartão não concluídos: 30 dos pedidos de setembro não têm despacho há mais de 7 dias.
- O lote suspeito de pagamento perdido está entre os mais recentes: 28 a 30/09 e alguns de 23 a 26/09.

## 4. Impacto máximo no Dashboard (teto, se todos estivessem pagos)

- **Setembro hoje:** 222 pedidos válidos e R$ 61.621,47 de receita.
- **Teto em setembro:** +47 pedidos e +R$ 14.961,18.
- **Teto em agosto:** +18 pedidos e +R$ 10.237,80.
- **28/09:** até +5 pedidos. **29/09:** até +4 pedidos.

O impacto real só será conhecido depois da consulta à Shopify. Ele deve ser bem menor que o teto.

## 5. Método recomendado

Seguir o mesmo caminho oficial: payload atual da Shopify -> `shopify_events` -> gatilho -> `sync_shopify_order_payload` -> `orders`/`order_items`.

- Uma nova função `shopify-reconcile-pending`, acionada só manualmente por um admin, lê a lista de pedidos pending e consulta cada um na Shopify.
- A função **só grava** quando o status atual na Shopify for diferente de pending. Nesse caso, insere um evento técnico em `shopify_events`:
  - `topic = 'orders/reconciled'`;
  - `send_status = 'reconciled'`;
  - o payload completo da Shopify.
- O gatilho existente já dispara para `orders/%` e chama `sync_shopify_order_payload`.

**Por que o evento técnico (opção A):**

- Preserva a auditoria: fica registrado que a correção veio de uma reconciliação, quando e com qual payload.
- A reconciliação diária também passa a enxergar esse evento.
- A opção B, atualizar `orders` direto, criaria uma lógica paralela e perderia o rastro.

## 6. Garantias contra efeitos colaterais

- O evento é inserido direto no banco pela função nova e **não passa pelo `shopify-webhook`**. Assim, não aciona contato, conversa, `send_queue`, travas de rastreio, WhatsApp ou handoff. O gatilho só chama a sincronização de pedidos.
- `orders`: upsert por `(source, source_order_id)`. Não duplica e mantém a mesma linha.
- `order_items`: upsert por `(order_id, source_line_item_id)`. Não duplica.
- Versões antigas são ignoradas (`skipped_older`).
- A função só considera pedidos pending no banco e só grava se a Shopify disser outra coisa. Pedidos corretos não são tocados.
- O despacho só muda se a Shopify já mostrar o pedido despachado, que é o dado real.

## 7. Idempotência

- **Chave:** `shopify_event_id = 'orders/reconciled:<gid do pedido>:<updated_at da Shopify>'`, protegida pelo índice único atual.
- Rodar de novo com o pedido inalterado dá conflito, que é ignorado. Pedido já reconciliado não aparece mais como pending e sai da seleção.

## 8. Piloto

1. **Primeira rodada, sem gravar nada:** consultar os 65, devolver a classificação (pending, pago, cancelado, reembolsado, não encontrado ou erro) e a simulação do Dashboard, e então pedir aprovação.
2. **Piloto:** reconciliar de 1 a 3 pedidos que estejam pending no banco e pagos na Shopify. Conferir:
   - 1 linha em `orders`, paga e válida;
   - itens sem duplicação;
   - zero novos itens em `send_queue` e em travas de rastreio;
   - Dashboard contando os pedidos.
3. **Depois da aprovação:** rodar para todos, em lotes pequenos (por exemplo, 2 consultas por segundo, dentro do limite da Shopify).

## 9. Riscos

- Um token com permissões demais: usar só `read_orders`.
- Limite de consultas da Shopify: lotes lentos.
- Pedidos com mais de 60 dias sem `read_all_orders`: aparecem como "não encontrado" e ficam fora.
- Mudança de `total_amount` por reembolso parcial: vem da própria Shopify, e é o dado correto.

## 10. Arquivos e migration

- **Novo:** `supabase/functions/shopify-reconcile-pending/index.ts`. Exige usuário admin e tem os modos `dry_run` (padrão), `pilot` com lista de IDs e `apply`.
- **Novo:** testes em `src/__tests__/shopify-reconcile.test.ts`, cobrindo chave, filtro e classificação.
- **Novos segredos:** `SHOPIFY_ADMIN_TOKEN` e `SHOPIFY_SHOP_DOMAIN`.
- **Sem migration.** `send_status` e `topic` são texto, e o gatilho e o índice já existem.
- Não serão alterados: `shopify-webhook`, `_shared/shopify.ts`, `sync_shopify_order_payload`, Dashboard, rastreio, WhatsApp, Chat, Nina, CRM e Pipeline.

## 11. Plano exato do futuro Build

1. Receber da Lakma o token (somente leitura de pedidos) e o domínio da loja, e guardá-los como segredos.
2. Criar a função com modo de simulação e publicá-la.
3. Rodar a simulação: relatório por status e data, e impacto no Dashboard. Pausa para aprovação.
4. Piloto de 1 a 3 pedidos e verificações. Pausa para aprovação.
5. Aplicar a todos os divergentes e reconferir os números de Vendas.

Aguardando a sua aprovação e o token de leitura da Shopify.
