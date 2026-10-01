# Vendas V2 — vendas, reembolsos e receita líquida (plano, sem implementar)

## 1. Diagnóstico do modelo atual (confirmado agora no banco)

- `orders` guarda só o **estado final** do pedido. Não há valor recebido, valor reembolsado, data de pagamento nem data de reembolso. `order_items` não guarda quantidade reembolsada.
- Pedidos hoje: 415 paid (válidos), 43 expired, 3 refunded, 2 pending, 1 voided.
- A Shopify só nos envia `orders/updated`, `fulfillments/create` e `fulfillments/update`. Não recebemos nenhum aviso específico de reembolso.
- Nenhum dos 862 `orders/updated` salvos traz reembolsos preenchidos. Por isso, o histórico não pode ser reconstruído só com o que temos no banco.
- O valor de reembolso hoje se perde: `sync_shopify_order_payload` copia o status e usa `current_subtotal_price` como receita.

## 2. Onde `valid_order` é usado

Regra: `paid + não cancelado + não teste`, calculada em `sync_shopify_order_payload`.

| Lugar | Usa para |
|---|---|
| `ecom_summary` | pedidos, receita, frete, total, clientes únicos, receita com cupom, período anterior, clientes novos/recorrentes/recompra (histórico), bloco "Situação dos pedidos" (`NOT valid_order`) |
| `ecom_timeseries` | gráfico (pedidos e receita por hora/dia/semana) |
| `ecom_top_products` | unidades, pedidos, receita por produto |
| `ecom_top_coupons` | pedidos, receita, ticket por cupom e "sem cupom" |
| Front (`KpiCards`) | ticket = receita / pedidos (sobre o que a RPC devolve) |

Nenhuma parte da operação usa esse campo: WhatsApp, rastreio, Chat, Nina, CRM, Pipeline, fila e travas.

## 3. Limitações atuais

- Reembolso total: a venda some por completo (os R$1.519,04 dos 3 casos não aparecem nem como venda nem como reembolso).
- Reembolso parcial: o pedido passa a `partially_refunded`, sai de `valid_order` e **desaparece inteiro**, embora parte da venda continue valendo.
- Sem métrica de reembolsos, taxa de reembolso ou receita líquida.

## 4. Definições recomendadas

- **Pedido pago:** teve pagamento confirmado (alguma transação SALE/CAPTURE com SUCCESS, ou `totalReceived > 0`), não é teste e não foi cancelado antes de pagar. Continua pago mesmo se depois houver reembolso.
- **Receita bruta de produtos:** receita de produto do pedido no momento da venda (subtotal original após descontos, sem frete), somada nos pedidos pagos.
- **Reembolsos:** soma das transações REFUND com SUCCESS (`totalRefunded`), contadas na **data do reembolso**. Como métrica secundária, mostrar também a parte que é frete.
- **Receita líquida:** receita bruta − reembolsos de produto (reembolso total − frete reembolsado).
- **Pedidos com reembolso:** pagos com reembolso > 0. **Total:** reembolsado = recebido. **Parcial:** 0 < reembolsado < recebido.
- **Taxa de reembolso:** reembolsos / receita bruta, em valor. Como secundária, a taxa por número de pedidos.
- **Ticket médio principal:** receita líquida / pedidos pagos, porque reflete o que fica no caixa. Secundário: receita bruta / pedidos pagos.

**Data de referência:** venda pela data do pedido (como hoje), reembolso pela data em que aconteceu. Assim, um mês já fechado não muda quando chega um reembolso depois. A alternativa é atribuir o reembolso à data da venda (visão de "qualidade da venda"); isso precisa da sua decisão.

## 5. Opções de modelagem

| Critério | A — colunas em `orders` | B — tabela `order_refunds` (+ resumo em `orders`) |
|---|---|---|
| Auditoria | só totais | cada reembolso e transação |
| Vários reembolsos | só soma | sim, um por linha |
| Parcial | soma | sim, com itens e frete |
| Idempotência | sobrescreve | chave única por reembolso da Shopify |
| Reembolso por data | não (só último) | sim |
| Facilidade nas funções de Vendas | alta | média |
| Complexidade e backfill | baixa | média |

