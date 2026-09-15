# Influenciadora sem resposta — plano final (Carla Marketing, 15/09 10:05)

Diagnóstico read-only concluído. Nada foi alterado ainda.

## 1. Causa raiz

"Sou influenciadora e queria fazer parceria" **é classificada corretamente** (motivo `influencer`,
destino Carla, já determinístico). O problema é anterior: a mensagem entrou no banco
(13:05:27.84 UTC, id `f8739016-…`) e na fila de agrupamento, mas **a entrada continua não
processada** — nunca chegou à fila da Nina, então não houve classificação, encaminhamento nem
resposta. A conversa segue com a Nina, sem responsável.

```text
13:05:28.10  influenciadora  -> liberar em 13:05:37.608
13:05:28.66  distribuidor    -> liberar em 13:05:36.685
13:05:37     agrupador roda  -> pega só o distribuidor
13:05:37/38  "No pending messages to schedule"  <- a influenciadora ficou órfã
```

O agrupador só se reagenda por auto-chamada em memória e só olha mensagens com liberação futura.
Não há rotina periódica de retomada. Não houve erro, timeout, lock, run preso, nem qualquer
chamada de agenda ou "Ana Carla".

## 2. Rotina de recuperação — pg_cron + pg_net (1 minuto)

`pg_cron` já está instalado (hoje sem tarefas) e o projeto já usa `pg_net` em `trigger_reaper()`.
Será criada `trigger_message_grouper()`, agendada a cada minuto, que **apenas aciona** o agrupador
existente — nenhuma lógica duplicada. Recupera somente mensagens não processadas, já vencidas,
vencidas há no máximo 2 horas, sem `skipped_at` e ainda sem entrada na fila da Nina.
Execuções simultâneas são seguras pelo claim atômico.

Cadência: 1.440 execuções por dia. É o mínimo para que nenhuma mensagem de cliente fique parada
mais de ~1 minuto; em troca, o banco é acordado com essa frequência, o que tem custo recorrente.

## 3. Claim atômico

Nova função `claim_message_grouping_batch(p_limit)` no mesmo padrão de
`claim_nina_processing_batch`: CTE com `SELECT ... FOR UPDATE SKIP LOCKED` seguido de
`UPDATE ... RETURNING`, em uma única operação. Acaba o "ler depois marcar". Uma mensagem só pode
ser reivindicada por uma execução: sem resposta dupla, handoff duplo ou envio duplicado.

## 4. Janela cega fechada

Ao final de cada execução o agrupador reconsulta também as mensagens já vencidas e ainda não
reivindicadas; se houver, processa ou garante nova execução. A rotina de 1 minuto é a rede final.

## 5. Duplicidades em nina_processing_queue — as 7 ocorrências

Todas são pares criados com milissegundos de diferença, **todas concluídas**, nenhuma pendente,
nenhuma com envio pendente, ambas as linhas de cada par pertencem à mesma conversa e à mesma
mensagem de cliente. Nenhuma tabela referencia `nina_processing_queue` (não há chave estrangeira
apontando para ela) e ela não é fonte de auditoria — o histórico do atendimento vive em
`messages`, `conversation_handoff_events` e `send_queue`, que não são tocados.

| # | message_id | linha mantida (criada em) | linha removida (criada em) |
|---|---|---|---|
| 1 | 69cecc91… | `e1d693a7…` 07/09 11:30:53.551 (conclusão limpa) | `6a596a35…` 07/09 11:30:53.459 (registrou "ai_paused") |
| 2 | 6b912ae0… | `162301b2…` 18/08 12:25:34.030 (mais antiga) | `6720927f…` 18/08 12:25:34.082 |
| 3 | 741630e7… | `75e792f8…` 26/06 12:14:22.349 (mais antiga) | `b56f0ccc…` 26/06 12:14:22.353 |
| 4 | 8b68e443… | `52e4537a…` 02/09 15:26:05.238 (mais antiga) | `1f375f76…` 02/09 15:26:05.277 |
| 5 | 939c4110… | `53cd1115…` 26/06 12:14:31.120 (mais antiga) | `00afe588…` 26/06 12:14:31.148 |
| 6 | a5f1cb1d… | `c9054c2a…` 26/06 12:05:25.853 (mais antiga) | `d2a99550…` 26/06 12:05:25.885 |
| 7 | da369e03… | `d709cfd2…` 08/09 17:35:10.535 (conclusão limpa) | `37c58b91…` 08/09 17:35:10.400 (registrou "ai_paused") |

Critério aplicado: nos casos 1 e 7 fica a linha que representa a execução concluída sem
ocorrência registrada; nos demais, ambas são equivalentes e fica a original mais antiga. Nunca
as duas são removidas — sempre sobra exatamente uma linha por mensagem.

Limpeza e índice na **mesma migration**: remoção das 7 linhas excedentes seguida imediatamente
de `CREATE UNIQUE INDEX` em `message_id`, sem janela para novas duplicatas. A inserção passa a
usar `ON CONFLICT DO NOTHING`.

## 6. Mensagens vencidas há mais de 2 horas

`message_grouping_queue` só tem `processed`, `process_after`, `created_at` e os dados da mensagem
— não há campo de erro, expiração ou motivo. Serão criadas duas colunas: `skipped_at` e
`skip_reason`. Mensagens vencidas há mais de 2 horas recebem `skipped_at = agora` e
`skip_reason = 'expired_recovery_window'`: ficam fora das buscas seguintes (não reaparecem a cada
minuto), nada é enviado ao cliente e fica o rastro de que expiraram sem resposta. `processed`
continua significando apenas "processada de verdade".

## 7. Mensagem da Carla Marketing

Depois da correção, reprocessar **somente** `f8739016-…`, após reconfirmar que continua
totalmente órfã: não processada, sem resposta posterior, sem encaminhamento aplicado e sem
registro na fila da Nina. Qualquer um desses pontos já resolvido → não reprocessar.
Esperado: motivo `influencer`, responsável Carla, Nina pausada, uma única resposta.

## 8. Testes

- duas mensagens vencendo com diferença de milissegundos → ambas processadas;
- auto-chamada e rotina periódica simultâneas → uma execução por mensagem;
- mensagem já processada ou já marcada como expirada → ignorada;
- mensagem já na fila da Nina → não duplicada (bloqueio no banco);
- fila vazia → nenhuma ação;
- mensagem vencida há mais de 2 horas → expirada, nada enviado, não reaparece;
- influenciadora → Carla; distribuidor → Paula; nenhum WhatsApp duplicado.

## 9. Preservado

Classificação Paula/Carla/Leticia, dermoconsultoras, Laura, Talia, rodízio, handoffs manuais e
automáticos, RLS, Shopify, WhatsApp, chat-media, mensagens e histórico.
