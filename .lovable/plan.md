# Vendas V2 — Fase 2: captura futura de pagamentos e reembolsos (somente plano)

Nada é implementado nesta etapa. Sem migration, sem mudança no app Shopify, sem webhook novo, sem preencher campos da Fase 1, sem backfill (fica para a Fase 3).

## 1. read_all_orders (itens 1–3, 22)

Hoje a função `shopify-reconcile-pending` pega token via client credentials do app `crm-eccomerce-2-read-orders` (secrets SHOPIFY_SHOP_DOMAIN / CLIENT_ID / CLIENT_SECRET). `read_orders` só enxerga os últimos 60 dias. `read_all_orders` é um escopo protegido e **pode exigir aprovação da Shopify**; o fluxo exato só se confirma no painel.

Fluxo, nesta ordem (passos manuais seus marcados com "você"):
1. Você abre o Dev Dashboard do app `crm-eccomerce` e verifica qual fluxo aparece para `read_all_orders` (por exemplo "Request access", formulário de justificativa, ou adição direta). **Nenhum escopo é alterado nesta verificação.** Você me conta o que apareceu.
2. Se houver "Request access"/aprovação: você segue esse fluxo (justificativa sugerida: "análise histórica de vendas e reembolsos da própria loja") e aguarda a Shopify aprovar.
3. Só depois: você adiciona `read_all_orders` aos escopos de uma nova versão, mantendo `read_orders` e sem mudar nenhuma outra permissão; lança a versão.
4. Se a loja lakma-wig pedir, você aprova a atualização de permissões.
5. Eu rodo `scope_check` (só leitura): `currentAppInstallation { accessScopes { handle } }` deve listar `read_orders` e `read_all_orders`.
6. Eu leio 1 pedido de julho (o primeiro pedido válido de julho no banco, informado no relatório) com `fetchOrderWithAllItems`: sucesso = encontrado, consulta completa, itens batendo pelo GID. Antes da liberação, o mesmo teste deve falhar (registrado como prova). Zero gravações, contagens antes/depois.

Ainda a verificar manualmente: se o painel exige aprovação, quanto tempo leva, se a mudança gera nova versão e se a loja precisa reaprovar. Os webhooks manuais (Configurações > Notificações > Webhooks) não pertencem ao app e não são tocados. Secrets não mudam.

## 2. Arquitetura do refunds/create com resposta rápida (itens 4–6)

```text
Shopify refunds/create (webhook manual, JSON)
  -> shopify-refunds-webhook (sem login)
       valida HMAC (corpo bruto, tempo constante); inválido = 401, nada gravado
       extrai IDs mínimos como texto: X-Shopify-Webhook-Id, order_id, refund id
       grava 1 linha na caixa de entrada (shopify_financial_inbox),
         ON CONFLICT (webhook_id) DO NOTHING  -> duplicado vira no-op
       responde 200 (sem GraphQL, sem tocar orders)
       dispara o worker em segundo plano (melhor esforço)
  -> shopify-financials-worker (fora do caminho da resposta)
       pega lote da caixa (pending, com trava SKIP LOCKED)
       consulta GraphQL Admin (fonte autoritativa)
       grava order_refunds + resumo em orders numa transação
       marca done / reagenda com espera crescente / failed após 5 tentativas
```

Mecanismo assíncrono recomendado: **caixa de entrada durável + worker**. O ambiente das funções oferece `EdgeRuntime.waitUntil`, que deixa trabalho rodando após a resposta, mas não é durável (se a função cair, o trabalho some). Por isso ele só serve para acordar o worker logo; a garantia vem da tabela: o que não for processado fica `pending` e o worker agendado (a cada 15 min) pega depois. Isso exige uma migration pequena (ver Detalhes técnicos).

- Pedido local inexistente: worker marca `skipped` com motivo; a reconciliação revisa depois.
- Funções novas e separadas. Não reutilizam `shopify-webhook`, rastreio, fila de envio, WhatsApp.
- Cadastro: Configurações > Notificações > Webhooks > "Criar webhook", evento "Reembolso criado", JSON, versão 2026-07, URL `https://<projeto>.supabase.co/functions/v1/shopify-refunds-webhook`.
- HMAC: webhooks manuais são assinados com a chave exibida nessa mesma tela, a mesma já usada como `SHOPIFY_WEBHOOK_SECRET` pela função atual. Reaproveitar esse secret (só leitura); verificação copiada para arquivo próprio da função nova.
- O webhook não é prova de dinheiro devolvido: só diz qual pedido consultar; valores vêm sempre do GraphQL. O payload bruto fica guardado só para auditoria.