**Recomendação:** B + resumo.
- Tabela `order_refunds`, com uma linha por reembolso da Shopify e as transações dentro.
- Colunas-resumo em `orders` (`total_received`, `total_refunded`, `refunded_shipping`, `net_payment`, `paid_at`, `refund_count`, `first_refunded_at`, `last_refunded_at`, `is_paid`), recalculadas a partir dela.
- Assim, as funções de Vendas continuam rápidas e o detalhe fica auditável.

## 6. Reembolso total e parcial (exemplos)

- **R$500 pago, R$100 reembolsado:** pago sim; bruta R$500; reembolso R$100 (na data dele); líquida R$400; com reembolso, parcial. O pedido **continua** nas vendas.
- **R$500 pago, R$500 reembolsado:** pago sim; bruta R$500; reembolso R$500; líquida R$0; reembolso total. Entra em pedidos pagos e na bruta, e se anula na líquida.
- `valid_order` não muda, para não mexer em nada existente. Surge uma nova regra de venda: `is_paid AND NOT is_test AND (cancelado só se não pago)`.

## 7. Clientes e recompra (opções para sua decisão)

| Cenário | Opção 1: conta como compra | Opção 2: não conta |
|---|---|---|
| Pago sem reembolso | conta (igual a hoje) | — |
| Parcial | **recomendo contar** (houve venda) | — |
| Total | conta como cliente, mas pode inflar "novos" | **recomendo não contar** para novo, recorrente e recompra (venda desfeita) |

Clientes únicos no card: só pedidos pagos que não foram totalmente reembolsados.

## 8. Produtos e cupons

- **Produtos:** quando o reembolso traz itens, desconta unidades e valor do produto. Quando é só financeiro, sem itens (os 3 casos históricos), não dá para atribuir a um produto.
  - Recomendação: Top Produtos mostra unidades e receita **bruta**, com uma linha "reembolsos sem item identificado" no total.
  - Limitação a declarar na tela.
- **Cupons:** pedidos e receita bruta por cupom; reembolso atribuído ao cupom do pedido (todo reembolso é ligado a um pedido); líquida por cupom = bruta − reembolsos. Taxa de reembolso por cupom como métrica extra opcional.

## 9. Sincronização futura (Shopify como fonte)

- `orders/updated` dispara quando há reembolso, mas o payload não garante os detalhes. Na nossa amostra a lista veio vazia.
- Recomendação (E, combinação):
  1. Assinar o webhook **`refunds/create`**, que traz o reembolso completo com transações, itens e frete.
  2. Manter `orders/updated` para o status.
  3. Rodar uma **reconciliação diária** read-only pela API (`totalReceived`/`totalRefunded`/`refunds`) dos pedidos alterados nas últimas 48–72h, para cobrir evento perdido.
- **Idempotência:** chave única = ID do reembolso na Shopify; transações por ID da transação. Refund com transação FAILURE/PENDING é guardado, mas não soma até virar SUCCESS.
- A página Vendas continua lendo só o banco, sem consultar a Shopify em tempo real.
- Um eventual `refunds/create` seria tratado num caminho **analítico separado** (função nova ou ramo isolado e tolerante a falha), sem tocar no fluxo de WhatsApp e rastreio do `shopify-webhook`.

## 10. Backfill histórico

- **Universo:** todos os pedidos com histórico (desde 28/07/2026), status paid, refunded e partially_refunded. Hoje são ~418, e a lista é fechada no dry-run. Expired, pending e voided não precisam.
- Não há como descobrir reembolsos antigos pelo banco, então é preciso consultar a Shopify pedido a pedido (leitura já validada no `refund_audit`), ou filtrar por `financial_status` na busca da Shopify.
- **Etapas:**
  1. Dry-run: só leitura; relatório de totais por pedido e soma geral.
  2. Piloto: os 3 refunded + 2 pagos.
  3. Apply em lotes, com conferência das tabelas protegidas depois de cada lote.
- **Validação:** soma de recebido e reembolsado igual à Shopify; receita bruta igual à atual mais os R$1.519,04; zero efeito operacional.

## 11. Proposta de UI (incremental)

