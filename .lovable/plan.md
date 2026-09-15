# Influenciadora sem resposta — diagnóstico e correção (Carla Marketing, 15/09 10:05)

Diagnóstico read-only concluído. Nada foi alterado ainda.

## 1. Classificação da frase

"Sou influenciadora e queria fazer parceria" **é classificada corretamente** pelo código atual:
motivo `influencer`, destino parcerias (Carla), já na lista de motivos determinísticos.
O roteamento não é o problema.

## 2. Causa raiz confirmada

A mensagem entrou no banco (13:05:27.84 UTC, id `f8739016-…`) e na fila de agrupamento
(`message_grouping_queue`), mas **essa entrada continua marcada como não processada**. Por isso:

- nunca entrou na fila da Nina (`nina_processing_queue` sem registro dessa mensagem);
- a Nina nunca foi acionada — sem classificação, sem encaminhamento, sem resposta;
- a conversa segue com a Nina, sem responsável e sem evento de encaminhamento.

Corrida exata registrada nos logs:

```text
13:05:28.10  influenciadora  -> liberar em 13:05:37.608
13:05:28.66  distribuidor    -> liberar em 13:05:36.685
13:05:37     agrupador roda  -> pega só o distribuidor
13:05:37/38  "No pending messages to schedule"  <- a influenciadora ficou órfã
```

O agrupador só se reagenda por auto-chamada em memória e só olha mensagens com liberação
**futura**. A mensagem caiu na janela cega entre "ainda não venceu" e "já venceu", e não há
nenhuma rotina periódica de retomada (nenhum agendamento ativo hoje).

## 3. O que NÃO causou

Não foi classificação, nem handoff determinístico, nem a Carla, nem agendamento/"Ana Carla"
(nenhuma ferramenta de agenda foi chamada), nem erro, timeout, lock ou run preso. Nenhuma
resposta chegou a ser criada — não há envio pendente nem com erro.

## 4. Diferença para o distribuidor

O distribuidor venceu ~0,9s antes e foi capturado; a influenciadora venceu depois e nenhuma
execução posterior a buscou.

## 5. Correção — decisões técnicas fechadas

### 5.1 Mecanismo da rotina de 1 minuto — pg_cron + pg_net
A extensão `pg_cron` já está instalada no projeto (hoje sem nenhuma tarefa ativa) e já existe o
padrão de acionamento por `pg_net` usado por `trigger_reaper()`. Será criada uma função
equivalente, `trigger_message_grouper()`, agendada a cada 1 minuto, que apenas **aciona** o
agrupador existente. Nenhuma lógica de processamento é duplicada: a rotina não lê, não agrupa e
não classifica — só chama a função que já faz isso. Execuções simultâneas são seguras porque a
captura passa a ser atômica (5.2).

### 5.2 Captura atômica (uma execução por mensagem)
Nova função no mesmo padrão de `claim_nina_processing_batch` / `claim_send_queue_batch`:
`claim_message_grouping_batch(p_limit)` — CTE com `SELECT ... FOR UPDATE SKIP LOCKED` seguido de
`UPDATE ... RETURNING`, em uma única operação transacional. O agrupador deixa de fazer
"ler depois marcar". Uma mensagem só pode ser reivindicada por uma execução: sem resposta dupla,
handoff duplo, entrada duplicada na fila da Nina ou envio duplicado no WhatsApp.

### 5.3 Fechar a janela cega
Ao final de cada execução o agrupador reconsulta **também** as mensagens já vencidas e ainda não
reivindicadas; se houver, processa ou garante nova execução. A rotina de 1 minuto é a rede final.

### 5.4 Idempotência entre filas — auditoria feita
`nina_processing_queue` tem 400 linhas para 393 mensagens distintas: **7 duplicatas históricas**,
todas em pares criados com milissegundos de diferença e **todas já concluídas** (junho a 08/09).
A arquitetura exige no máximo uma entrada por mensagem: o agrupamento de várias mensagens
já é representado por uma única linha, referente à última mensagem do grupo, com o conteúdo
combinado — não depende de múltiplas linhas com o mesmo `message_id`.

Como há duplicatas, o índice único não pode ser criado sem tratá-las. Nada será apagado em
silêncio. Duas opções, **preciso da sua escolha**:

- **A (recomendada):** remover as 7 linhas extras — todas já concluídas, nenhuma gera envio ao
  cliente — e criar índice único em `message_id`, com inserção `ON CONFLICT DO NOTHING`.
  Listo os 7 ids antes de executar.
- **B:** manter todo o histórico e não criar índice único; a proteção fica apenas na captura
  atômica (5.2) mais a verificação antes de inserir. Protege daqui para frente, mas sem garantia
  no nível do banco.

### 5.5 Mensagens vencidas há mais de 2 horas
Auditoria dos campos existentes em `message_grouping_queue`: só há `processed` (sim/não),
`process_after`, `created_at` e os dados da mensagem. **Não existe** campo de erro, expiração,
ignorada ou motivo. Marcar como `processed` seria mentir — pareceria que a Nina respondeu.

Menor solução necessária: duas colunas novas, `skipped_at` e `skip_reason`. A rotina periódica
só recupera mensagens vencidas nas últimas 2 horas; as mais antigas recebem
`skipped_at = agora` e `skip_reason = 'expired_recovery_window'`, ficam fora da busca das
próximas execuções (não voltam a cada minuto), não geram nenhum envio ao cliente e deixam
rastro auditável de que expiraram sem resposta.

### 5.6 Mensagem real da Carla Marketing
Depois da correção, reprocessar **somente** `f8739016-…`, e apenas após reconfirmar que continua
órfã: não processada, sem resposta posterior, sem encaminhamento aplicado e sem registro na fila
da Nina. Se qualquer um desses pontos já tiver ocorrido, não reprocessar. Resultado esperado:
motivo `influencer`, responsável Carla, Nina pausada, uma única resposta.

## 6. Testes

- duas mensagens vencendo com diferença de milissegundos → ambas processadas;
- auto-chamada e rotina periódica simultâneas → uma única execução por mensagem;
- mensagem já processada → ignorada;
- mensagem já na fila da Nina → não duplicada;
- fila vazia → nenhuma ação;
- mensagem vencida há mais de 2 horas → marcada como expirada, nada enviado, não reaparece;
- influenciadora → Carla; distribuidor → Paula; nenhum WhatsApp duplicado.

## 7. Preservado

Classificação Paula/Carla/Leticia, dermoconsultoras, Laura, Talia, rodízio, handoffs manuais e
automáticos, RLS, Shopify, WhatsApp, chat-media, mensagens e histórico.
