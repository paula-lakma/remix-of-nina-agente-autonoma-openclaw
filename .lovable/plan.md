# Recuperação dos pedidos `pending` históricos (plano atualizado, read-only)

Nada foi implementado. Os números do banco são de 30/09/2026, às 15:11 (horário de São Paulo).

## 1. Estado da integração com a Shopify

- **App:** `crm-eccomerce` (reaproveitado), versão `crm-eccomerce-2-read-orders`, instalada na loja com **somente** a permissão `read_orders`.
- **Loja:** `lakma-wig.myshopify.com`.
- **Não é preciso outro app.**
- **Webhooks:** os de pedido e de processamento continuam cadastrados à parte e apontam para o `shopify-webhook`. Não serão alterados.
- **Janela de 60 dias:** os 65 pedidos pending vão de 16/08 a 30/09, todos dentro da janela. `read_orders` basta, e `read_all_orders` fica para uma etapa futura, se um dia for necessário.

## 2. Pedidos pending no banco

Total de 65 (18 em agosto e 47 em setembro). Nenhum é teste ou cancelado, nenhum tem rastreio, e cada um tem um único evento salvo (o pending inicial). Os mais afetados estão em 28/09 (5), 29/09 (4) e 30/09 (7).

Teto de impacto, se todos estivessem pagos:

- **Setembro:** +47 pedidos e +R$ 14.961,18. Hoje setembro tem 222 pedidos e R$ 61.621,47.
- **Agosto:** +18 pedidos e +R$ 10.237,80.

O número real sai do dry run.

## 3. Autenticação (client credentials, server-side)

**Segredos**, guardados somente nos segredos das funções:

- `SHOPIFY_SHOP_DOMAIN` = `lakma-wig.myshopify.com`;
- `SHOPIFY_CLIENT_ID`;
- `SHOPIFY_CLIENT_SECRET`.

**Fluxo:**

1. A função faz `POST https://<SHOP_DOMAIN>/admin/oauth/access_token`, com `grant_type=client_credentials`, `client_id` e `client_secret`.
2. Recebe um token temporário (cerca de 24 horas).
3. O token fica só em memória, durante a execução. Não é gravado em banco, não aparece em logs e não volta ao app.

Os segredos nunca aparecem no código, em `VITE_*`, em respostas, em tabelas ou em arquivos versionados.

## 4. Consulta GraphQL Admin API (somente leitura, não executada)

```graphql
query ReconcileOrder($id: ID!) {
  order(id: $id) {
    id legacyResourceId name updatedAt createdAt test
    displayFinancialStatus displayFulfillmentStatus
    cancelledAt cancelReason
    currentSubtotalPriceSet { shopMoney { amount } }
    currentTotalPriceSet { shopMoney { amount } }
    totalRefundedSet { shopMoney { amount } }
    lineItems(first: 50) { nodes { id quantity currentQuantity } }
  }
}
```

- **Endpoint:** `POST /admin/api/2025-07/graphql.json`, com `$id = "gid://shopify/Order/<orders.source_order_id>"`.
- **Campos comparados com o banco:** status financeiro, cancelamento, `updatedAt`, subtotal atual, total atual, valor reembolsado e quantidades dos itens.

## 5. Payload para a normalização (adaptação mínima)

A normalização oficial (`sync_shopify_order_payload`) espera o formato do webhook: `line_items`, `financial_status` em minúsculas, e assim por diante. O GraphQL devolve outro formato. Para não criar uma lógica paralela:

- **Base:** o último payload do webhook já salvo para o pedido, que é confiável e contém itens, cliente e cupons.
- **Por cima**, só os campos confirmados pela Shopify:
  - `financial_status` = `displayFinancialStatus` em minúsculas;
  - `cancelled_at` e `cancel_reason`;
  - `updated_at`;
  - `fulfillment_status` (quando houver);
  - `current_subtotal_price` e `current_total_price`.
- **Proteção:** se os itens ou quantidades da Shopify forem diferentes dos do payload base (pedido editado), o pedido é classificado como **"divergência de itens"**. Ele **não** é reconciliado automaticamente e vai para o relatório.

## 6. `orders/reconciled` aciona só a normalização

Conferido no banco:

- O único gatilho de inserção em `shopify_events` é `shopify_events_sync_order_trg` (`AFTER INSERT ... WHEN topic LIKE 'orders/%'`). Ele chama apenas `sync_shopify_order_payload`, então dispara para `orders/reconciled`.
- A reconciliação diária também considera `orders/%`.
- O evento é inserido direto pela função nova e não passa pelo `shopify-webhook`. Assim, não gera mensagem, conversa, `send_queue`, trava de rastreio, WhatsApp nem handoff.
- `orders`: upsert pela chave única, sem duplicar. `order_items`: upsert por item, sem duplicar. Versões antigas são ignoradas.

## 7. Etapas do futuro Build (com pausas)

**Etapa 0: teste de acesso, sem gravar nada.** Obter o token e consultar **1** pedido conhecido. Se a autenticação ou a leitura falhar, parar e avisar.

**Etapa 1: dry run, sem gravar nada.** Consultar os pedidos pending em lotes lentos e classificar cada um:

- pending, paid, cancelled, refunded, partially_refunded;
- outro status, divergência de itens, não encontrado ou erro.

O relatório sai por data (destaque para 28 e 29/09) e com o impacto simulado no Dashboard: pedidos válidos, receita, ticket e setembro. **Pausa para aprovação.**

**Etapa 2: piloto.** De 1 a 3 pedidos que estejam pending no banco e pagos na Shopify. Conferir:

- mesma linha em `orders`, com status e `valid_order` corretos;
- itens sem duplicação;
- zero novos itens em `send_queue`, travas de rastreio ou mensagens;
- o Dashboard passa a contar os pedidos.

**Pausa para aprovação.**

**Etapa 3: aplicação total.** Reconciliar os demais divergentes em lotes pequenos. Pedidos que continuam pending na Shopify não são tocados.

**Evento técnico gravado nas etapas 2 e 3:**

- `topic = 'orders/reconciled'`;
- `send_status = 'reconciled'`;
- chave `shopify_event_id = 'orders/reconciled:<gid do pedido>:<updatedAt da Shopify>'`, protegida pelo índice único atual.

Rodar de novo é inofensivo: conflitos são ignorados e pedidos já corrigidos não são mais selecionados.

## 8. Arquivos, segredos e migration

- **Novo:** `supabase/functions/shopify-reconcile-pending/index.ts`, só para admin. Modos: `auth_check`, `dry_run` (padrão), `pilot` com lista de IDs e `apply`.
- **Novo:** `supabase/functions/_shared/shopify_admin.ts`, com o token por client credentials, a consulta GraphQL e a montagem do payload.
- **Novo:** `src/__tests__/shopify-reconcile.test.ts`.
- **Segredos:** `SHOPIFY_SHOP_DOMAIN`, `SHOPIFY_CLIENT_ID` e `SHOPIFY_CLIENT_SECRET`, pedidos pelo formulário seguro.
- **Sem migration.**
- Não serão alterados: `shopify-webhook`, `_shared/shopify.ts`, `sync_shopify_order_payload`, os webhooks da Shopify, o Dashboard, rastreio, WhatsApp, Chat, Nina, CRM e Pipeline.

## 9. Riscos residuais

- A adaptação do payload depende do payload base. Pedidos editados na Shopify ficam de fora de propósito ("divergência de itens").
- Limites de consulta da Shopify: lotes lentos, com uma nova tentativa quando houver limitação.
- O `updatedAt` da Shopify precisa ser maior que o salvo. Se não for, a normalização ignora o evento, o que é um comportamento seguro.
- Se a Lakma revogar ou trocar o segredo do app, a função falha sem gravar nada.

## 10. Rollback

- **Código:** remover a função nova. Não há mudança em nada existente.
- **Dados:** os eventos `orders/reconciled` ficam identificados. Para reverter um pedido, basta reprocessar o evento anterior do webhook na normalização, desde que tenha aprovação específica. Nenhuma tabela ou estrutura muda.

## 11. Testes do futuro Build

1. Montagem do payload: base mais campos da Shopify; `PAID` vira `paid`; cancelamento e datas são copiados.
2. A chave é `orders/reconciled:<gid>:<updatedAt>` e é estável em nova execução.
3. Classificação de todos os status, incluindo divergência de itens, não encontrado e erro.
4. O dry run não chama nenhuma gravação.
5. O piloto e o apply só gravam pedidos pending no banco e diferentes de pending na Shopify.
6. Os segredos não aparecem em nenhuma resposta ou log (conferido nos testes).
7. Suíte completa e typecheck.
8. No banco, durante o piloto: 1 linha em `orders`, itens iguais, zero `send_queue` e zero travas de rastreio novas.

Aguardando a sua aprovação. Nada será implementado antes disso.