- **Cards:** Receita líquida (destaque) · Receita bruta · Reembolsos · Pedidos pagos · Ticket médio (líquido; bruto em texto menor) · Clientes.
- **Gráfico:** bruta e líquida (reembolsos como barra negativa opcional).
- **"Situação dos pedidos":** ganha pedidos com reembolso, totais, parciais e taxa de reembolso.
- Restante igual.
- **Destaque na receita líquida:** é o dinheiro que fica; a bruta e os reembolsos explicam a diferença.

## 12. Fases com pausa obrigatória

```text
Fase 1  Modelo de dados (migration): tabela order_refunds + colunas-resumo + RLS. Sem uso ainda.        -> pausa
Fase 2  Captura futura: refunds/create + reconciliação diária, isoladas da operação.                    -> pausa
Fase 3  Backfill: dry-run -> piloto -> apply em lotes.                                                   -> pausa
Fase 4  Funções de Vendas V2 (novas, em paralelo às atuais), com testes de totais.                       -> pausa
Fase 5  UI Vendas V2 (troca dos cards e blocos).                                                         -> pausa
Fase 6  Validação completa contra a Shopify e desligamento das funções V1 se aprovado.                   -> pausa
```

## Riscos e rollback

- **Riscos:** dupla contagem de reembolsos (mitigado pela chave única); mudança de números já reportados (mitigado ao mostrar V2 em paralelo); webhook novo afetar a operação (mitigado com função separada); fuso das datas de reembolso (usar São Paulo).
- **Rollback:**
  - Fase 1: remover tabela e colunas (ainda não usadas).
  - Fase 2: desligar o webhook novo e a rotina.
  - Fase 3: os dados ficam só na camada analítica; dá para limpar.
  - Fases 4 e 5: as funções V1 continuam existindo; volta só a UI.

## Detalhes técnicos

- **Tabela `public.order_refunds`:**
  - Campos: `id uuid pk`, `order_id uuid fk orders on delete cascade`, `source text default 'shopify'`, `shopify_refund_id text`, `processed_at timestamptz`, `created_at_source timestamptz`, `total_amount numeric`, `shipping_amount numeric`, `currency text`, `note text`, `transactions jsonb` (kind, status, gateway, amount, processed_at, parent), `line_items jsonb` (line_item_gid, quantity, subtotal), `status text` (success/pending/failed), `source_event_id uuid`, `created_at`, `updated_at`.
  - Restrição: `UNIQUE(source, shopify_refund_id)`.
  - Índices: `(order_id)` e `(processed_at)`.
  - Acesso: GRANT select para authenticated e all para service_role; RLS de leitura para admin/manager/sdr, igual a `orders`; escrita só pelo backend.
- **Colunas novas em `orders`:** `total_received`, `total_refunded`, `refunded_shipping`, `net_payment numeric`, `paid_at timestamptz`, `refund_count int default 0`, `first_refunded_at`, `last_refunded_at timestamptz`, `is_paid boolean default false`. Índice `(is_paid, created_at_source)`.
- **Funções SQL:**
  - `sync_shopify_order_payload`: na Fase 1 só preenche `paid_at`/`is_paid` quando o payload tiver isso; o resto fica com a função nova `sync_order_refund(...)`.
  - Novas `ecom_summary_v2`, `ecom_timeseries_v2`, `ecom_top_products_v2`, `ecom_top_coupons_v2`.
  - As V1 ficam intactas até a Fase 6.
- **Edge Functions:** nova `shopify-refunds-webhook` (ou rota isolada); novo modo de backfill em `shopify-reconcile-pending` (reaproveitando `fetchRefundAudit`); rotina diária de reconciliação de reembolsos.
- **Webhook novo na Shopify:** `refunds/create`, cadastrado pelo app que já temos. É preciso confirmar se o escopo `read_orders` basta para ele.
- **Arquivos de front (Fase 5):** `src/services/ecommerceMetrics.ts`, `src/pages/Ecommerce.tsx`, `src/components/ecommerce/*` e os testes correspondentes.
- **Migrations:** Fase 1 (tabela e colunas) e Fase 4 (funções V2). Fases 2, 3 e 5 não precisam de migration.
