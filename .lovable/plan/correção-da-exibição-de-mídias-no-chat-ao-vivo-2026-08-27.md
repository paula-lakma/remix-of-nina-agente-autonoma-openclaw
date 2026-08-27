# Correção da exibição de mídias no Chat ao Vivo

## Diagnóstico do fluxo atual (verificado)

```text
Meta → whatsapp-webhook → messages (type/media_type, metadata.media_id, SEM arquivo)
     → message-grouper → baixa binário da Meta → bucket privado whatsapp-media
                       → grava messages.media_url = SIGNED URL de 7 dias
     → Chat ao Vivo (select * em messages via Supabase client) → ChatInterface
     → Chat da expedição (edge fn expedicao-chat → RPC get_my_expedicao_messages) → ExpedicaoChat
```

Confirmações da investigação:

1. Tipo da mensagem: coluna `messages.type` (enum `text|image|audio|document|video`), com `media_type` guardando o MIME.
2. Imagens são gravadas duas vezes: o webhook cria a linha só com `type='image'`, `media_type='image'` e `metadata.media_id`; o **message-grouper** é quem depois baixa o arquivo e preenche `content`, `media_url` e `media_type` (MIME real).
3. Campos existentes: `media_url`, `media_type`, `metadata.media_id`, `metadata.original_type`. **Não existe** coluna/campo com o caminho do arquivo no storage.
4. A mídia é sim baixada da Meta e persistida (não fica só o media_id).
5. Bucket privado `whatsapp-media`, caminho determinístico `{conversation_id}/in/{message_id}.{ext}`. Hoje há 12 objetos, todos correspondentes às mensagens de mídia com URL.
6. A URL da Meta expira, e o sistema já trata isso copiando para o storage — porém a URL assinada gravada em `media_url` também expira (TTL de 7 dias, `_shared/media.ts`) e **nunca é renovada**.
7. O Chat ao Vivo lê `messages` direto pelo client (`useConversations`, `select('*')`); a tela da Letícia usa `expedicao-chat` → `get_my_expedicao_messages` (a RPC já devolve `media_url`/`media_type`).
8. Renderização: `src/components/ChatInterface.tsx` (`renderMessageContent`) e `src/components/ExpedicaoChat.tsx`.

## Causa exata

São duas causas independentes, ambas confirmadas:

- **Causa A (Chat ao Vivo principal):** `media_url` é uma URL assinada de 7 dias congelada no banco. Passado esse prazo o link retorna erro e o `onError` do `<img>` troca pelo placeholder "Erro Imagem". Todas as fotos com mais de 7 dias estão quebradas; a mais recente (26/08) ainda funciona por poucos dias.
- **Causa B (tela da Letícia):** `ExpedicaoChat.tsx` renderiza **apenas `m.content`** — não existe nenhum `<img>`, player ou link. Mesmo com `media_url` válido vindo da RPC, a mídia nunca é desenhada, nem no bloco "Motivo do encaminhamento" nem no histórico recolhido.
- **Causa C (áudio):** o grouper transcreve o áudio mas **não** o envia ao storage — as 15 mensagens de áudio existentes têm `media_url` nulo, então o player fica sem fonte.

## Tabelas e campos envolvidos

- `messages`: `type`, `media_type`, `media_url`, `metadata` (`media_id`, `original_type`), `content` (legenda/descrição).
- `storage.objects` no bucket privado `whatsapp-media`, prefixo `{conversation_id}/in/`.
- RPC `get_my_expedicao_messages` (já expõe `media_url`/`media_type`, sem alteração de assinatura necessária).

## Estratégia segura

Trocar "URL assinada congelada" por "caminho no storage + URL assinada sob demanda", sem tornar nada público e sem tocar em token da Meta no frontend.

