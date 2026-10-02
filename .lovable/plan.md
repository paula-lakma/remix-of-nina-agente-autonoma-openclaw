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
- **Claim de um item por vez (sem mudança no banco):** o processador repete no máximo 10 vezes:
  1. confere o tempo restante;
  2. se faltar tempo seguro para mais um item, encerra normalmente;
  3. pega um único item com `claim_shopify_financial_inbox(1)`, que já aceita limite 1;
  4. processa o item;
  5. marca como `done`, `skipped`, `pending` (nova tentativa) ou `failed`;
  6. volta ao passo 1.
- **Orçamento de tempo:** 50 s no total por execução, com uma margem de segurança de 15 s. Um item novo só começa se ainda faltarem pelo menos 15 s para o fim do orçamento, porque uma consulta financeira com paginação leva poucos segundos. Os 50 s ficam bem abaixo do limite de execução da Edge Function.
- **Tentativas:** um item que não foi iniciado nunca passa pelo claim, então não consome tentativa. Nenhum grupo fica em `processing` sem ter começado de verdade. A recuperação de itens parados (15 minutos) continua valendo para o caso de o processador cair no meio do único item em execução.
- **Muitos itens:** uma execução processa até 10; a próxima execução, ou o próximo aviso do receptor, continua de onde parou.
- **Mantidos como estão:** a espera entre tentativas (5/15/30/60 minutos, `failed` na 5ª), a recuperação de itens parados (15 minutos, migration 0014) e o SKIP LOCKED.

## 4–6. Reconciliação financeira
- **Arquitetura:** nova Edge Function `shopify-financials-reconcile`, separada da função de pendências e do webhook operacional. Ela é chamada por `trigger_financials_reconcile()`, no mesmo padrão do worker.
- **Frequência:** a cada 6 horas (`15 */6 * * *`), 4 vezes por dia.
- **Janela:** pedidos com `updated_at` na Shopify nas últimas 72 horas. Isso cobre pelo menos 11 execuções seguidas sobre o mesmo pedido, o que tolera várias execuções falhadas.

## 7–10. Consulta de candidatos, paginação e custo
- **Consulta:** `orders(first: 50, after: $cursor, query: "updated_at:>='<agora-72h>'", sortKey: UPDATED_AT)`, retornando `id`, `name`, `updatedAt`, `displayFinancialStatus` e `pageInfo{hasNextPage,endCursor}`.
- **Paginação:** segue `endCursor` enquanto houver próxima página. Teto de 20 páginas (1.000 pedidos). Para se o cursor repetir ou vier vazio com `hasNextPage` verdadeiro, evitando loop.
- **Janela fixa por execução:** cada janela tem um início e um fim fixados quando ela começa (início = fim − 72 h). A consulta passa a ser `updated_at:>='<início>' AND updated_at:<='<fim>'`, com `sortKey: UPDATED_AT`.
- **Continuação salva:** se uma execução bater o teto de 20 páginas ou o orçamento de tempo, ela grava na tabela de estado:
  - `cursor` (o `endCursor` da última página totalmente processada);
  - `window_start` e `window_end`;
  - `status = 'continuation'`.
  A próxima execução retoma essa mesma janela a partir do cursor salvo. Só quando a janela termina (`hasNextPage` falso) o estado volta para `idle` e grava `last_completed_window_end`.
- **Onde fica salvo:** na nova tabela `financial_job_state`, com uma linha por trabalho (`job_name = 'financials_reconcile'`). Gravação só pelo backend.
- **Janela nova:** começa em `fim = agora`, com `início = min(agora − 72 h, last_completed_window_end)`. Assim não fica buraco entre duas janelas, mesmo se uma continuação demorar mais de 6 horas.
- **Nenhum pedido fica sem ser alcançado depois da página 20:** cada execução avança o cursor por novas páginas e nunca refaz as primeiras 1.000 linhas. Como a janela tem fim fixo, o total de páginas é finito e a janela sempre termina. Pedidos alterados durante a continuação ficam com horário depois do fim da janela e entram na janela seguinte.
- **Cursor inválido ou expirado:** se a Shopify rejeitar o cursor, a janela recomeça do início com os mesmos limites. Os pedidos já verificados são pulados pela regra de pular (seção 11–13), então só se repete a listagem, sem nova gravação.
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
Cada execução real (apply manual ou automática) grava uma linha em uma nova tabela `financial_job_runs`, só leitura de backend, com:
- tipo do trabalho, `run_id`, início, fim e duração;
- candidatos por origem (A/B, C, D), processados, pulados e `missing_local`;
- refunds por status (success, pending, mixed, failed);
- erros, retries e divergências;
- se houve throttling e se ficou continuação pendente.

