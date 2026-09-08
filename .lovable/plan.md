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

## 8. Correção mínima proposta

Manter least-loaded como primeiro critério e trocar apenas o desempate:

```text
1) count(conversas ativas)                                   ASC
2) último recebimento do membro (max(assigned_at) histórico) ASC NULLS FIRST
3) tm.id                                                     ASC   (último recurso)
```

Ou seja: em empate, recebe quem está há mais tempo sem receber um lead (round-robin natural, sem tabela de estado nova).

Para isso funcionar é preciso uma memória de "última atribuição" que não seja apagada quando a Nina é reativada. Duas opções:

- **A (recomendada):** derivar o "último recebimento" de `conversation_handoff_events` (eventos `handoff_dermoconsultant` já gravam `assigned_team_member_id` e ficam permanentes), em vez de `conversations.assigned_at`.
- **B:** adicionar uma coluna `last_assigned_at` em `team_members`, atualizada no momento do handoff.

Nada mais muda: `pick_dermo_assignee`, prioridade da Laura, casos sensíveis, `dermoconsultora_request`, Leticia, logística, contas, RLS, reabertura, WhatsApp, Shopify, chat-media e histórico ficam intactos. A alteração seria uma única migration substituindo o corpo de `pick_next_dermoconsultora`.

Validação sugerida após aprovação: simulação read-only de 10 chamadas consecutivas mostrando rodízio entre as cinco, sem criar conversas.
