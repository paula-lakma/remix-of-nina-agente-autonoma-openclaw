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

Os registros mostram a corrida exata:

```text
13:05:28.10  influenciadora  -> liberar em 13:05:37.608
13:05:28.66  distribuidor    -> liberar em 13:05:36.685
13:05:37     agrupador roda  -> pega só o distribuidor
13:05:37/38  "No pending messages to schedule"  <- a influenciadora ficou órfã
```

O agrupador só se reagenda por auto-chamada em memória e só olha mensagens com liberação
**futura**. A mensagem ficou na janela cega entre "ainda não venceu" e "já venceu", e **não
existe nenhuma rotina periódica de retomada** (nenhum agendamento ativo hoje).

## 3. O que NÃO causou

Não foi classificação, nem handoff determinístico, nem a Carla, nem agendamento/"Ana Carla"
(nenhuma ferramenta de agenda foi chamada), nem erro, timeout, lock ou run preso. Nenhuma
resposta chegou a ser criada — não há envio pendente nem com erro.

## 4. Diferença para o distribuidor

Única diferença: o distribuidor venceu ~0,9s antes e foi capturado; a influenciadora venceu
depois e nenhuma execução posterior a buscou.

## 5. Correção com garantias de concorrência e idempotência

### 5.1 Rede de segurança periódica (a cada 1 minuto)
Busca apenas entradas que: não estão processadas, já venceram a liberação e ainda não têm
registro correspondente na fila da Nina. Nunca reprocessa mensagens concluídas.

### 5.2 Captura atômica (uma execução por mensagem)
A seleção deixa de ser "ler e depois marcar". Passa a ser uma reivindicação atômica no banco
(`UPDATE ... WHERE processed = false ... RETURNING`, com `FOR UPDATE SKIP LOCKED`), exposta como
função dedicada no mesmo padrão já usado pelas outras filas do projeto
(`claim_nina_processing_batch`, `claim_send_queue_batch`). Auto-chamada e rotina periódica podem
rodar juntas: quem não reivindicar, não processa. Elimina risco de resposta dupla, handoff duplo,
entrada duplicada na fila da Nina e envio duplicado no WhatsApp.

### 5.3 Fechar a janela cega
Ao final de cada execução, o agrupador reconsulta **também** as mensagens já vencidas e ainda não
reivindicadas. Se existir alguma, ele processa ou garante nova execução — nunca encerra com
"nada pendente" deixando mensagem vencida descoberta. A rede de segurança do item 5.1 é a
garantia final.

### 5.4 Idempotência entre filas
Hoje a proteção é apenas uma checagem em código antes de inserir na fila da Nina — há espaço
para duplicata em execuções simultâneas. Proteção mínima proposta: **índice único por
`message_id`** em `nina_processing_queue` e inserção tolerante a conflito. Nenhuma alteração na
lógica de classificação ou de encaminhamento.

### 5.5 Limite de recuperação (sem disparar histórico antigo)
A rotina periódica só recupera mensagens vencidas nas **últimas 2 horas**. Mais antigas que isso
são marcadas como expiradas e registradas para auditoria, sem disparar nada ao cliente — assim
nenhuma mensagem esquecida há dias volta de surpresa.

### 5.6 Mensagem real da Carla Marketing
Depois da correção sistêmica, reprocessar **somente** `f8739016-…`, e apenas após reconfirmar
que ela continua não processada, sem resposta posterior, sem encaminhamento aplicado e sem
registro na fila da Nina. Se qualquer um desses pontos já tiver ocorrido, não reprocessar.
Resultado esperado: motivo `influencer`, responsável Carla, Nina pausada, uma única resposta.

## 6. Testes

- duas mensagens vencendo com diferença de milissegundos → ambas processadas;
- auto-chamada e rotina periódica simultâneas → uma única execução por mensagem;
- mensagem já processada → ignorada;
- mensagem já na fila da Nina → não duplicada;
- fila vazia → nenhuma ação;
- mensagem vencida há mais de 2 horas → expirada, nada enviada;
- influenciadora → Carla; distribuidor → Paula; nenhum WhatsApp duplicado.

## 7. Preservado

Classificação Paula/Carla/Leticia, dermoconsultoras, Laura, Talia, rodízio, handoffs manuais e
automáticos, RLS, Shopify, WhatsApp, chat-media, mensagens e histórico.
