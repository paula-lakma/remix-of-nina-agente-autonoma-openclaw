# Mídias na tela da Letícia (ExpedicaoChat) — diagnóstico e correção mínima

## Diagnóstico (verificado no banco e no código)

A mídia **não está quebrada** na tela da Letícia. Ela está sendo renderizada em um lugar que fica escondido.

O que foi verificado:

- `get_my_expedicao_messages` já devolve `id`, `conversation_id`, `type`, `media_url`, `media_type` — todos os campos necessários.
- `ExpedicaoChat.tsx` já chama `useSignedMediaUrls` e já usa `MediaBlock` para `image/audio/video/document`, tanto nos balões quanto no bloco "Motivo do encaminhamento" e no histórico.
- A RLS de `messages` tem a política `messages_select_expedicao_granted` usando `expedicao_can_access_conversation(conversation_id)`, e os GRANTs de `authenticated` existem — ou seja, a `chat-media` consegue resolver a mensagem com o JWT da Letícia; ela também tem o caminho de fallback via `expedicao_can_access_conversation`.
- A função `chat-media` está implantada e sem erros nos logs.

A causa real está nos horários da conversa testada (`c1752737…`):

```text
20:34:48  cliente  type=image   <- única mídia da conversa
20:34:59  cliente  type=text    "[imagem recebida] Descrição da imagem: ..."
20:35:33  NINA     type=text
20:35:31  handoff / concessão para a Letícia
```

A tela separa as mensagens em "antes do handoff" (histórico recolhido) e "depois". A imagem chegou **43 segundos antes** do handoff, então ela cai dentro do bloco recolhido "Ver conversa anterior com a NINA", que começa fechado. E o bloco "Motivo do encaminhamento" resolve como mensagem de origem a última fala **de texto** do cliente (ou a `trigger_message_id` gravada), que é a linha `[imagem recebida] Descrição da imagem: …` — uma linha de texto, sem mídia. Resultado: nenhuma imagem visível na primeira dobra.

Ou seja: a Letícia vê exatamente o texto descritivo da imagem, mas nunca a imagem, salvo se abrir o histórico manualmente.

## Correção mínima (somente apresentação em `src/components/ExpedicaoChat.tsx`)

1. **Anexo no bloco "Motivo do encaminhamento"**: quando a mensagem de origem for de texto mas existir uma mensagem de mídia do cliente próxima ao handoff (mesma conversa, últimos minutos antes/depois), exibir essa mídia junto do texto, com o `MediaBlock` já existente.
2. **Faixa de anexos recentes**: acima da conversa atual, listar as mídias do cliente pertencentes à janela do atendimento (últimas mídias recebidas), para que qualquer imagem, áudio, vídeo ou documento fique visível sem precisar abrir o histórico.
3. **Histórico com indicação de mídia**: o botão "Ver conversa anterior com a NINA" passa a indicar quantos anexos existem lá dentro, e abre automaticamente quando o histórico contém mídia e a conversa atual não tem nenhuma.
4. Nada de novo sistema de mídia: continua usando `useSignedMediaUrls` → `chat-media` → URL assinada do bucket privado `whatsapp-media`.

## O que NÃO será tocado

`message-grouper`, upload/bucket, transcrição, `chat-media`, `expedicao-chat`, `get_my_expedicao_messages`, `conversation_access_grants`, `expedicao_can_access_conversation`, handoff financeiro, "Finalizar atendimento", reativação da Nina, Shopify → WhatsApp, rastreio e todas as regras de segurança. Nenhuma migration, nenhuma alteração de política, nenhuma Edge Function republicada.

## Validação

- Abrir a conversa `c1752737…` na conta da Letícia e confirmar a imagem visível já na primeira dobra, abrindo ampliada.
- Confirmar que ela continua sem enxergar conversas sem concessão ativa.
- Rodar a suíte existente (`bunx vitest run`) para garantir que handoff/rastreio seguem intactos.
