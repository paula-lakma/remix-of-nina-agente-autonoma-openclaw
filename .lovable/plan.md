# Vendas: por que os pedidos após 24/09 aparecem como não pagos (read-only)

Nada foi alterado. Todas as leituras foram feitas no banco e no código em 29/09/2026, por volta das 17:16 (horário de São Paulo).

## Respostas objetivas

| Dia (SP) | Total | Válidos | Status financeiros |
|---|---|---|---|
| 23/09 | 5 | 3 | paid, pending |
| 24/09 | 10 | 7 | paid, pending |
| 25/09 | 2 | 1 | paid, pending |
| 26/09 | 3 | 1 | paid, pending |
| 27/09 | 6 | 4 | paid, pending |
| 28/09 | 11 | 0 | todos pending |
| 29/09 | 8 | 0 | todos pending |

Nenhum pedido está cancelado ou marcado como teste.

1. **Existem pedidos depois de 24/09?** Sim, 30 pedidos entre 25 e 29/09.
2. **Por que não aparecem?** Chegam como `pending`. O status só vira `paid` na base quando o pedido é **despachado** (recebe código de rastreio), em média 3,6 dias depois (mediana de 3,1).
3. **Os números da tela já mudaram hoje.** Às 17:04–17:12 UTC chegaram os status "pago" dos pedidos 2269, 2270, 2273, 2276 e outros (junto com o rastreio). Com isso, 25/09 a 27/09 já têm 6 pedidos válidos. A tela vista antes disso (ou guardada no cache de 5 minutos) mostrava 8.
4. **A camada de pedidos está sincronizada?** Sim. Em todos os pedidos de 23 a 29/09, `orders` reflete exatamente o evento mais recente salvo em `shopify_events`. Não foi encontrado nenhum caso de evento `paid` com pedido `pending`.
5. **A reconciliação diária funciona?** Sim. O job `sync-shopify-orders-daily` (06:30 UTC = 03:30 SP) está ativo; a última execução, em 29/09 às 06:30 UTC, terminou com sucesso.
6. **Fuso horário e Dashboard:** sem erro. As funções filtram por `valid_order` e `created_at_source >= início < fim`, com início às 00:00-03:00. Os números por dia batem com a consulta direta.
7. **Regra de pedido válido:** paid, sem cancelamento e sem teste. Nos dados só existem `paid` e `pending`, então a regra não explica a diferença.
8. **Os eventos da Shopify continuam chegando?** Sim, chegam todos os dias (29/09: 17 atualizações de pedido e 9 de despacho; última às 20:14 UTC).

## Causa raiz (confirmada)

A proteção contra duplicados do webhook da Shopify monta a chave do evento assim:

```text
orders/updated:<id do pedido>[:<código de rastreio>]
```

- A primeira atualização do pedido (ainda `pending`) é salva.
- A atualização seguinte, **pending -> paid, sem rastreio**, gera **a mesma chave** e é descartada como "evento duplicado". Ela nunca chega a `shopify_events`.
- Só quando o pedido recebe rastreio a chave muda (`...:AP555161045BR`). Aí a versão já paga é salva e `orders` atualiza.

Isso aparece nos dados: os pedidos pagos têm exatamente 2 eventos (pending sem rastreio e paid com rastreio). Os que seguem pending têm apenas 1 evento.

Hipóteses: A falsa. B verdadeira como sintoma. C parcial: os eventos chegam, mas a atualização de pagamento é descartada. D falsa. E falsa: a Shopify envia, o sistema é que ignora. F falsa.

## Alcance

- Afeta somente as métricas de Vendas (`orders`/`order_items`): pedidos ficam `pending` até o despacho, e os dias recentes aparecem subestimados.
- Não afeta os avisos de rastreio no WhatsApp: a chave inclui o rastreio e esses avisos continuam funcionando.
- Pedidos pagos e nunca despachados ficam `pending` para sempre. Exemplos: 2259, 2261, 2267, 2268, 2271 e 2272, de 23 a 25/09. Precisa confirmar na Shopify se foram pagos.
- Setembro: 58 pedidos continuam `pending` (32 Pix e 26 cartão, pela Appmax).
- A reconciliação diária não resolve, porque só reprocessa o que já foi salvo em `shopify_events`.

## Proposta mínima de correção (aguardando aprovação)

1. No webhook, incluir o `updated_at` do payload na chave de duplicidade **apenas** para `orders/updated`. Assim, cada atualização real é salva e reenvios idênticos da Shopify continuam descartados. As atualizações sem rastreio já terminam como `ignored` sem enviar nada, e o aviso de rastreio continua protegido pela trava própria por pedido e rastreio.
2. Recuperação dos pedidos já afetados (opcional, em etapa separada): consultar a Shopify apenas para ler o status atual dos pedidos `pending` desde 28/07 e atualizar `orders`, sem gerar eventos de envio.
3. Testes: um pending seguido de paid sem rastreio grava 2 eventos e o pedido fica válido; um reenvio idêntico é descartado; o aviso de rastreio não é duplicado; a suíte completa passa.

Nada disso será feito sem a sua aprovação.
