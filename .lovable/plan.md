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

## 2. Estratégia aprovada: cota de intervalo (gap), não peso multiplicativo

Peso puro sobre a carga (ex.: `carga/peso`) falha aqui: como o atendimento é finalizado rapidamente, as cargas voltam a 0 e o peso deixa de ter efeito — ou, no outro extremo, zera a Talia. A regra estável é de **intervalo**: a profissional de participação reduzida só entra no pool de candidatos quando já passaram N atendimentos comuns desde o último dela.

Regra aprovada (N = 8):

```text
pool = todas as dermos ativas
se (handoffs comuns desde o último dessa profissional) < weight  → tirá-la do pool
se o pool ficar vazio                                            → devolvê-la ao pool
se TODAS as demais tiverem carga ativa >= 2                      → devolvê-la ao pool
depois: least-loaded → recência → id (exatamente como hoje)
```

### 2.1 Semântica explícita da configuração

A configuração fica em `team_members.weight`, com significado literal **"1 atendimento comum a cada `weight`"**:

| weight | significado |
|---|---|
| 1 (ou nulo) | participação normal, sem intervalo adicional — comportamento idêntico ao de hoje |
| 8 | participação reduzida: só entra no pool quando houver 8 ou mais atendimentos comuns registrados desde o último dela |
| n | genérico: intervalo mínimo de n atendimentos comuns entre dois atendimentos dela |

Portanto: Talia recebe `weight = 8`; Mylena, Cris, Barbara e Laura permanecem em `weight = 1` e não sofrem nenhuma restrição. A função não menciona nome, e-mail nem UUID — lê apenas `weight`. Para reduzir outra profissional no futuro, basta alterar o `weight` dela; para devolver alguém ao ritmo normal, `weight = 1`.

### 2.2 O que conta como "atendimento comum"

Contagem feita sobre `conversation_handoff_events`:
- `event_type = 'handoff_dermoconsultant'`;
- `metadata->>'dermo_mode' = 'balanced'` — confirmado nos dados reais: os eventos gravam `balanced` no balanceamento normal e `sensitive_direct` nos casos clínicos da Laura;
- eventos com `metadata->>'synthetic' = 'true'` continuam ignorados;
- eventos antigos sem `assigned_team_member_id` continuam fora, sem backfill.

Consequências confirmadas:
- casos `sensitive_direct` da Laura **não** contam para liberar a cota da Talia, nem entram no denominador do intervalo;
- o critério de recência (item 2 da ordenação) permanece como está hoje, considerando todos os handoffs dermo reais, inclusive os sensíveis da Laura;
- least-loaded e recência continuam intactos dentro do pool permitido.

### 2.3 Primeira participação (sem histórico)

Se a profissional de peso reduzido nunca recebeu nenhum handoff comum, o "último dela" é nulo e a contagem passa a ser **o total de atendimentos comuns já registrados**. Como já existem mais de 8 eventos comuns no histórico, a Talia entra elegível já na primeira rodada após a mudança, e a partir daí passa a respeitar o intervalo de 8. Se um dia o histórico for menor que 8, ela fica elegível assim que o total de comuns atingir 8 — ou antes, pelo gatilho de sobrecarga / pool vazio.


## 3. Comparação das opções e simulação de 20 atendimentos comuns

Cargas iguais, atendimentos sendo finalizados entre um lead e outro (cenário real de hoje):

| Opção | Mylena | Cris | Barbara | Laura | Talia |
|---|---|---|---|---|---|
| Hoje (sem regra) | 4 | 4 | 4 | 4 | 4 |
| A) N=9 (~metade da frequência das outras) | 4 | 5 | 5 | 4 | 2 |
| B) N=8 (~1 a cada 8) | 4 | 5 | 5 | 4 | 2 |
| C) N=4 | 4 | 4 | 4 | 4 | 4 |

Observação importante: com cinco profissionais a frequência natural da Talia já é 1 a cada 5. Qualquer N ≤ 5 (opção C) não muda nada. As opções A e B convergem no mesmo resultado prático: Talia com cerca de 10% dos atendimentos comuns, as outras quatro entre 20% e 25% cada, alternando normalmente entre si.

**Aprovado: N = 8** (`weight = 8` para a Talia). Ela recebe ~2 em cada 20, nunca fica zerada, e as outras quatro continuam rotacionando de forma justa.

## 4. Comportamento quando as cargas são diferentes

- **Talia 0 e as outras 1** → a Talia continua fora, salvo se a cota (N) já venceu. É exatamente o que você pediu: ela não passa a receber tudo só por estar com carga 0.
- **Todas em 0** → rotação normal entre as quatro; a Talia entra quando a cota vence.
- **Uma prioritária muito sobrecarregada** → o least-loaded continua mandando entre as quatro; a sobrecarregada só volta a receber quando as outras alcançarem a carga dela.
- **Todas as quatro prioritárias com carga ativa ≥ 2 ao mesmo tempo** → a Talia volta ao pool imediatamente, ignorando a cota, para não sobrecarregar o time.
- **Empate entre várias** → desempate por recência e depois id, sem mudança.

## 5. Impacto sobre o rodízio já corrigido

Nenhum. A cota apenas filtra o pool antes da ordenação; os três critérios continuam idênticos, então ninguém volta a vencer todos os empates. Casos sensíveis não passam por aqui.

## 6. Alteração mínima

- Uma migration substituindo o corpo de `public.pick_next_dermoconsultora()`, acrescentando o filtro de pool descrito no item 2 (intervalo por `weight`, contagem de `dermo_mode = 'balanced'` não sintéticos, liberação por pool vazio ou por todas as demais com carga ≥ 2).
- Um `UPDATE` em `team_members` gravando `weight = 8` para a Talia (dado de configuração).
- Testes automatizados de distribuição (simulação isolada) e validação em transação com `ROLLBACK`, sem deixar dados de teste em produção.

Sem tabela nova, sem coluna nova, sem alteração em `pick_dermo_assignee`, sem nome/e-mail/UUID dentro da função.

## 7. O que fica intacto

`sensitive_direct` da Laura, detecção de `reaction` e casos clínicos, `dermoconsultora_request`, Leticia/logística, Finalizar atendimento, reabertura da Nina, histórico e `conversation_handoff_events`, contas e permissões, RLS, WhatsApp, Shopify, chat-media.

