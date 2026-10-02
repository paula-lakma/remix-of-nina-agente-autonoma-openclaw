# Vendas V2 — Fase 2, Passo 6: plano de ativação segura (não implementado)

Este plano só descreve o que seria feito. Nenhuma migration, nenhum agendamento, nenhum dado e nenhuma Edge Function foram alterados. Cada etapa do futuro Build termina com uma pausa para sua aprovação.

## Estado verificado agora
- Agendamentos que existem hoje: `message-grouper-safety-net` (a cada minuto) e `sync-shopify-orders-daily` (06:30 UTC). Nenhum é financeiro.
- O padrão de chamada interna já existe: uma função SQL lê `SUPABASE_URL` e `PANEL_TOKEN` do cofre de segredos (`get_secret`) e chama a Edge Function via `net.http_post` com o cabeçalho `X-Panel-Token`. O agendamento chama só a função SQL, então nenhum segredo aparece no texto dele.
- Caixa de entrada: 1 linha `skipped`, que é o exemplo da Shopify. Refunds gravados: 1 (#2009). Pedidos com financeiro verificado: 3. Última migration: 0014.

## 1–3. Worker recorrente
- **Arquitetura:** nova função SQL `trigger_financials_worker()` (SECURITY DEFINER, `search_path` fixo, execução só para service_role). Ela só chama `shopify-financials-worker` quando existe trabalho:
  - linha `pending` com `next_attempt_at <= now()`; ou
  - linha `processing` parada há mais de 15 minutos.
  - Sem trabalho, ela só faz uma checagem rápida no banco e não chama a função.
- **Frequência:** a cada 15 minutos (`*/15 * * * *`), 96 vezes por dia, quase todas sem trabalho. 15 minutos é adequado porque a chamada imediata do receptor resolve o caso normal; o agendamento é só a rede de segurança. Atraso máximo de 15 minutos se a chamada imediata falhar, e o custo é baixo.
- **Autenticação:** o processador passa a aceitar também `X-Panel-Token`, comparado em tempo constante, além da chave interna e de admin. Anônimo e usuário comum continuam recebendo 401/403.
- **Lote e tempo:** até 10 itens por chamada (o limite atual vai até 25). Orçamento de cerca de 50 s por execução; ao estourar, o processador para de pegar itens novos e devolve os restantes para `pending`. Se houver muito trabalho, uma execução processa 10 itens e a próxima continua.
- **Mantidos como estão:** a espera entre tentativas (5/15/30/60 minutos, `failed` na 5ª), a recuperação de itens parados (15 minutos, migration 0014) e o SKIP LOCKED.

## 4–6. Reconciliação financeira
- **Arquitetura:** nova Edge Function `shopify-financials-reconcile`, separada da função de pendências e do webhook operacional. Ela é chamada por `trigger_financials_reconcile()`, no mesmo padrão do worker.
- **Frequência:** a cada 6 horas (`15 */6 * * *`), 4 vezes por dia.
- **Janela:** pedidos com `updated_at` na Shopify nas últimas 72 horas. Isso cobre pelo menos 11 execuções seguidas sobre o mesmo pedido, o que tolera várias execuções falhadas.

## 7–10. Consulta de candidatos, paginação e custo
- **Consulta:** `orders(first: 50, after: $cursor, query: "updated_at:>='<agora-72h>'", sortKey: UPDATED_AT)`, retornando `id`, `name`, `updatedAt`, `displayFinancialStatus` e `pageInfo{hasNextPage,endCursor}`.
- **Paginação:** segue `endCursor` enquanto houver próxima página. Teto de 20 páginas (1.000 pedidos). Para se o cursor repetir ou vier vazio com `hasNextPage` verdadeiro, evitando loop.
- **Continuidade:** se bater o teto, a execução registra "janela truncada" e a próxima continua; a janela de 72 horas é refeita a cada 6 horas, então a sobreposição cobre o restante.
- **Limite de detalhes:** até 100 consultas financeiras completas (OrderFinancials) por execução.
- **Custo GraphQL:** lê `extensions.cost.throttleStatus`. Se o saldo ficar abaixo de 300, espera `(necessário − saldo) / taxa de recuperação`, com no máximo 10 s. Se a Shopify devolver THROTTLED, espera uma vez e tenta de novo uma vez; se repetir, encerra a execução de forma limpa e registra o motivo.
- **Pedido da Shopify que não existe localmente:** é ignorado e contado em `missing_local`. Nada é criado.

## 11–13. Seleção de candidatos e regra para pular
Candidatos = união sem duplicados de:
- A+B: pedidos devolvidos pela Shopify nas últimas 72 horas que existem em `orders`;
- C: pedidos com refund `pending` ou `mixed` em `order_refunds`, de qualquer data;
- D: pedidos locais pagos criados nas últimas 72 horas ainda sem financeiro verificado.

Regra para pular: o pedido só é pulado se as três condições valerem ao mesmo tempo:
- o financeiro foi verificado em horário igual ou posterior ao `updatedAt` informado pela Shopify;
- o pedido não tem refund `pending` nem `mixed`;
- o pedido não veio só pelo critério D.

Os pedidos de C são sempre consultados de novo. Exceção: um pedido que não tenha voltado na lista da Shopify (porque não mudou em 72 horas) e não tenha refund `pending`/`mixed` não é consultado; isso é seguro porque um refund novo altera o `updatedAt`.

## 14. Processamento reaproveitado
Exatamente as funções já validadas, sem nenhuma regra paralela:
- `fetchOrderFinancials`;
- `computeOrderFinancials`, com SUCCESS/PENDING/FAILED/MIXED e a regra conservadora de mixed;
- `buildFinancialsApplyPayload`, com validação contra `totalRefundedSet`;
- `apply_order_financials`, em uma transação por pedido.

Pedidos pagos sem refund recebem `total_received`, `net_payment`, `paid_at`, `is_paid`, `refund_count = 0` e `financials_verified_at`. Nunca são alterados `financial_status`, `valid_order`, `subtotal`, `current_subtotal` e `net_product_revenue`.

## 15. Segurança
- O token interno fica só no cofre de segredos. As novas funções SQL têm REVOKE de PUBLIC, anon e authenticated.
- A reconciliação aceita só `X-Panel-Token`, a chave interna ou admin.
- Nenhum segredo é registrado em log.

## 16. Observabilidade
Cada execução grava uma linha em uma nova tabela `financial_job_runs`, só leitura de backend, com:
- tipo do trabalho, início, fim e duração;
- candidatos por origem (A/B, C, D), processados, pulados e `missing_local`;
- refunds por status (success, pending, mixed, failed);
- erros, retries e divergências;
- se houve throttling e se a janela foi truncada.

A linha guarda só IDs dos pedidos, nunca dados pessoais.

## 17. Falhas
Todas as falhas são tratadas pedido a pedido; erro em um não afeta os demais.
- Shopify fora do ar, erro HTTP ou erro GraphQL na listagem: a execução encerra sem gravar e registra o motivo; a próxima execução tenta de novo.
- Página incompleta, divergência de `total_refunded` ou falha do apply: o pedido é registrado como erro e não grava nada, porque o apply é atômico; segue para o próximo pedido.
- Execução interrompida: o que já foi aplicado está consistente, e o restante é refeito na próxima, porque a janela se sobrepõe. Lote parcial é tratado do mesmo jeito.
- Contra execuções simultâneas: trava no banco (`pg_try_advisory_lock`); uma execução que encontrar a trava ocupada sai imediatamente.

## 18. Limpeza da linha de teste
Antes da etapa C, apagar exatamente a linha com:
- `webhook_id = '8cee3fc5-ec29-5f07-b1a9-36b76549dd65'`;
- `status = 'skipped'`;
- `shopify_order_id = '820982911946154508'`.

Depois conferir que a caixa de entrada ficou com 0 linhas. Nenhuma outra linha é apagada.

## 19. Etapas do Build (com pausa em cada uma)
- **A) Dry-run:** a nova função em modo `dry_run` lista candidatos, calcula o que gravaria e mostra as diferenças. Zero escrita. PAUSA.
- **B) Escrita manual em lote pequeno:** modo `apply` com uma lista de no máximo 5 pedidos escolhidos por você; depois conferir os valores e a Vendas V1. PAUSA.
- **C) Limpeza da linha de teste e ativação do worker recorrente:** criar o agendamento e observar 24 horas. PAUSA.
- **D) Ativação da reconciliação a cada 6 horas:** observar as 2 primeiras execuções. PAUSA.