## 3. Consulta GraphQL final (item 7)

No Order, `transactions` e `refunds` são listas simples (sem `first`, sem paginação). Dentro de cada Refund, `refundLineItems`, `refundShippingLines` e `transactions` são connections e são paginadas.

```graphql
query OrderFinancials($id: ID!) {
  order(id: $id) {
    id name updatedAt processedAt cancelledAt test displayFinancialStatus
    totalReceivedSet { shopMoney { amount currencyCode } }
    totalRefundedSet { shopMoney { amount currencyCode } }
    totalRefundedShippingSet { shopMoney { amount currencyCode } }
    netPaymentSet { shopMoney { amount currencyCode } }
    transactions {
      id kind status gateway processedAt
      parentTransaction { id }
      amountSet { shopMoney { amount currencyCode } }
    }
    refunds {
      id createdAt processedAt updatedAt note
      totalRefundedSet { shopMoney { amount currencyCode } }
      refundLineItems(first: 100) {
        pageInfo { hasNextPage endCursor }
        nodes { lineItem { id } quantity subtotalSet { shopMoney { amount currencyCode } } }
      }
      refundShippingLines(first: 50) {
        pageInfo { hasNextPage endCursor }
        nodes { subtotalAmountSet { shopMoney { amount currencyCode } } }
      }
      transactions(first: 50) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id kind status gateway processedAt
          parentTransaction { id }
          amountSet { shopMoney { amount currencyCode } }
        }
      }
    }
  }
}
```

Páginas seguintes de cada connection por Refund via `node(id: $refundId) { ... on Refund { refundLineItems(first: 100, after: $cursor) { ... } } }` (idem para shipping lines e transactions). Se qualquer página falhar, o pedido fica "incompleto" e nada é gravado. Antes do Build, a query é validada contra a API 2026-07 em modo leitura no `financials_dry_run`; erro de schema interrompe o passo. Respostas lidas com o parser sem perda já existente (IDs como texto/GID).

## 4. Status das transações (item 8)

Por Refund, `financial_status` = status das transações REFUND dele:
- todas SUCCESS -> `success` (soma nos totais);
- todas PENDING -> `pending` (guardado, não soma);
- todas FAILURE/ERROR -> `failed` (guardado, não soma);
- mistura -> `mixed`: soma só o valor das transações SUCCESS desse Refund.
A modelagem da Fase 1 é suficiente; nenhuma coluna nova. `ERROR` da Shopify é tratado como `failed`.

## 5. Idempotência e upsert (itens 9–10)

- Chave: `(source='shopify', shopify_refund_id = GID do Refund)`. Upsert com `ON CONFLICT ... DO UPDATE`: o mesmo refund recebido de novo só atualiza o retrato (status, transações, valores, `updated_at_source`, `last_verified_at`). Nunca cria segunda linha.
- Só sobrescreve se o `updatedAt` vindo da Shopify for igual ou mais recente que o salvo.
- A cada evento, **todos** os refunds do pedido são reconsultados e regravados (não só o do webhook), e o resumo em `orders` é recalculado do zero. Não há somas incrementais.
- Gravação numa única função de banco (refunds + resumo na mesma transação).

## 6. Fonte de cada coluna-resumo em orders (item 11)

| Coluna | Fonte |
|---|---|
| total_received | `order.totalReceivedSet` |
| total_refunded | soma dos refunds `success` + parte SUCCESS dos `mixed` (conferida contra `totalRefundedSet`; divergência = não grava, vai para relatório) |
| refunded_shipping | soma de `refundShippingLines` dos refunds contabilizados |
| net_payment | `order.netPaymentSet` |
| paid_at | `processedAt` da primeira transação SALE/CAPTURE SUCCESS |
| is_paid | true se existe SALE/CAPTURE SUCCESS; false se não existe; nunca volta a false por causa de refund |
| refund_count | nº de refunds contabilizados (success/mixed) |
| first_refunded_at / last_refunded_at | menor/maior `processedAt` (ou `createdAt`) desses refunds |
| refunded_product_amount | soma de `refundLineItems.subtotalSet` dos refunds contabilizados |
| unallocated_refund_amount | total_refunded − refunded_product_amount − refunded_shipping (mínimo 0) |
| financials_verified_at | horário da consulta bem-sucedida |

