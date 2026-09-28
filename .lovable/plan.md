# Dashboard E-commerce V1 — auditoria e arquitetura (read-only, aguardando aprovação)

Nada foi alterado. Números abaixo são de 28/09/2026 16:38 (horário de SP) e servem só para validar o Build.

## 1. Dashboard atual (auditoria)

- Rota `/dashboard`, arquivo `Dashboard.tsx`; blocos: aviso de configuração, Status do Sistema, filtro Hoje/7/30 dias, 6 cards operacionais (`OverviewCards`), Fila de atenção (`AttentionQueue`), Atendimentos por responsável (`ResponsibleTable`), Rastreio (`TrackingBlock`), gráfico de volume de mensagens (recharts).
- Fontes: `services/dashboardMetrics.ts`, consultas diretas a conversas, mensagens, contatos, eventos de encaminhamento, travas de rastreio, histórico manual e eventos Shopify, sem RPC.
- Acesso no menu/rota: admin, manager e moderator. SDR **não** vê o Dashboard hoje.
- Visual: fundo escuro, cartões arredondados com borda, grade de 2 a 3 colunas.

## 2. Recomendação: página própria, "Vendas" (Opção B)

Rota `/ecommerce`, item "Vendas" no menu, logo abaixo do Dashboard.

- Vantagens: não toca no Dashboard operacional nem no carregamento dele (cerca de 12 consultas); permissões independentes; filtros próprios (90 dias e período personalizado não fazem sentido na operação).
- Riscos: um item a mais no menu. A Opção A (abas) exigiria mexer no `Dashboard.tsx` e misturaria as regras de acesso dos dois painéis.

## 3. Acesso

Build V1: admin e manager. A decisão sobre SDR fica em aberto; ela não é excluída de forma definitiva.

- No app, o acesso é controlado pela área `ecommerce` em `useUserRole.ts`, que decide menu e rota. Liberar SDR depois é só acrescentar `'ecommerce'` à lista do SDR, sem migration e sem mexer nas funções SQL.
- No banco, as funções exigem os mesmos papéis que já leem `orders`/`order_items` (admin, manager e sdr, via `is_operational_staff`). Assim ficam alinhadas às permissões atuais e não precisam mudar se o SDR for liberado. As policies de `orders`/`order_items` não são alteradas.
- Dermo, expedição, parcerias e rastreio: bloqueados no app e no banco.

## 4. Definições oficiais (valem para Dashboard, RFV, recompra e relatórios)

| Termo | Definição |
|---|---|
| Pedido | 1 linha de `orders` (1 pedido Shopify) |
| Pedido válido | `valid_order = true`. Hoje isso significa pago (`paid`), não cancelado e não teste. Pendentes, anulados e testes ficam de fora |
| Data comercial | `created_at_source`, agrupada no fuso America/Sao_Paulo. Nunca está vazia; em 27 pedidos difere de `processed_at_source` por poucos minutos. `updated_at_source` muda depois e não serve para vendas |
| Receita de produtos | `SUM(net_product_revenue)` dos válidos: produtos já com desconto, sem frete. Bate exatamente com a soma dos itens (R$ 103.191,37) |
| Frete cobrado | `SUM(shipping_amount)`, exibido separado |
| Valor total dos pedidos | `SUM(total_amount)` (produtos + frete), exibido só como informação secundária |
| Ticket médio | receita de produtos ÷ pedidos válidos |
| Cliente | chave `contact_id`; se vazio, telefone normalizado; se vazio, `shopify_customer_id`. Escolhido porque o contato já une as compras da mesma pessoa. Há 3 casos em que um mesmo cliente Shopify aparece ligado a contatos diferentes (e o inverso); ficam como limitação, sem nova resolução de identidade |
| Classificação de clientes | O filtro escolhe **quais clientes aparecem**: os que têm pedido válido no período. A classificação de cada um olha **todo o histórico válido até o fim do período**, desde 28/07/2026, e não só os pedidos dentro do filtro |
| Primeira compra conhecida | primeiro pedido válido do cliente em todo o histórico disponível |
| Cliente novo (no período) | primeira compra conhecida está dentro do período |
| Recompra no período | cliente com pedido válido no período e primeira compra conhecida **antes** do início do período (ex.: comprou em agosto e em setembro, filtro de setembro, entra aqui), ou com 2+ pedidos dentro do período |
| Cliente recorrente (no período) | cliente do período com 2+ pedidos válidos no histórico até o fim do período |
| Cliente recorrente (base) | 2 ou mais pedidos válidos em todo o histórico |
| Segunda compra | 2º pedido válido por data comercial; intervalo = data do 2º menos data do 1º |
| Cupom | cada código em `coupon_codes` (maiúsculas). Pedido com 2 cupons conta nos dois; hoje há 0 casos assim |
| Produto vendido | linha de `order_items` de pedido válido. Identificado por `shopify_product_id` e, na falta dele, pelo nome; exibido com o nome mais recente; quantidade = `current_quantity` (ou `quantity`); receita = `line_total` |

