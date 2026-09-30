# Auditoria read-only dos pedidos que continuam pending

Nada é gravado. Sem migration, sem reconciliar nenhum pedido, sem mudar o Dashboard.

## O que já foi confirmado no banco (leitura feita agora)

- **46 pedidos pending.** Somam R$18.657,76 no total e R$17.525,25 em receita de produto. Datas de 16/08 a 30/09 (São Paulo).
- Todos com `valid_order = false`, sem cancelamento e sem status de entrega. 20 têm contato vinculado.
- **Os 46 têm só 1 evento cada, um `orders/updated`.** Nenhum evento posterior foi salvo. Isso indica que a atualização da Shopify (EXPIRED ou REFUNDED) se perdeu pelo antigo problema de idempotência, ou nunca chegou.
- Desde o apply chegou 1 pedido novo, e ele não ficou pending. Status no banco agora: 396 paid e válidos, 46 pending, 1 voided.
- **Regra de venda válida:** o pedido só é válido se estiver `paid`, não cancelado e não for de teste. Qualquer outro status fica fora.
- **Dashboard Vendas:** conta só pedidos válidos, tanto em pedidos quanto em receita e ticket médio. Pending, expired, refunded, partially_refunded e cancelled ficam todos de fora hoje, então não distorcem nada.
- **Reembolso:** a sincronização atual não tem tratamento de reembolso. O status da Shopify é copiado como está.
- **Operação:** nenhuma função de WhatsApp, rastreio, Chat, Nina, fila de envio ou encaminhamento lê o status de pagamento do pedido. O status é só analítico.

## O que falta executar após a aprovação (somente leitura)

1. Registrar as contagens antes: eventos, pedidos, itens, fila de envio, travas de rastreio, mensagens, conversas e encaminhamentos.
2. Rodar o modo `dry_run` já publicado, que só lê. Ele consulta na Shopify todos os pedidos pending do banco e traz: status financeiro, cancelamento, status de entrega (só informativo), datas, valor atual, valor reembolsado e quantidade de itens.
3. Classificar cada pedido como PENDING, PAID, EXPIRED, REFUNDED, PARTIALLY_REFUNDED, CANCELLED, AUTHORIZED, VOIDED, outro, não encontrado, erro ou consulta incompleta.
4. Se aparecer algum PAID novo, só destacar no relatório. Não reconciliar.
5. Para os EXPIRED e os REFUNDED:
   - comparar a última alteração na Shopify com a do último evento salvo;
   - classificar em A (perdemos uma atualização), B (banco coerente com o que recebeu) ou C (indeterminado);
   - para os REFUNDED, trazer total original, total reembolsado, itens e datas, e dizer se já contaram como venda.
6. Registrar as contagens depois e confirmar que nada mudou.

O `dry_run` já retorna o status e o valor reembolsado. Se faltar algum campo informativo, uso o `auth_check`, que também só lê. Nenhum código é alterado.

## Relatório final (os 16 itens pedidos)

Inclui propostas separadas, sem implementar:

- **A. EXPIRED:** a fonte seria a Shopify. Passaria por um evento técnico em `shopify_events`, o que pede avaliar um topic próprio, já que `orders/reconciled` hoje só aceita PAID. Impacto no Dashboard: zero, porque continuam fora.
- **B. REFUNDED:** o mesmo caminho. Continuam não válidos, então o impacto na receita é zero.
- **C. PARTIALLY_REFUNDED:** exige decidir se a receita deve ser líquida do reembolso. Pode precisar de mudança na regra de venda válida, e aí sim de migration.
- **D. PAID novo:** o mesmo fluxo já validado, por lista fechada.
- **E. Pending legítimo:** nenhuma ação.

Para cada grupo o relatório traz: riscos, se precisa de migration e o que teria de mudar num Build futuro. Os candidatos são o modo `pilot` e a validação do cliente em `shopify-reconcile-pending`, e a `sync_shopify_order_payload` só se houver reembolso parcial.

## Garantias

Zero gravações: só consultas e o `dry_run` read-only. Contagens registradas antes e depois.
