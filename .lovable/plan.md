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

## 4. Definições e métricas

**Fluxo financeiro do pedido** (pagamento; não é receita de produto):
- `total_received`, `total_refunded`, `refunded_shipping`, `net_payment`, exatamente como a Shopify informa.

**Receita de produtos** (Vendas), modelada à parte:
- **Receita bruta de produtos:** receita de produto no momento da venda (subtotal após descontos, sem frete), nos pedidos pagos.
- **Reembolso de produto identificado:** soma dos valores dos itens reembolsados (`refundLineItems`), quando existirem.
- **Reembolso não alocado:** valor do reembolso que não pode ser atribuído a itens, por exemplo um reembolso só financeiro, sem itens. Fica explícito em vez de ser distribuído entre produtos.
  - Não se presume que `total_refunded − refunded_shipping` seja igual ao reembolso de produto, porque o reembolso pode envolver outros componentes.
  - Os 3 casos históricos ficam auditáveis como "não alocado".

**Outras definições:**
- **Pedido pago:** pagamento confirmado (transação SALE/CAPTURE com SUCCESS, ou `totalReceived > 0`), não é teste. Continua pago mesmo se depois houver reembolso.
- **Pedidos com reembolso:** reembolso > 0. **Total:** reembolsado = recebido. **Parcial:** 0 < reembolsado < recebido.
- **Data de referência:** venda na data do pedido; reembolso na data em que ocorreu, não na data da venda, salvo decisão posterior.

Ficam disponíveis separadamente: receita bruta de produtos, reembolsos de produto identificados, reembolsos não alocados, total reembolsado financeiro e posição líquida financeira. Quais delas viram cards principais, e a regra do ticket médio, ficam para as Fases 4/5. A Fase 1 não depende disso.

## 5. Modelagem recomendada

- **Tabela `order_refunds`:** uma linha por Refund da Shopify, com chave única `(source, shopify_refund_id)`.
- **`transactions` (jsonb):** snapshot normalizado da situação **atual** daquele Refund, com os IDs das transações preservados para auditoria.
  - Uma nova consulta do mesmo Refund atualiza ou substitui o snapshot.
  - Não há idempotência por transação no banco, só por Refund.
- **Totais do pedido:** recalculados a partir do estado autoritativo de todos os seus refunds, nunca somando de novo o mesmo refund.
- **Auditoria linha a linha por transação:** se for preciso no futuro, cria-se `order_refund_transactions` em outra versão. Ela não será criada agora.
- **Colunas-resumo em `orders`:** financeiras e de produto, separadas (ver Detalhes técnicos).

## 6. Reembolso total e parcial (exemplos)

- **R$500 pago, R$100 reembolsado:** pago sim; bruta R$500; reembolso R$100 (na data dele); o pedido **continua** nas vendas.
- **R$500 pago, R$500 reembolsado:** pago sim; bruta R$500; reembolso R$500; efeito líquido zero; reembolso total.
- `valid_order` não muda. A regra de venda da V2 será definida na Fase 4.

## 7. Clientes e recompra (opções para sua decisão)

| Cenário | Opção 1: conta como compra | Opção 2: não conta |
|---|---|---|
| Pago sem reembolso | conta (igual a hoje) | — |
| Parcial | **recomendo contar** (houve venda) | — |
| Total | conta, mas pode inflar "novos" | **recomendo não contar** para novo, recorrente e recompra |

## 8. Produtos e cupons

- **Produtos:**
  - Com itens no reembolso: desconta unidades e valor dos produtos.
  - Sem itens: fica em "reembolso não alocado", fora do ranking por produto, com a limitação declarada na tela.
- **Cupons:**
  - Reembolso atribuído ao cupom do pedido (todo reembolso tem pedido).
  - Por cupom: bruta, reembolsos e líquida.

## 9. Sincronização futura (Shopify como fonte)

- O webhook `refunds/create` existe, e o escopo `read_orders` basta para assiná-lo.
- Ele dispara quando um Refund é **criado**, mas não garante que o dinheiro já voltou. O payload pode ser salvo para auditoria, mas **não** vale sozinho como confirmação de reembolso.
- **Fluxo:**
```text
refunds/create -> validar assinatura -> obter refund/order ID
  -> consultar GraphQL Admin (estado autoritativo do pedido e do refund)
  -> verificar transactions/status
  -> só então atualizar a camada analítica
```
- **Reconciliação periódica:** read-only, nos pedidos alterados nas últimas 48–72h. Cobre webhook perdido e transação que começou PENDING e depois virou SUCCESS ou FAILURE.
- **Isolamento:** tudo roda em caminho analítico separado do `shopify-webhook`, sem tocar em WhatsApp ou rastreio. A página Vendas lê só o banco.

## 10. Janela de 60 dias e backfill histórico

- Com só `read_orders`, a Shopify devolve os pedidos dos **últimos 60 dias**. Hoje (01/10/2026) a janela começa em ~02/08/2026, então os pedidos de 28/07 a ~01/08 ficam fora. Esse corte avança a cada dia.
- **Decisão antes do backfill:**
  - A (preferida): adicionar o escopo `read_all_orders` ao app crm-eccomerce, mantendo `read_orders`.
  - B: aceitar um backfill incompleto, limitado ao período acessível.
- **Quando:** na Fase 2 (pedido e validação da permissão, com um teste de leitura em um pedido de julho), antes da Fase 3. O app não muda agora.
- **Dry-run** (só leitura) informa:
  - pedidos consultáveis e pedidos bloqueados pela janela;
  - total recebido e total reembolsado;
  - refunds encontrados: totais, parciais e sem itens;
  - divergências e erros.
