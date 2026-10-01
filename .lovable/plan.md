# Auditoria somente leitura dos 3 pedidos REFUNDED (#2009, #2036, #2107)

## O que já foi confirmado no banco (leitura feita agora)

| Pedido | Criado (UTC) | Total | Subtotal | Desconto | Frete | Cupom | Status salvo | Eventos |
|---|---|---|---|---|---|---|---|---|
| #2009 | 27/08 21:05 | R$659,48 | R$659,48 | R$355,10 | R$0,00 | ANEX | pending | 1 |
| #2036 | 31/08 22:10 | R$336,60 | R$336,60 | R$0,00 | R$0,00 | — | pending | 1 |
| #2107 | 10/09 12:07 | R$522,96 | R$522,96 | R$427,86 | R$0,00 | MARCELLALAKMA | pending | 1 |

- Os três têm um único evento (`orders/updated`), salvo 2 segundos depois da criação, com status pending e lista de reembolsos vazia.
- Nunca recebemos nenhum estado intermediário (nem pago, nem reembolsado). Pagamento e reembolso foram os dois perdidos.
- Não existe hoje nenhum pedido com status refunded ou partially_refunded no banco.
- O modelo de `orders` guarda só o estado final: não há colunas de valor reembolsado, data de pagamento ou de reembolso.

## Limitação que impede responder tudo sem uma leitura nova

A função publicada consulta na Shopify só status, totais e itens. Ela **não lê** refunds, transações, gateway, itens reembolsados nem frete reembolsado. As credenciais da Shopify existem só dentro da função, então não dá para fazer essa leitura por fora.

Para reconstruir o histórico financeiro real é preciso adicionar um **modo novo, só de leitura** (`refund_audit`) na função de reconciliação. Ele:
- aceita só esses 3 IDs, fixos no código (allowlist);
- faz apenas consulta (sem mutation);
- não insere eventos e não grava em nenhuma tabela;
- não retorna nem registra token ou segredo.

Isso é uma mudança de código. A mudança não grava nada, mas preciso da sua aprovação, já que você pediu "não alterar código".

## Execução após aprovação

1. Registrar as contagens das tabelas protegidas (antes).
2. Publicar só a função de reconciliação com o modo `refund_audit`, que é só leitura.
3. Rodar a leitura dos 3 pedidos.
4. Registrar as contagens (depois) e confirmar zero gravações.
5. Entregar o relatório com os 20 itens pedidos, separando:
   - valor do pedido;
   - valor efetivamente pago;
   - valor efetivamente reembolsado;
   - saldo líquido final.
   Não vou assumir que REFUNDED significa devolução total sem conferir as transações.

## Análise que entra no relatório (sem implementar)

- **Status pending → refunded:** pelo mesmo caminho do EXPIRED (evento técnico → sincronização existente → pedidos). Sobrescrever só `financial_status` e `updated_at`, preservando itens, IDs, produtos, variantes, quantidades, valores, cupons, cliente, entrega e data de criação. Impacto em Vendas: zero, porque já estão fora.
- **Histórico comercial (venda paga depois reembolsada):** hoje não é representável. Separar venda, reembolso e receita líquida exigiria colunas novas ou uma tabela de reembolsos, mudanças nas funções de Vendas e migration.
- **Reembolso parcial:** hoje o pedido sairia inteiro de venda válida, porque só `paid` conta. Corrigir isso exige decisão de regra, colunas novas, ajuste em `valid_order`, nas funções de Vendas e migration.
- Riscos e próximo passo recomendado.

## Detalhes técnicos

Consulta proposta (GraphQL Admin 2026-07, `read_orders`):

```text
order(id) {
  name createdAt updatedAt displayFinancialStatus cancelledAt
  totalPriceSet subtotalPriceSet totalDiscountsSet totalShippingPriceSet
  totalReceivedSet totalRefundedSet totalRefundedShippingSet netPaymentSet
  transactions(first:50) { id kind status gateway processedAt amountSet{shopMoney{amount currencyCode}} parentTransaction{id} }
  refunds(first:20) {
    id createdAt note totalRefundedSet
    refundLineItems(first:50){ nodes{ quantity lineItem{id} subtotalSet } }
    refundShippingLines(first:10){ nodes{ subtotalAmountSet } }
    transactions(first:20){ nodes{ kind status gateway processedAt amountSet{shopMoney{amount}} } }
  }
}
```

- Arquivos: `supabase/functions/shopify-reconcile-pending/index.ts` (modo novo) e `supabase/functions/_shared/shopify_admin.ts` (consulta e resumo), mais um teste que garante que o modo não grava.
- Se algum campo não existir na versão 2026-07 ou for negado, isso entra no relatório. Não vou tentar contornar.
- Sem migration. Não toco no webhook, no Dashboard, em `sync_shopify_order_payload` nem nos pedidos novos (#2317, #2333).
