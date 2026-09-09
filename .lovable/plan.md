# Participação reduzida da Talia nos atendimentos comuns (auditoria + proposta)

Nada foi implementado. Apenas leitura de dados e simulação fora do banco.

## 1. Como funciona o balanceamento hoje

`pick_dermo_assignee(reason)`:
- motivo sensível → Laura direto (`sensitive_direct`), sem balanceamento;
- demais → `pick_next_dermoconsultora()`.

`pick_next_dermoconsultora()` seleciona entre membros ativos com função contendo "dermoconsultor" e ordena por:

```text
1) nº de atendimentos ativos                                    ASC
2) MAX(created_at) do último handoff dermo real do membro       ASC NULLS FIRST
3) team_members.id                                              ASC
```

Estado real conferido agora: as cinco estão ativas e todas com `team_members.weight = 1` (coluna já existe e hoje não é usada pelo rodízio).

Efeito prático: com cargas empatadas (o caso normal), a rotação é perfeitamente igualitária — 4 de 20 para cada uma.

## 2. Estratégia recomendada: cota de intervalo (gap), não peso multiplicativo

Peso puro sobre a carga (ex.: `carga/peso`) falha aqui: como o atendimento é finalizado rapidamente, as cargas voltam a 0 e o peso deixa de ter efeito — ou, no outro extremo, zera a Talia. A regra estável é de **intervalo**: a Talia só entra no pool de candidatos quando já passaram N atendimentos comuns desde o último dela.

Regra proposta:

```text
pool = todas as dermos ativas
se (handoffs comuns desde o último da Talia) < N  → tirar a Talia do pool
se o pool ficar vazio                             → devolver a Talia ao pool
se todas as prioritárias estiverem com carga alta → devolver a Talia ao pool
depois: least-loaded → recência → id (exatamente como hoje)
```

O "último da Talia" sai de `conversation_handoff_events` (`handoff_dermoconsultant`, `metadata.assigned_team_member_id`, ignorando `synthetic = true`) — a mesma fonte já usada pela recência.

Quem é "reduzida" não fica escrito no código: usa-se `team_members.weight` (Talia com peso menor, as outras mantêm 1). Trocar de pessoa no futuro é só mudar o peso.

## 3. Comparação das opções e simulação de 20 atendimentos comuns

Cargas iguais, atendimentos sendo finalizados entre um lead e outro (cenário real de hoje):

| Opção | Mylena | Cris | Barbara | Laura | Talia |
|---|---|---|---|---|---|
| Hoje (sem regra) | 4 | 4 | 4 | 4 | 4 |
| A) N=9 (~metade da frequência das outras) | 4 | 5 | 5 | 4 | 2 |
| B) N=8 (~1 a cada 8) | 4 | 5 | 5 | 4 | 2 |
| C) N=4 | 4 | 4 | 4 | 4 | 4 |

Observação importante: com cinco profissionais a frequência natural da Talia já é 1 a cada 5. Qualquer N ≤ 5 (opção C) não muda nada. As opções A e B convergem no mesmo resultado prático: Talia com cerca de 10% dos atendimentos comuns, as outras quatro entre 20% e 25% cada, alternando normalmente entre si.

**Recomendação: N = 8.** Talia recebe ~2 em cada 20, nunca fica zerada, e as outras quatro continuam rotacionando de forma justa.

## 4. Comportamento quando as cargas são diferentes

- **Talia 0 e as outras 1** → a Talia continua fora, salvo se a cota (N) já venceu. É exatamente o que você pediu: ela não passa a receber tudo só por estar com carga 0.
- **Todas em 0** → rotação normal entre as quatro; a Talia entra quando a cota vence.
- **Uma prioritária muito sobrecarregada** → o least-loaded continua mandando entre as quatro; a sobrecarregada só volta a receber quando as outras alcançarem a carga dela.
- **Todas as quatro prioritárias com carga alta ao mesmo tempo** (limite proposto: carga mínima entre elas ≥ 2) → a Talia volta ao pool imediatamente, ignorando a cota, para não sobrecarregar o time.
- **Empate entre várias** → desempate por recência e depois id, sem mudança.

## 5. Impacto sobre o rodízio já corrigido

Nenhum. A cota apenas filtra o pool antes da ordenação; os três critérios continuam idênticos, então ninguém volta a vencer todos os empates. Casos sensíveis não passam por aqui.

## 6. Alteração mínima

- Uma migration substituindo o corpo de `public.pick_next_dermoconsultora()`, acrescentando o filtro de pool por cota baseado em `team_members.weight` e no intervalo desde o último handoff dermo da profissional de peso reduzido.
- Um `UPDATE` em `team_members` definindo o peso reduzido da Talia (dado de configuração, não de conversa).
- Testes automatizados de distribuição (simulação isolada, sem gravar em produção).

Sem tabela nova, sem coluna nova, sem alteração em `pick_dermo_assignee`.

## 7. O que fica intacto

`sensitive_direct` da Laura, detecção de `reaction` e casos clínicos, `dermoconsultora_request`, Leticia/logística, Finalizar atendimento, reabertura da Nina, histórico e `conversation_handoff_events`, contas e permissões, RLS, WhatsApp, Shopify, chat-media.

## 8. Decisão pendente

Confirmar N = 8 (recomendado) ou N = 9, e confirmar o gatilho de sobrecarga (carga mínima ≥ 2 entre as quatro prioritárias) que devolve a Talia ao rodízio.
