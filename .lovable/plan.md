# Auditoria do balanceamento entre dermoconsultoras (read-only)

Nada foi alterado: só leitura de funções e dados.

## 1. Carga atual (atendimentos ativos)

Contagem = conversas com `assigned_user_id = team_member`, `human_takeover_required = true`, `attendance_finished = false`.

- Mylena — 0
- Cris — 1
- Talia — 0
- Barbara — 0
- Laura — 0

## 2. Algoritmo atual

`pick_dermo_assignee(reason)`:
- motivo sensível → Laura direto (`sensitive_direct`);
- caso contrário → `pick_next_dermoconsultora()` (`balanced`).

`pick_next_dermoconsultora()` seleciona entre membros ativos com função contendo "dermoconsultor" e ordena por:

```text
1) count(conversas ativas)                 ASC
2) min(assigned_at) do membro              ASC NULLS FIRST
3) team_members.id                         ASC
LIMIT 1
```

## 3. Critério de desempate

Empate de carga é resolvido por `min(assigned_at)` — o **primeiro** atendimento que o membro já recebeu, não o último — com `NULLS FIRST`, e por fim pelo **UUID** do membro. Não existe memória de rodízio (nenhuma coluna de "última escolhida", nenhum contador de rodada).

## 4. Por que Barbara foi escolhida duas vezes

Nos dois testes reais (14:48 e 15:51 de 08/09, motivo `dermoconsultora_request`, modo `balanced`) todas as elegíveis estavam com carga 0 e com `min(assigned_at)` nulo. O desempate caiu direto no UUID:

- Barbara `652c1dcc…`
- Mylena `7abd5818…`
- Talia `8b104801…`
- Laura `dcf6c6ed…`

Barbara tem o menor UUID, então ganha todo empate. Não foi menor carga real — foi desempate determinístico fixo.

## 5. Simulação read-only de 10 escolhas (todas com carga 0)

Com a lógica atual, e como a reativação da Nina limpa `assigned_user_id` (o histórico de `assigned_at` volta a ficar nulo, como se vê hoje: Barbara com 0 conversas históricas):

Rodadas 1 a 10 → **Barbara em todas**.

Mesmo no cenário otimista em que o histórico permanece gravado, `min(assigned_at)` é imutável (é o primeiro atendimento de sempre), então a ordem se estabiliza em Barbara → Mylena → Talia → Laura nas 4 primeiras rodadas e, a partir da 5ª, volta a ser **Barbara em todas**.

## 6. Risco de todos os empates caírem na Barbara

Sim, confirmado. Em empate o critério é fixo e não rotaciona.

## 7. O balanceamento está equilibrado?

Não. Ele prioriza corretamente quem tem menos atendimentos ativos, mas quando há empate — que é o caso normal em operação de baixo volume — concentra 100% dos novos leads na mesma profissional. Além disso, ao finalizar o atendimento a carga volta imediatamente a 0, então a mesma pessoa fica elegível de novo já no próximo lead.

## 8. Correção aprovada (Opção A) — apenas `pick_next_dermoconsultora`

Least-loaded continua sendo o primeiro e decisivo critério. A recência só é avaliada em empate de carga.

Nova ordenação:

```text
1) count(conversas ativas)                                        ASC
2) MAX(created_at) do último handoff dermo real do membro         ASC NULLS FIRST
3) tm.id                                                          ASC  (último desempate técnico)
```

Memória permanente da última atribuição: `conversation_handoff_events`, filtrando
- `event_type = 'handoff_dermoconsultant'`
- `metadata->>'assigned_team_member_id' = tm.id`
- ignorando eventos com `metadata->>'synthetic' = 'true'`

Contam tanto os handoffs de balanceamento normal / `dermoconsultora_request` quanto os casos clínicos sensíveis atribuídos diretamente à Laura — assim um caso sensível recente conta como atribuição recente dela nos empates futuros.

Verificação já feita nos dados reais: existem 9 eventos `handoff_dermoconsultant` gravados; **6 já trazem `metadata.assigned_team_member_id`** e **0 estão marcados como sintéticos**. Os 3 eventos antigos sem esse campo simplesmente não participam da memória de recência — sem backfill nesta alteração.

Escopo: uma única migration substituindo o corpo de `pick_next_dermoconsultora`. Nenhuma coluna nova, nenhuma tabela nova, nenhuma mudança em `pick_dermo_assignee` além da chamada já existente.

## 9. Validação (sem deixar dado de teste em produção)

Simulação em `BEGIN … ROLLBACK`, criando apenas os registros temporários necessários para simular handoffs **reais**:

- os eventos criados no teste **não** levam `metadata.synthetic = true` — precisam participar da consulta de recência;
- são identificados por IDs conhecidos apenas dentro da transação;
- ao final, `ROLLBACK` obrigatório, então nada permanece no banco.

A regra de produção continua igual: eventos realmente marcados com `metadata.synthetic = true` são ignorados pelo balanceamento.

Casos cobertos:

- rotação: cinco dermos com carga igual e sem histórico → sucessivas atribuições alternam (ex.: Barbara → Mylena → Talia → Laura → Cris → Barbara…), nenhuma vence todos os empates seguidos;
- A) Mylena 0, Talia 0, Barbara 1, Laura 0 → Barbara não pode ser escolhida enquanto houver carga 0;
- B) empate de carga → ganha quem recebeu há mais tempo;
- C) profissional sem nenhum handoff histórico → prioridade por NULLS FIRST;
- D) caso sensível → Laura continua `sensitive_direct`, sem passar pelo balanceamento;
- E) após Laura receber caso sensível, esse handoff conta como última atribuição dela em empates normais.

Também será rodado o conjunto de testes existente para garantir que nada de classificação mudou.

## 10. Preservado (sem alteração)

`pick_dermo_assignee` (além da chamada existente), prioridade sensitive_direct da Laura, `dermoconsultora_request`, classificação clínica, Leticia/logística, Finalizar atendimento, reabertura da Nina, contas, RLS, WhatsApp, Shopify, chat-media, mensagens e histórico.