A linha guarda só IDs dos pedidos, nunca dados pessoais.

**Dry-run sem nenhuma escrita:** o modo `dry_run` não grava em nenhuma tabela: nem `orders`, nem `order_refunds`, nem a caixa de entrada, nem `financial_job_runs`, nem `financial_job_state` ou o lease, nem tabela operacional.
- O relatório é só a resposta da função.
- Ele não usa o lease nem salva cursor. A paginação dele vai só até o teto, e o resultado informa se a janela ficou truncada.
- Contra concorrência: o dry-run é manual, só admin, e uma execução por vez. Como não grava nada, rodar em paralelo não causa dano.
- A verificação na etapa A: contagens e impressões digitais iguais antes e depois do dry-run, incluindo as tabelas novas com 0 linhas.

## 17. Falhas
Todas as falhas são tratadas pedido a pedido; erro em um não afeta os demais.
- Shopify fora do ar, erro HTTP ou erro GraphQL na listagem: a execução encerra sem gravar e registra o motivo; a próxima execução tenta de novo.
- Página incompleta, divergência de `total_refunded` ou falha do apply: o pedido é registrado como erro e não grava nada, porque o apply é atômico; segue para o próximo pedido.
- Execução interrompida: o que já foi aplicado está consistente, e o restante é refeito na próxima, porque a janela se sobrepõe. Lote parcial é tratado do mesmo jeito.
- **Contra execuções simultâneas, lease durável no banco** (no lugar do advisory lock). Campos `locked_by` (run_id), `locked_at` e `locked_until` na linha do trabalho em `financial_job_state`.
  - **Aquisição atômica:** `acquire_financial_job_lease(job, run_id, ttl)` faz um único UPDATE que só pega o lease se `locked_until` for nulo ou já tiver passado, e devolve se conseguiu. Duas Edge Functions ao mesmo tempo: só uma consegue; a outra sai imediatamente e registra "ocupado".
  - **Prazo:** `ttl` de 10 minutos, bem acima da execução esperada (de 50 s a alguns minutos).
  - **Renovação:** `renew_financial_job_lease` estende o prazo por mais 10 minutos e só funciona se o `run_id` for o dono atual. É chamada a cada página ou a cada 25 pedidos.
  - **Liberação:** `release_financial_job_lease` limpa o lease, também só se o `run_id` for o dono.
  - **Se a função morrer:** o lease expira sozinho em no máximo 10 minutos, e a próxima execução retoma pelo cursor salvo.
  - A proteção vale durante toda a execução da Edge Function, porque é uma linha no banco e não depende de uma conexão aberta.
  - As três funções do lease são SECURITY DEFINER, só para service_role.

## 18. Limpeza da linha de teste
Antes da etapa C, apagar exatamente a linha com:
- `webhook_id = '8cee3fc5-ec29-5f07-b1a9-36b76549dd65'`;
- `status = 'skipped'`;
- `shopify_order_id = '820982911946154508'`.

Depois conferir que a caixa de entrada ficou com 0 linhas. Nenhuma outra linha é apagada.

## 19. Etapas do Build (com pausa em cada uma)
- **A) Migration de estrutura e dry-run sem nenhuma escrita de dados:** a nova função em modo `dry_run` lista candidatos, calcula o que gravaria e mostra as diferenças. Nenhuma linha gravada em tabela alguma. PAUSA.
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
- **Migration 0015**, na etapa A (só estrutura, sem nenhuma linha inicial):
  - tabela `financial_job_runs`: id, job_name, run_id, mode, started_at, finished_at, status, counters jsonb, errors jsonb;
  - tabela `financial_job_state`: job_name PK, status (idle/continuation), window_start, window_end, cursor, last_completed_window_end, locked_by, locked_at, locked_until, updated_at;
  - nas duas tabelas: RLS ligado sem policies, REVOKE de PUBLIC/anon/authenticated, GRANT ALL para service_role;
  - funções `acquire_financial_job_lease`, `renew_financial_job_lease` e `release_financial_job_lease`;
  - funções `trigger_financials_worker` e `trigger_financials_reconcile`;
  - todas as funções: SECURITY DEFINER, `search_path` fixo, execução só para service_role;
  - a linha de `financial_job_state` é criada na primeira execução real (insert com ON CONFLICT DO NOTHING), nunca no dry-run.
- **Sem mudança no banco para o worker:** o claim de um item por vez usa a função atual.
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