Nada toca `subtotal`, `current_subtotal`, `net_product_revenue`, `financial_status` ou `valid_order`.

## 7. Casos (itens 12–14)

- Parcial: is_paid true, total_refunded > 0, net_payment > 0; segue venda realizada.
- Total: is_paid true, total_refunded = total_received, net_payment = 0; historicamente pago.
- Sem itens: valor vai para unallocated_refund_amount; nenhuma distribuição inventada por produto. Com itens: refunded_product_amount usa o subtotal de cada item reembolsado.
- Vendas V1 continua usando `valid_order` e não muda.

## 8. Pedidos pagos sem refund (item 15)

Recomendação: **não** mexer no `orders/updated` nem em `sync_shopify_order_payload`. Preencher pela mesma rotina analítica (mesma consulta e mesma função de gravação, com 0 refunds), em dois pontos:
- reconciliação periódica (abaixo), que cobre pedidos novos/atualizados;
- o próprio refunds/create, quando houver.
Resultado: total_received, net_payment, paid_at, is_paid e refund_count = 0 vêm sempre da Shopify, nunca do payload de webhook.

## 9. Reconciliação periódica (itens 16–17)

Frequência proposta: a cada 6 horas, janela das últimas 72 h (sobreposição garante que nada escape). Roda na mesma função worker, sem depender do Dashboard nem da operação.

Seleção de candidatos (obrigatória, nesta ordem):
1. **Consulta read-only à Shopify** dos pedidos alterados na janela — não depende do `updated_at_source` local, então cobre refunds/create ou orders/updated perdidos:
   ```graphql
   query ($cursor: String, $q: String!) {
     orders(first: 50, after: $cursor, query: $q, sortKey: UPDATED_AT) {
       pageInfo { hasNextPage endCursor }
       nodes { id updatedAt displayFinancialStatus }
     }
   }
   ```
   com `$q = "updated_at:>='<agora-72h ISO>'"`. Pagina até `hasNextPage = false`, com teto de 40 páginas (2.000 pedidos) por execução; se atingir o teto, registra "janela incompleta" e a próxima execução continua do último cursor/horário.
2. Cruza com `orders` local pelo GID; pedidos que não existem localmente só entram no relatório (não são criados aqui).
3. Soma pedidos locais com refund `pending`/`mixed` ainda não resolvido (qualquer idade).
4. Soma pedidos locais pagos criados na janela com `financials_verified_at` nulo.
5. Remove duplicados e pula quem foi verificado depois do último `updatedAt` da Shopify.

Processamento: cada candidato passa pela mesma consulta da seção 3 e pela mesma gravação idempotente. Lotes de até 25 pedidos; antes de cada chamada lê `extensions.cost.throttleStatus` (`currentlyAvailable`, `restoreRate`) e espera se o custo previsto não couber. Erro em um pedido: registra e segue; nada parcial gravado para aquele pedido. Com 72 h a janela funciona com `read_orders`; não precisa de `read_all_orders`.
- Agendamento só será criado em passo próprio, depois de aprovação.

## 10. Isolamento e segurança (itens 18, 11 do pedido)

- Não altera `shopify-webhook`, `orders/updated`, `fulfillments/create`, `fulfillments/update`, `_shared/shopify.ts`, rastreio, fila de envio, WhatsApp, Chat, Nina, CRM, Pipeline, Vendas V1.
- Escrita em `order_refunds` e nas colunas novas só pelo backend; leitura direta só admin/manager (já assim desde a Fase 1); SDR sem acesso bruto; futuras RPCs entregam só agregados; `webhook_payload` e transações nunca vão para a tela.
- Teste real de acesso (admin/manager/SDR com sessão real) quando houver a primeira linha; hoje não existe usuário manager — será preciso criar um de teste ou validar só admin/SDR.

## 11. Testes (item 19)