## 20–21. Arquivos e migrations
- **Novos:**
  - `supabase/functions/shopify-financials-reconcile/index.ts`;
  - ajudantes de candidatos e paginação em `_shared/shopify_admin.ts` (só funções novas);
  - teste `vendas-v2-fase2-reconcile.test.ts`.
- **Alterados:**
  - `shopify-financials-worker` (aceitar `X-Panel-Token` e o orçamento de tempo);
  - `config.toml`;
  - `AGENTS.md`.
- **Migration 0015**, na etapa A:
  - tabela `financial_job_runs`;
  - funções `trigger_financials_worker` e `trigger_financials_reconcile`.
- **Fora das migrations:** os agendamentos, nas etapas C e D, porque o texto deles inclui dados específicos do projeto.

## 22–23. Riscos e como desfazer
- **Riscos:**
  - throttling da Shopify em dias de muito movimento: mitigado pelo orçamento de custo e pelo teto de páginas;
  - divergência por refund em andamento: o pedido não grava e é tentado de novo;
  - sem `read_all_orders`, pedidos com mais de 60 dias ficam fora do alcance, o que não afeta a janela de 72 horas.
- **Como desfazer:**
  - `cron.unschedule` dos 2 agendamentos;
  - as colunas financeiras não afetam a V1, então não precisam ser revertidas;
  - as funções novas podem ficar paradas sem efeito nenhum.

## 24–25. Confirmações
- **Sem backfill:** só a janela de 72 horas, mais os refunds `pending`/`mixed` já gravados. O histórico continua na Fase 3.
- **Vendas V1 intacta:** nenhuma das funções `ecom_*`, nem a página Vendas, nem `valid_order`, nem `net_product_revenue` serão tocadas.
