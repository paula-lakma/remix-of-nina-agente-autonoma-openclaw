# Influenciadora sem resposta — diagnóstico read-only (Carla Marketing, 15/09 10:05)

Nada foi alterado: nenhuma conversa, mensagem, conta ou permissão.

## 1. Classificação da frase

"Sou influenciadora e queria fazer parceria" **é classificada corretamente** pelo código atual:
motivo `influencer`, destino parcerias (Carla), e está na lista de motivos determinísticos.
A regra de influenciadora funciona — o problema não está no roteamento.

## 2. Onde travou (causa raiz confirmada)

A mensagem entrou no banco (13:05:27.84, id `f8739016-…`) e foi enfileirada na fila de
agrupamento (`message_grouping_queue`), mas **essa entrada continua marcada como não processada
até agora**. Consequência em cadeia:

- nunca entrou na fila da Nina (`nina_processing_queue` não tem registro dessa mensagem);
- a Nina nunca foi acionada, logo não houve classificação, nem handoff, nem resposta;
- a conversa segue `status = nina`, `ai_paused = false`, sem responsável e sem evento de handoff.

Os logs mostram o detalhe exato. As duas mensagens de teste chegaram no mesmo segundo:

```text
13:05:28.10  influenciadora  -> liberar em 13:05:37.608
13:05:28.66  distribuidor    -> liberar em 13:05:36.685
13:05:37     agrupador roda  -> pega só o distribuidor (o outro ainda não venceu)
13:05:37/38  "No pending messages to schedule"  <- a linha da influenciadora ficou órfã
```

O agrupador só reprocessa por auto-chamada agendada em memória. Nessa janela de milissegundos,
a mensagem da influenciadora ficou entre "ainda não venceu" e "já passou", e nenhuma nova
auto-chamada foi agendada. **Não existe nenhuma rotina periódica de retomada** (não há cron
configurado), então a mensagem ficou parada indefinidamente.

## 3. O que NÃO causou o problema

- Não foi a classificação de influenciadora.
- Não foi o handoff determinístico (nunca chegou a ser executado).
- Não foi a Carla (nunca chegou a ser selecionada — o fluxo parou antes).
- Não foi agendamento/"Ana Carla": nenhuma ferramenta de agenda foi chamada nesse horário.
- Não houve erro, timeout, lock ou run preso; não há mensagem de saída com erro nem pendente
  na fila de envio — simplesmente nenhuma resposta foi criada.

## 4. Diferença exata para o fluxo do distribuidor

Única diferença: o distribuidor venceu ~0,9s antes e foi capturado pela execução do agrupador;
a influenciadora venceu depois e nenhuma execução posterior a buscou. Do ponto em que o
distribuidor seguiu (fila da Nina → classificação → Paula Rodrigues → pausa → resposta),
a influenciadora nunca entrou.

## 5. Correção mínima proposta (aguardando sua aprovação)

1. **Rede de segurança periódica**: uma rotina a cada minuto que aciona o agrupador. Qualquer
   mensagem que escape da auto-chamada é recuperada em até ~1 minuto, para qualquer assunto
   (não só influenciadora).
2. **Fechar a janela cega no agrupador**: ao terminar uma execução, reavaliar as mensagens
   pendentes considerando também as que acabaram de vencer, em vez de apenas as futuras.
3. **Reprocessar manualmente a mensagem da Carla Marketing** (uma única mensagem, já existente),
   para que ela seja classificada e encaminhada à Carla como deveria ter sido.

Sem alterar classificação, matriz Paula/Carla/Leticia, dermoconsultoras, rodízio, Laura, Talia,
logística, RLS, WhatsApp, Shopify ou histórico. Nenhuma mensagem antiga é reenviada.

## 6. Teste após a correção

- Enviar "Sou influenciadora e queria fazer parceria" → resposta da Nina, responsável Carla,
  conversa pausada.
- Enviar duas mensagens de contatos diferentes no mesmo segundo → ambas respondidas.
- Distribuidor → Paula Rodrigues, inalterado.
