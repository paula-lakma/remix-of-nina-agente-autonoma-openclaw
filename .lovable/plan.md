# Vendas V2 — Fase 2: captura futura de pagamentos e reembolsos (somente plano)

Nada é implementado nesta etapa. Sem migration, sem mudança no app Shopify, sem webhook novo, sem preencher campos da Fase 1, sem backfill (fica para a Fase 3).

## 1. read_all_orders (itens 1–3, 22)

Hoje a função `shopify-reconcile-pending` pega token via client credentials do app `crm-eccomerce-2-read-orders` (secrets SHOPIFY_SHOP_DOMAIN / CLIENT_ID / CLIENT_SECRET). `read_orders` só enxerga os últimos 60 dias.

Mudança exata (feita por você no Dev Dashboard da Shopify, quando aprovado):
- Na configuração do app, em "Access scopes", deixar `read_orders,read_all_orders` (mantendo `read_orders`, nenhuma outra permissão).
- Salvar e **lançar uma nova versão** do app ("Release"). Mudança de escopo sempre gera nova versão.
- Na loja lakma-wig, **aprovar a atualização** de permissões (a Shopify pede para o dono aceitar os novos escopos). Não precisa desinstalar/reinstalar. Para apps de uso próprio da loja, `read_all_orders` não passa por revisão da Shopify; se o painel pedir justificativa, informar "análise histórica de vendas e reembolsos da própria loja".
- Os webhooks manuais (Configurações > Notificações > Webhooks) não pertencem ao app e não são afetados.
- Secrets não mudam; o próximo token já vem com o escopo novo.

Validação read-only (Build, passo 1): novo modo `scope_check` na função existente que:
- consulta `currentAppInstallation { accessScopes { handle } }` e confirma `read_orders` + `read_all_orders`;
- lê 1 pedido de julho (o primeiro pedido válido de julho no banco, escolhido na hora e informado no relatório) com `fetchOrderWithAllItems`;
- sucesso = pedido encontrado, consulta completa, itens batendo pelo GID; antes da liberação esse mesmo teste deve retornar "não encontrado/acesso negado" (registrado como prova).
- Zero gravações, contagens antes/depois.

## 2. Arquitetura do refunds/create (itens 4–6)

```text
Shopify refunds/create (webhook manual, JSON)
  -> shopify-refunds-webhook (nova função, sem login)
  -> valida HMAC (corpo bruto, comparação em tempo constante); inválido = 401, nada gravado
  -> extrai order_id e refund_id (como texto, sem conversão numérica)
  -> busca pedido local (orders.source_order_id); se não existir: responde 200 e deixa para a reconciliação
  -> consulta GraphQL Admin (token server-side) o pedido + refunds atuais
  -> recalcula e grava só order_refunds + colunas financeiras de orders
  -> responde 200 rápido
```

- Função nova e separada: `supabase/functions/shopify-refunds-webhook`. Não reutiliza `shopify-webhook`, rastreio, fila de envio, WhatsApp.
- Cadastro: Configurações > Notificações > Webhooks > "Criar webhook", evento "Reembolso criado", JSON, versão 2026-07, URL `https://<projeto>.supabase.co/functions/v1/shopify-refunds-webhook`.
- HMAC: webhooks manuais são assinados com a chave exibida nessa mesma tela, a mesma já usada como `SHOPIFY_WEBHOOK_SECRET` pela função atual. Reaproveitar esse secret (só leitura); o código de verificação será copiado para um arquivo próprio da função nova, sem tocar no `shopify-webhook`.
- O webhook não é prova de dinheiro devolvido: o conteúdo dele só serve para saber qual pedido consultar; valores vêm sempre da consulta GraphQL. O payload bruto fica em `webhook_payload` apenas para auditoria.

## 3. Consulta GraphQL (item 7)

Mesma base validada no `refund_audit`, ampliada para servir pedidos com e sem refund:

```graphql
order(id: $gid) {
  id updatedAt processedAt cancelledAt test displayFinancialStatus
  totalReceivedSet { shopMoney { amount currencyCode } }
  totalRefundedSet { shopMoney { amount } }
  totalRefundedShippingSet { shopMoney { amount } }
  netPaymentSet { shopMoney { amount } }
  transactions(first: 100) { id kind status gateway processedAt parentTransaction { id }
    amountSet { shopMoney { amount } } }
  refunds(first: 100) { id createdAt processedAt updatedAt note
    totalRefundedSet { shopMoney { amount currencyCode } }
    refundShippingLines(first: 50) { pageInfo { hasNextPage endCursor }
      nodes { subtotalAmountSet { shopMoney { amount } } } }
    refundLineItems(first: 100) { pageInfo { hasNextPage endCursor }
      nodes { lineItem { id } quantity subtotalSet { shopMoney { amount } } } }
    transactions(first: 50) { pageInfo { hasNextPage endCursor }
      nodes { id kind status gateway processedAt parentTransaction { id } amountSet { shopMoney { amount } } } } }
}
```

