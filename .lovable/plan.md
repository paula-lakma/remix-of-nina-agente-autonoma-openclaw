# Auditoria de dados — RFV V1, métricas de e-commerce e recompra (somente leitura)

Nada foi alterado. Consultas feitas apenas em leitura em 28/09/2026. Números abaixo são reais da base atual.

## 1. Fontes de venda hoje
| Fonte | Onde está | Situação |
|---|---|---|
| Shopify (site) | `shopify_events`, payload bruto completo | Única fonte real de pedidos |
| Comercial / vendas diretas | Não existe tabela de pedido. `manual_tracking_logs` (81 envios) guarda só nº pedido, telefone, nome, rastreio e transportadora — sem valor, itens ou vendedor | Não serve como venda |
| Shopee, TikTok, marketplaces, importações | Nada encontrado | Não existem |

Todos os 414 pedidos têm `source_name = web`. Não há canal separado dentro da Shopify.

## 2. Dados Shopify disponíveis
- Eventos: 741 `orders/updated` (hoje marcados "ignored", mas o payload completo está salvo), 345 `fulfillments/create`, 142 `fulfillments/update`.
- 414 pedidos distintos, de 28/07 a 28/09/2026 (**apenas ~2 meses de histórico**).
- Status financeiro: 347 pagos, 66 pendentes, 1 anulado. 1 cancelado. 0 reembolsos registrados.
- Por pedido existem: cliente (id, e-mail, telefone), subtotal, descontos, frete, total, cupons (382 pedidos com cupom), itens com `product_id`/`variant_id`/nome/quantidade/preço. **SKU vazio** em 413 de 414.
- Sem CPF/documento. Sem tag "profissional". Aceite de marketing em só 2 pedidos (campo pouco usado).

## 3. Ligação pedido -> contato
- Chave principal proposta: `customer.id` da Shopify para agrupar pedidos; telefone normalizado (últimos 10 dígitos) para ligar ao `contact_id`.
- 347 pedidos válidos: 347 com telefone, **344 ligados a um contato (99%)**, 3 sem contato.
- Riscos: 2 telefones duplicados em contatos; 3 clientes Shopify com mais de um telefone; duplicidade de pedido controlável pelo id do pedido (o mesmo pedido aparece várias vezes em `orders/updated`, precisa pegar a versão mais recente).

## 4. Pedido válido e receita líquida (proposta)
- `valid_order` = pago (ou parcialmente reembolsado) E sem cancelamento E não é teste.
- Receita líquida = `current_subtotal_price` (produtos já com desconto e ajustado após reembolsos) ; frete separado (`total_shipping_price_set`).
- Hoje: 347 pedidos válidos, R$ 103.191 líquido, ticket médio R$ 297. Devoluções não podem ser confirmadas (nenhuma ocorreu no período).
- Fraude: não há sinal confiável guardado.

## 5. Data real de entrega
- Existe parcialmente: `shipment_status = delivered` chega em `fulfillments/update` — 18 fulfillments entregues de ~345.
- Hoje distinguimos: pedido criado, pago, fulfillment criado, rastreio gerado. "Despachado" ~ fulfillment com rastreio. "Entregue" só nesses 18 casos.
- **Não há `order_delivered_at` confiável para a maioria.** A Frenet deve enviar: order_id/nº pedido, telefone, transportadora real, tracking_code, event_type, status, `delivered_at`, event_id, tracking_url. Sim, `order_delivered` é o evento que falta.

## 6. Itens, catálogo e tipo de cliente
- Itens: dá para responder "o que o cliente comprou" por `product_id`/nome. Categoria exige ligar produto Shopify a `brain_products` (84 produtos; categorias "profissional" 63 e "home care" 41; `tipo_uso` vazio em todos; sem id Shopify). Precisa de uma tabela de mapeamento — não criar nova taxonomia.
- Tipo de cliente: só 1 contato classificado (`profissional_estetica`) em `crm_contact_profiles`. Nenhuma tag Shopify. **Não dá para separar profissional/home care/distribuidor hoje.**

## 7. RFV hoje
- R: sim. F: sim, mas só 2 meses (não 12). V: sim na base geral; por tipo de cliente, não.
- Clientes que já poderiam ter RFV: 322 (clientes Shopify com pedido válido).
- Distribuição de pedidos por cliente: 308 com 1, 10 com 2, 2 com 3, 1 com 5, 1 com 8.
- Simulação (sem gravar): quase todos terão R = 4 ou 5 e F = 1, portanto a maioria cai em "Novos" ou **em nenhum segmento**.
- Problemas das regras:
  - Sem segmento: R=4 e F=1; R=3 e F=1–2 com V<4; R≤2 com F≤2 e V≥3 fora de "Em risco".
  - Sobreposições: Campeões x Leais x Alto valor; Em atenção x Em risco (R=2). Precisa de ordem de prioridade: Campeões > Leais > Alto valor > Promissores > Novos > Em risco > Em atenção > Hibernando, mais um segmento "Outros/Não classificado".
  - Contato sem pedido válido = prospect, sem RFV.

## 8. Métricas possíveis hoje
Possíveis: pedidos, faturamento bruto/líquido, ticket médio, clientes novos, recorrentes, produtos mais vendidos, vendas por cupom, cancelamentos.
Com pouca confiança (histórico curto): segunda compra, dias entre pedidos, ticket de recompra, LTV 90.
Sem dado: LTV 180/365, categorias (falta mapeamento), vendas por canal (só site), devoluções, margem (sem custo), profissional x cliente final.

## 9. Recompra D+25
- Bloqueios detectáveis: contato bloqueado, conversa com humano/handoff aberto, nova compra (pelos pedidos), pedido cancelado.
- Faltam: opt-out de marketing (não existe; `is_blocked` é bloqueio geral, 0 casos), entrega real, reclamação aberta estruturada.
- Idempotência: chave única `contact_id + order_id + 'recompra_v1'`.
- Nova compra antes do envio cancela; depois encerra o ciclo (detectável pelo novo pedido).
- Template: precisa de template Meta de marketing novo, aprovado, enviado pela mesma fila atual; nada criado agora.

## 10. Arquitetura proposta (futura, nova camada)
```text
shopify_events (bruto) --job--> orders + order_items --job semanal--> customer_rfv (+ histórico)
comercial (futuro formulário/webhook) -->  orders (canal = comercial)
Frenet / fulfillments --> delivery_events --> reorder_triggers --> fila de envio atual
```
Tabelas futuras: `orders`, `order_items`, `product_map` (Shopify -> brain_products), `delivery_events`, `customer_rfv` e `customer_rfv_history`, `marketing_preferences` (opt-out), `reorder_triggers`.
Jobs: preencher pedidos a partir de `shopify_events` (incluindo histórico já salvo), cálculo RFV semanal no banco, verificação diária D+25. Nada no navegador, nenhum gatilho em mensagens/conversas. CRM, Chat, Nina e WhatsApp continuam funcionando se isso falhar.

## 11. Riscos
Histórico curto; tipo de cliente inexistente; SKU vazio; entrega real rara; comercial sem dado de venda; telefones duplicados.

## 12. Ordem recomendada
1. Camada de pedidos + itens com base no que já está salvo.
2. Dashboard e-commerce V1 (visão geral, produtos, cupons).
3. Mapeamento de produtos e tipo de cliente.
4. Entrada de vendas do comercial.
5. RFV semanal com prioridade de segmentos ajustada.
6. Frenet (entrega) + opt-out + template -> recompra.

Aguardando sua aprovação; nada será implementado sem ela.