## 5. Números atuais da base

- Pedidos: 418 no total; 347 válidos; 70 pendentes; 1 anulado (teste). 1 dos válidos tem entrega parcial
- Receita de produtos: R$ 103.191,37; frete R$ 6.916,17; total R$ 110.107,54; ticket médio R$ 297,38
- Primeira data: 28/07/2026; última: 28/09/2026. Julho: 5 pedidos; agosto: 147 (R$ 48.610,76); setembro: 195 (R$ 53.330,08)
- Clientes únicos: 328. Com 1 pedido: 311; com 2: 15; com 3 ou mais: 2 (taxa de recorrência de 5,2%)
- Intervalo entre pedidos (19 intervalos): média de 10,4 dias, mediana de 4,7 dias. Em 8 casos, menos de 1 dia (pedido repetido ou complemento)
- Produtos diferentes: 95; variantes: 94, praticamente 1 por produto, então a V1 não diferencia variantes. Sem SKU: 726 de 726 itens
- Top produtos por quantidade: Fluído de Peptídeos (70), Neuroplasma 50ml (48), Máscara Clareadora 10g (44), Microagulhamento 8g (35), Peeling Retinol 30ml (29), Máscara Clareadora 30g (26), Zen Marine (26), Esbeltea (26), Kit Limpeza de pele (26), Kit Le Celegatto (23)
- Top produtos por receita: Fluído de Peptídeos (R$ 9.371,79), Kit Le Celegatto (R$ 6.665,45), Kit Ácidos + Peeling + Guia (R$ 5.492,06), Kit Limpeza de pele (R$ 5.301,48), Neuroplasma (R$ 5.212,04), Kit Fluidos Microagulhamento (R$ 5.175,65), Peeling Retinol (R$ 4.994,14), Kit Limpeza sem Trieta (R$ 4.359,00), Kit Ácidos + Guia (R$ 3.288,59), Microagulhamento 8g (R$ 2.731,30)
- Cupons: 326 dos 347 válidos usaram cupom (os 382 da auditoria antiga incluíam pendentes). Receita com cupom: R$ 98.098,65; sem cupom: R$ 5.092,72
- Top cupons (pedidos / receita / ticket): THAINACAROLINE 69 / R$ 22.971 / R$ 333; MARCELLALAKMA 60 / R$ 17.911 / R$ 299; LAKMA30 47 / R$ 13.571 / R$ 289; LECELEGATTO 22 / R$ 6.085 / R$ 277; SHEILA 18 / R$ 4.321 / R$ 240; LAKMAH 15 / R$ 5.087 / R$ 339; BIAROCHA 13 / R$ 2.510 / R$ 193; DRALO 11 / R$ 2.612 / R$ 237; SANDRINISOUZA 10 / R$ 3.585 / R$ 359; PEELING50 7 / R$ 1.370 / R$ 196

## 6. Limitações do histórico de cerca de 2 meses

"Cliente novo" quer dizer novo desde 28/07/2026. Recorrência, segunda compra e intervalo ficam subestimados e têm amostra pequena (19 intervalos). Por isso, esses números aparecem com o aviso "Baseado no histórico disponível desde 28/07/2026" e não entram nos cards principais.

## 7. Interface V1

**Filtros:** Hoje, 7 dias, 30 dias, 90 dias e Personalizado. O calendário não permite datas antes de 28/07/2026; se o período pedir datas anteriores, aparece "dados disponíveis a partir de 28/07/2026". Botão "Atualizar" com o horário da última atualização.

**Comparação:** Hoje contra ontem; N dias contra os N dias anteriores; Personalizado contra o intervalo anterior de mesma duração. A variação só aparece se o período anterior estiver inteiro dentro do histórico e tiver pedidos. Caso contrário, aparece "sem base de comparação", sem inventar 0% ou 100%.

**Cards (linha 1):** Receita de produtos · Pedidos válidos · Ticket médio · Clientes únicos (com "X novos" logo abaixo). Frete e valor total aparecem em letra menor, dentro do card de receita.

**Gráfico:** receita (área) e pedidos (barras) no mesmo gráfico. Hoje: por hora; 7/30 dias: por dia; 90 dias ou mais de 60 dias: por semana.