Todas as connections por Refund são paginadas até o fim; se alguma falhar, o pedido fica "incompleto" e nada é gravado. Respostas lidas com o parser sem perda já existente (IDs como texto/GID).

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

- Frequência proposta: a cada 6 horas, janela das últimas 72 h (sobreposição garante que nada escape).
- Candidatos: pedidos com `updated_at_source` nas últimas 72 h, mais pedidos com refund `pending`/`mixed` ainda não resolvido, mais pedidos com `financials_verified_at` nulo criados na janela. Opcional: busca na Shopify `orders(query: "updated_at:>=...")` para pegar refunds cujo webhook se perdeu.
- Lotes de até 25 pedidos, pausa entre chamadas, respeitando o limite de custo do GraphQL (lê `extensions.cost` e espera quando necessário).
- Idempotente pelo mesmo upsert/recálculo. Erro em um pedido: registra e segue; nada parcial gravado para aquele pedido.
- Cron só será criado em passo próprio, depois de aprovação.

## 10. Isolamento e segurança (itens 18, 11 do pedido)

- Não altera `shopify-webhook`, `orders/updated`, `fulfillments/create`, `fulfillments/update`, `_shared/shopify.ts`, rastreio, fila de envio, WhatsApp, Chat, Nina, CRM, Pipeline, Vendas V1.
- Escrita em `order_refunds` e nas colunas novas só pelo backend; leitura direta só admin/manager (já assim desde a Fase 1); SDR sem acesso bruto; futuras RPCs entregam só agregados; `webhook_payload` e transações nunca vão para a tela.
- Teste real de acesso (admin/manager/SDR com sessão real) quando houver a primeira linha; hoje não existe usuário manager — será preciso criar um de teste ou validar só admin/SDR.

## 11. Testes (item 19)

HMAC válido/inválido/ausente; refund SUCCESS, PENDING, FAILURE, MIXED; mesmo refund duas vezes; atualização do mesmo refund (PENDING -> SUCCESS); retrato mais antigo não sobrescreve o novo; parcial; total; sem itens; com itens; IDs longos preservados; cálculo de refunded_product_amount e unallocated_refund_amount; recálculo do resumo do zero; consulta incompleta não grava; pedido local inexistente; divergência com totalRefundedSet não grava; contagens das tabelas operacionais iguais antes/depois.

## Detalhes técnicos

Arquivos (item 20):
- Novo: `supabase/functions/shopify-refunds-webhook/index.ts` (+ verificação HMAC própria).
- Alterado: `_shared/shopify_admin.ts` (consulta financeira, normalização, cálculo do resumo — só funções novas); `shopify-reconcile-pending/index.ts` (modos novos `scope_check`, `financials_dry_run`, `financials_pilot`; modos atuais intactos).
- Novos testes em `src/__tests__/`.
- Futuro: `shopify-financials-reconcile` (rotina periódica) e o agendamento.

Migrations (item 21): uma pequena, aditiva — função de banco `apply_order_financials(order_id, refunds jsonb, summary jsonb)` (security definer, executável só pelo backend) que faz o upsert e o resumo numa transação. Nenhuma coluna ou tabela nova. Se preferir zero migration, a função grava em duas etapas pelo cliente do backend, com risco pequeno de estado parcial — recomendo a função.

Riscos (item 23): chave HMAC errada (mitigado: teste com webhook de teste da Shopify antes de ligar); escopo novo não aprovado (scope_check acusa); limite de custo do GraphQL; refund PENDING por muito tempo (reconciliação revisa); divergência de centavos entre soma e totalRefundedSet (não grava, vai para relatório).

Rollback (item 24): desligar o webhook na Shopify e apagar a função nova; nada operacional depende desses dados. Dados analíticos podem ser zerados (linhas de `order_refunds` e colunas novas voltam a NULL) com sua aprovação explícita. O escopo `read_all_orders` pode ser retirado em nova versão do app.

## Passos do Build, cada um com pausa para aprovação (item 25)

1. Você adiciona `read_all_orders` e aprova na loja; eu rodo `scope_check` com 1 pedido de julho (só leitura).
2. Código: consulta financeira + cálculo + testes; modo `financials_dry_run` em 3 pedidos conhecidos (#2009 reembolsado, 1 pago sem refund, 1 recente) — só relatório.
3. Migration da função de gravação + `financials_pilot` nesses 3 pedidos; conferir Vendas V1 idêntica e zero efeito operacional.
4. Publicar `shopify-refunds-webhook`; testar com HMAC inválido e com o "Enviar notificação de teste" da Shopify (pedido fictício -> não grava).
5. Você cadastra o webhook refunds/create; acompanhar o primeiro reembolso real.
6. Rotina periódica em modo leitura; depois gravação; depois agendamento a cada 6 h.
Backfill histórico fica para a Fase 3.