HMAC válido/inválido/ausente; refund SUCCESS, PENDING, FAILURE, MIXED; mesmo refund duas vezes; atualização do mesmo refund (PENDING -> SUCCESS); retrato mais antigo não sobrescreve o novo; parcial; total; sem itens; com itens; IDs longos preservados; cálculo de refunded_product_amount e unallocated_refund_amount; recálculo do resumo do zero; consulta incompleta não grava; pedido local inexistente; divergência com totalRefundedSet não grava; contagens das tabelas operacionais iguais antes/depois.

## Detalhes técnicos

Arquivos (item 20):
- Novo: `supabase/functions/shopify-refunds-webhook/index.ts` (HMAC + gravação na caixa de entrada, sem GraphQL).
- Novo: `supabase/functions/shopify-financials-worker/index.ts` (processa a caixa de entrada e roda a reconciliação; mesma lógica para os dois).
- Alterado: `_shared/shopify_admin.ts` (consulta financeira, busca de pedidos alterados, normalização, cálculo do resumo — só funções novas); `shopify-reconcile-pending/index.ts` (modo novo `scope_check`; modos atuais intactos).
- Novos testes em `src/__tests__/`.
- Agendamento do worker (passo próprio, após aprovação).

Migrations (item 21), ambas aditivas, nenhuma alteração em tabelas existentes:
1. Tabela técnica `shopify_financial_inbox` (caixa de entrada durável): `webhook_id` único (cabeçalho `X-Shopify-Webhook-Id`), `topic`, `shopify_order_id` e `shopify_refund_id` como texto, `payload` jsonb, `status` (pending/processing/done/failed/skipped), `attempts`, `next_attempt_at`, `claimed_at`, `last_error`, datas. RLS ligada sem política para usuários; acesso só do backend. Função de "pegar lote" com `FOR UPDATE SKIP LOCKED` (mesmo padrão das filas já usadas no projeto).
2. Função `apply_order_financials(order_id, refunds jsonb, summary jsonb)` (security definer, executável só pelo backend) que faz o upsert dos refunds e o resumo em `orders` numa transação.

Riscos (item 23): chave HMAC errada (mitigado: teste com webhook de teste da Shopify antes de ligar); acesso a `read_all_orders` negado ou demorado pela Shopify (o fluxo do webhook e da reconciliação de 72 h funciona com `read_orders`; só o backfill da Fase 3 depende dele); limite de custo do GraphQL; refund PENDING por muito tempo (reconciliação revisa); divergência de centavos entre soma e totalRefundedSet (não grava, vai para relatório); caixa de entrada acumulando falhas (limite de tentativas + relatório).

Rollback (item 24): desligar o webhook na Shopify, parar o agendamento e apagar as funções novas; nada operacional depende desses dados. A caixa de entrada pode ficar parada sem efeito. Dados analíticos podem ser zerados (linhas de `order_refunds` e colunas novas voltam a NULL) com sua aprovação explícita. O escopo `read_all_orders` pode ser retirado em nova versão do app.

## Passos do Build, cada um com pausa para aprovação (item 25)

1. Você verifica no Dev Dashboard o fluxo de `read_all_orders` (seção 1) e me conta o que apareceu; segue o fluxo indicado; eu rodo `scope_check` + leitura de 1 pedido de julho (só leitura). Pode correr em paralelo aos passos 2–4.
2. Código: consulta financeira corrigida + cálculo + testes; `financials_dry_run` em 3 pedidos conhecidos (#2009 reembolsado, 1 pago sem refund, 1 recente) — só relatório.
3. Migrations (caixa de entrada + função de gravação) + piloto nesses 3 pedidos; conferir Vendas V1 idêntica e zero efeito operacional.
4. Publicar `shopify-refunds-webhook` e o worker; testar HMAC inválido, duplicado e o "Enviar notificação de teste" da Shopify (pedido fictício -> entra na caixa, worker marca `skipped`, nada gravado em pedidos).
5. Você cadastra o webhook refunds/create; acompanhar o primeiro reembolso real.
6. Reconciliação em modo leitura (relatório dos candidatos das últimas 72 h); depois gravação manual; depois agendamento a cada 15 min (worker) e 6 h (reconciliação).
Backfill histórico fica para a Fase 3.
