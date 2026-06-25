## Diagnóstico

Hoje, quando o WhatsApp envia uma imagem:
1. `whatsapp-webhook` grava a mensagem com `content = "[imagem recebida]"` e só guarda o `media_id` em `metadata` (`messages.media_url` fica `null`).
2. `message-grouper` baixa só áudio (transcreve com Whisper). Imagem/documento/vídeo nunca são baixados nem descritos.
3. Quando a `nina-orchestrator` monta o prompt, ela recebe literalmente `"[imagem recebida]"` — sem conteúdo visual, sem URL. Por isso a Nina "não identifica" a foto.
4. No frontend, `ChatInterface` tenta exibir `<img src={mediaUrl || content}>`, mas `mediaUrl` é `null` e `content` é o placeholder, então a imagem nunca aparece. Mesmo que tivéssemos a URL bruta do Graph API, ela expira em ~5 min e exige `Bearer` token.

Conclusão: precisamos (a) persistir o anexo num bucket nosso, (b) usar GPT para descrever a imagem e injetar essa descrição no que vai pra Nina, (c) trocar o `<a>` por um modal real.

## O que será feito

### 1. Storage — novo bucket privado `whatsapp-media`
- Criar bucket privado `whatsapp-media` (mantém `audio-messages` como está).
- RLS em `storage.objects`:
  - `service_role`: leitura/escrita (uso das edge functions).
  - `authenticated`: `SELECT` no bucket (chat UI baixa via signed URL gerada pelo backend; mas signed URL já funciona sem policy — a policy de SELECT garante que o player do navegador logado consiga abrir). Sem policy para `anon`.
- Estrutura de chave: `{conversation_id}/in/{message_id}.{ext}` para recebidos e `{conversation_id}/out/{ts}.{ext}` para enviados.

### 2. Edge function `message-grouper` — baixar e analisar imagem/documento/vídeo
Estender `combineAndTranscribeMessages` (e criar helpers em `_shared`) para tratar `image`, `document` e `video`:

- `downloadWhatsAppMedia` já existe; reutilizar.
- Novo helper `uploadMediaToStorage(supabase, buffer, conversationId, messageId, mimeType)` que joga em `whatsapp-media/{conversation_id}/in/{message_id}.{ext}` e retorna **signed URL de 7 dias** (renovável). Salvar essa URL em `messages.media_url` e o MIME em `messages.media_type`.
- Para `image`: chamar Lovable AI Gateway com `openai/gpt-5-mini` (modelo de visão da GPT, conforme catálogo), enviando a imagem como `data:<mime>;base64,...` em bloco `image_url`. Prompt curto em PT pedindo descrição em até 3 linhas + leitura de texto visível (OCR leve). Atualizar `messages.content` para `"[imagem] " + descrição` (preservando legenda do usuário, se houver).
- Para `document` (PDF): mesma rota, mas com bloco `file` (PDF base64). Gravar descrição em `content`.
- Para `video`: por enquanto só persistir o arquivo + manter legenda; sem análise visual (modelo de vídeo fora do escopo).
- O `combineAndTranscribeMessages` então passa a juntar o `content` já enriquecido — Nina recebe a descrição da imagem como texto e responde corretamente. (Não precisa mexer no `nina-orchestrator`.)

Falhas de download/IA não bloqueiam: caem para `"[imagem recebida]"` e a mensagem segue.

### 3. Frontend — modal de imagem
- Substituir o `<a target="_blank">` em `ChatInterface.renderMessageContent` (case `IMAGE`) por um `Dialog` do shadcn:
  - Thumbnail clicável (mantém o estilo atual).
  - Modal abre imagem em tamanho real (`max-h-[85vh] object-contain`), com botão "Abrir original" e fechar.
  - Mostrar legenda/descrição abaixo (já vem em `msg.content`).
- Suporte a `DOCUMENT`: manter card atual (download direto faz mais sentido para PDF).

### 4. URL assinada — renovação no backend
Como signed URL expira, criar pequena função utilitária `media-signed-url` (ou usar a própria orchestrator/grouper já gera no momento da gravação): basta gerar com 7 dias e regravar caso a UI peça refresh. Para o escopo atual, 7 dias é suficiente; renovação automática fica como follow-up.

## Detalhes técnicos

- **Bucket via tool** `supabase--storage_create_bucket` (`name=whatsapp-media`, `public=false`). Policies em migration depois.
- **Modelo de visão**: `openai/gpt-5-mini` no endpoint `/v1/chat/completions` do Lovable Gateway (multimodal `image_url` data URL). Já temos `LOVABLE_API_KEY`.
- **Tamanho**: WhatsApp limita imagem em ~5 MB; ok para base64 inline.
- **Tipos atualizados**: `media_type` passa a aceitar string MIME real (ex.: `image/jpeg`). Hoje a coluna é texto livre, sem migração.
- **Sem mudança de schema** — `messages.media_url`/`media_type`/`content` já existem.

## Arquivos afetados

- `supabase/functions/message-grouper/index.ts` — novo fluxo image/document; reuso do download.
- `supabase/functions/_shared/media.ts` *(novo)* — `uploadMediaToStorage`, `describeImageWithGpt`, `extractDocumentText`.
- Migration nova — policies RLS em `storage.objects` para bucket `whatsapp-media`.
- `src/components/ChatInterface.tsx` — modal de imagem (Dialog shadcn).
- (Opcional) `supabase/functions/whatsapp-webhook/index.ts` — manter como está; o enriquecimento acontece no grouper.

## Fora do escopo (follow-up)

- Persistir também os anexos **enviados** pela Nina (TTS já vai pra `audio-messages`; imagens/docs enviados ainda não existem como feature).
- Renovação automática de signed URL expirada.
- Análise de vídeo.