1. **Persistir o caminho**: gravar `metadata.media_path` (e `metadata.media_filename` para documentos) ao subir o arquivo. `media_url` continua sendo preenchido para não quebrar nada existente.
2. **Nova Edge Function `chat-media`** (autenticada): recebe `message_id`, valida a sessão e a permissão — staff operacional (admin/manager/sdr) pela RLS de `messages`, ou `expedicao_can_access_conversation` para a Letícia — resolve o caminho (do `metadata.media_path` ou reconstruído deterministicamente a partir de `conversation_id`/`message_id`/extensão) e devolve uma URL assinada curta (~1h). Sem service role exposto, sem token da Meta no cliente.
3. **Frontend resolve preguiçosamente**: hook `useMediaUrl(message)` que pede a URL fresca a `chat-media` quando a mensagem tem mídia, com cache em memória por sessão. Usado tanto pelo `ChatInterface` quanto pelo `ExpedicaoChat`.
4. **Áudio recebido**: passar a subir o binário do áudio ao mesmo bucket no grouper (a transcrição atual continua igual), preenchendo `media_url`/`media_type`/`metadata.media_path`.
5. **Legenda**: manter `content` como legenda/descrição exibida junto da mídia (já é o comportamento no `ChatInterface`; será replicado na tela da expedição).

## Arquivos a alterar

- `supabase/functions/_shared/media.ts` — retornar/registrar o `path` já calculado (já retorna; passa a ser gravado).
- `supabase/functions/message-grouper/index.ts` — gravar `metadata.media_path` nas 4 mídias e persistir áudio no storage.
- `supabase/functions/chat-media/index.ts` — **nova** função de assinatura sob demanda.
- `src/hooks/useMediaUrl.ts` — **novo** hook de resolução/cache.
- `src/components/ChatInterface.tsx` — usar o hook em imagem/áudio/documento/vídeo (nenhuma mudança de layout dos balões).
- `src/components/ExpedicaoChat.tsx` — renderizar mídia nos balões, no bloco "Motivo do encaminhamento" e no histórico recolhido.
- Migration única e aditiva: backfill de `metadata.media_path` nas mensagens antigas cujo objeto existe no storage. Nenhuma coluna nova, nenhuma política alterada.

## Comportamento com fotos antigas

Retroativo. Os 12 arquivos ainda estão no bucket e o caminho é determinístico, então todas as imagens/vídeos/documentos já recebidos voltam a aparecer assim que a URL for assinada sob demanda — o cliente não precisa reenviar nada. Exceção: os áudios antigos (15 mensagens) nunca foram salvos no storage e continuarão só com a transcrição; a partir da correção, áudios novos passam a ter player.

## Testes

- Assinatura sob demanda de uma imagem antiga (>7 dias) e de uma recente, conferindo HTTP 200.
- `chat-media` recusando (401/403) sem sessão, e com uma sessão `expedicao` para conversa sem concessão ativa.
- Render no Chat ao Vivo via Playwright: miniatura proporcional, lightbox, legenda, data/hora e autor preservados.
- Render na tela da expedição: mídia no balão, no bloco de motivo e no histórico recolhido.
- Suíte existente (`bunx vitest run`) para garantir que handoff/rastreio/Shopify seguem intactos.
- Nenhuma mensagem real de WhatsApp será enviada em nenhum teste.

## Diff funcional planejado (resumo)

```text
message-grouper: update messages set media_url, media_type,
+                 metadata = metadata || {media_path, media_filename}
+ bloco de áudio: uploadMediaToStorage(...) antes/depois da transcrição

+ supabase/functions/chat-media/index.ts
+   auth obrigatória → checa acesso (staff via RLS | expedicao via RPC)
+   createSignedUrl(path, 3600) → { url }

+ src/hooks/useMediaUrl.ts  (cache + fetch da função)

ChatInterface.renderMessageContent:
-   const src = msg.mediaUrl || msg.content
+   const src = useMediaUrl(msg)     // fallback para msg.mediaUrl

ExpedicaoChat:
-   <p>{m.content}</p>
+   <MediaBubble message={m} />      // imagem/áudio/doc/vídeo + legenda
+   mesma renderização dentro de "Motivo do encaminhamento" e do histórico
```

Nada em handoff, `apply_expedicao_handoff`, concessões, flags, Shopify, rastreio, templates, `send_queue` ou dedupe é tocado.