**Blocos:**
- Top produtos (10): produto, quantidade, pedidos, receita; opção de ordenar por quantidade ou por receita
- Top cupons (10): cupom, pedidos, receita, ticket médio, mais uma linha "Sem cupom"
- Clientes no período: novos x recorrentes, mais o número de recompras do período, classificados pelo histórico até o fim do período (seção 4), com o aviso "Baseado no histórico disponível desde 28/07/2026."
- Situação dos pedidos: pendentes, cancelados/anulados, testes. Esses números aparecem separados e não entram nas métricas principais

**Pedidos recentes:** fora da V1. Fica para uma futura página "Pedidos", onde entram número do pedido, data, primeiro nome, valores, cupom, status e link para o contato, sem telefone e sem e-mail. A V1 exibe apenas dados agregados.

**Layout:** desktop com 4 cards, gráfico em largura total e depois 2 colunas (produtos | cupons; clientes | situação). Tablet com cards 2x2 e 1 coluna. Celular com cards empilhados, gráfico de 240px e tabelas com rolagem lateral; as colunas secundárias (pedidos, ticket) ficam ocultas nas telas menores.

## 8. Para a V2 (fora da V1)

RFV, LTV 180/365, margem, lucro, categorias, profissional x cliente final, distribuidor, Shopee, TikTok, vendas do comercial, devoluções, recompra por janela, entrega, campanhas WhatsApp, diferenciação de variantes, página Pedidos.

## 9. Detalhes técnicos

- **Consultas:** agregação no banco, nunca no navegador. Uma migration com 4 funções SQL de leitura (`SECURITY DEFINER`, `search_path=public`, checagem de admin/manager, execução só por `authenticated`), todas recebendo início, fim e fuso:
  - `ecom_summary(p_from, p_to)`: KPIs do período e do período anterior, primeira data disponível, contagem de situação e clientes novos/recorrentes/recompras. A classificação usa a primeira compra e a contagem de pedidos calculadas sobre os pedidos válidos com data até `p_to`, sem se limitar à janela do filtro
  - `ecom_timeseries(p_from, p_to, p_bucket)`: série por hora, dia ou semana
  - `ecom_top_products(p_from, p_to, p_order, p_limit)`
  - `ecom_top_coupons(p_from, p_to, p_limit)`
  - A regra de cliente (chave de identificação) fica numa função SQL única `ecom_customer_key(...)`, reutilizada por todas e, no futuro, pelo RFV
- **Views:** não usar, porque as views herdariam permissões de forma menos controlada. Nenhuma tabela, gatilho ou RLS é alterado.
- **Índices:** `orders(created_at_source) WHERE valid_order` e `order_items(order_id)`, se ainda não existir. Com isso cada função faz 1 varredura por período, sem consultas repetidas por item, e escala bem até centenas de milhares de pedidos. Para volumes muito maiores, o próximo passo seria uma tabela diária resumida (V2).
- **Atualização:** consulta ao abrir a página, cache de 5 minutos no navegador (react-query) e botão Atualizar; sem tempo real.
- **Riscos de interpretação:** pendentes podem virar pagos depois, então a receita de dias recentes pode subir; "novo" é relativo ao histórico; cerca de 95% da receita atual veio de pedidos com algum cupom, mas não dá para saber a origem de cada cupom (influenciadora ou não) sem uma tabela de mapeamento de cupons, que fica para a V2; há 3 conflitos de identidade de cliente.
- **Arquivos do Build:** novos `src/pages/Ecommerce.tsx`, `src/components/ecommerce/*` (KpiCards, SalesChart, TopProducts, TopCoupons, CustomersBlock, OrderStatusBlock, PeriodFilter), `src/services/ecommerceMetrics.ts`, `src/lib/ecommercePeriod.ts` (períodos, período anterior, agrupamento), `src/__tests__/ecommerce-metrics.test.ts`; alterações só em `src/App.tsx` (rota), `src/components/Sidebar.tsx` (item "Vendas") e `src/hooks/useUserRole.ts` (área `ecommerce` para admin e manager). Nenhum arquivo do Dashboard atual é tocado.
- **Etapas:** (1) migration com funções e índice; (2) validar no banco com os números da seção 5 e testar papéis em transação desfeita ao final; (3) serviço e cálculo de períodos com testes; (4) componentes e página; (5) conferência visual em desktop e celular; (6) suíte completa.
- **Testes:** período anterior e bloqueio antes de 28/07; comparação omitida sem base; agrupamento por hora, dia ou semana; fuso de SP na virada do dia; totais iguais aos da seção 5; recusa das funções para sdr, dermo, expedição, parcerias e rastreio; pedido com 2 cupons contado nos dois; suíte atual verde.