- Os R$1.519,04 dos 3 refunds auditados são **uma referência conhecida, não um limite**. O valor real sai do dry-run.
- **Etapas:**
  1. Dry-run.
  2. Validação do relatório por você.
  3. Piloto.
  4. Apply em lotes, com conferência das tabelas protegidas depois de cada lote.
  Nenhum apply antes de você aprovar o relatório.

## 11. Proposta de UI (incremental, decisão nas Fases 4/5)

- **Cards candidatos:** Receita líquida, Receita bruta, Reembolsos, Pedidos pagos, Ticket médio, Clientes.
- **Indicadores secundários:** pedidos com reembolso, totais, parciais, taxa de reembolso e reembolsos não alocados.
- O resto da página continua familiar.

## 12. Fases com pausa obrigatória

```text
Fase 1  SOMENTE estrutura: tabela, colunas, índices, constraints, RLS, grants.
        Nenhum dado preenchido. sync_shopify_order_payload intocada. Nenhum dado atual muda.   -> pausa
Fase 2  Captura futura: refunds/create -> GraphQL -> validação -> camada analítica;
        reconciliação periódica; resolver/validar read_all_orders para o histórico.             -> pausa
Fase 3  Backfill: dry-run -> validação -> piloto -> apply em lotes.                             -> pausa
Fase 4  Funções de Vendas V2 em paralelo às V1 (com testes de totais).                          -> pausa
Fase 5  UI Vendas V2.                                                                           -> pausa
Fase 6  Validação completa e eventual aposentadoria da V1.                                      -> pausa
```

## Riscos e rollback

- **Riscos e mitigação:**
  - Contar o mesmo reembolso duas vezes: chave por Refund e recálculo pelo snapshot.
  - Tratar refund criado como dinheiro devolvido: confirmação pela GraphQL.
  - Histórico incompleto pela janela de 60 dias: decisão sobre `read_all_orders`.
  - Webhook novo afetar a operação: função separada.
  - Fuso das datas: usar São Paulo.
- **Rollback:**
  - Fase 1: tabela e colunas ficam sem uso; podem ser ignoradas ou removidas depois.
  - Fase 2: desligar o webhook e a rotina.
  - Fase 3: dados só na camada analítica, dá para limpar.
  - Fases 4 e 5: funções V1 intactas; volta só a UI.

## Detalhes técnicos

### Migration da Fase 1 (somente estrutura, sem backfill)

- **`public.order_refunds`:**
  - `id uuid pk default gen_random_uuid()`
  - `order_id uuid not null references orders(id) on delete cascade`
  - `source text not null default 'shopify'`
  - `shopify_refund_id text not null`
  - `created_at_source timestamptz`, `processed_at timestamptz`, `updated_at_source timestamptz`
  - `total_amount numeric`, `shipping_amount numeric`, `currency text`, `note text`
  - `transactions jsonb not null default '[]'` (snapshot com id, kind, status, gateway, amount, currency, processed_at, parent)
  - `line_items jsonb not null default '[]'` (line_item_gid, quantity, subtotal)
  - `refunded_product_amount numeric` (soma atribuível aos itens)
  - `unallocated_amount numeric` (parte não atribuível)
  - `financial_status text` (success, pending, failed ou mixed, derivado do snapshot)
  - `webhook_payload jsonb` (auditoria, opcional)
  - `last_verified_at timestamptz`
  - `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, com o trigger `update_updated_at_column` já existente
  - Restrição `UNIQUE (source, shopify_refund_id)`; índices `(order_id)` e `(processed_at)`
  - GRANT `select` para authenticated e `all` para service_role
  - RLS ligado, com política de leitura `is_admin_or_manager(auth.uid()) OR has_role(auth.uid(),'sdr')`, igual a `orders`. Sem política de escrita: só o backend grava.
- **Colunas novas em `orders`, todas anuláveis ou com default neutro, sem preencher nada:**
  - Financeiras: `total_received`, `total_refunded`, `refunded_shipping`, `net_payment numeric`.
  - Pagamento: `paid_at timestamptz`, `is_paid boolean` (anulável; null = ainda não verificado).
  - Reembolsos: `refund_count int`, `first_refunded_at`, `last_refunded_at timestamptz`.
  - Produto: `gross_product_revenue`, `refunded_product_amount`, `unallocated_refund_amount numeric`.
  - Controle: `financials_verified_at timestamptz`.
  - Índice `(is_paid, created_at_source)`.
- **Não muda:** `sync_shopify_order_payload`, as funções `ecom_*`, o webhook e os triggers existentes. Nenhum UPDATE em dados.
- **Conferência pós-migration:** contagens e somas de `orders` e `order_items`, e Vendas idênticas antes e depois.

### Fases seguintes (sem migration agora)

- **Fase 2:** Edge Function nova `shopify-refunds-webhook`, que valida HMAC, consulta GraphQL e faz upsert por `shopify_refund_id`, recalculando o resumo do pedido. Reconciliação periódica reaproveitando `fetchRefundAudit`. O webhook `refunds/create` é cadastrado no app.
- **Fase 3:** modo de backfill em `shopify-reconcile-pending`.
- **Fase 4:** migration com `ecom_summary_v2`, `ecom_timeseries_v2`, `ecom_top_products_v2` e `ecom_top_coupons_v2`; as V1 ficam intactas.
- **Fase 5:** `src/services/ecommerceMetrics.ts`, `src/pages/Ecommerce.tsx`, `src/components/ecommerce/*` e os testes correspondentes.
