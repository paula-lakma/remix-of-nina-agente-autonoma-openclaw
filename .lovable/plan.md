# Mídia antiga indisponível: acabar com o popup global de erro

## 1. Causa raiz exata

A edge function `chat-media` responde **HTTP 404** (`{"error":"media_unavailable"}`) quando nenhum dos caminhos candidatos existe no storage. Esse 404 é um estado **esperado** (mídia antiga que nunca foi salva ou já não existe), mas é sinalizado como falha HTTP. O overlay de runtime do preview captura a resposta não-2xx da edge function e abre o popup global "The app encountered an error", mesmo com o app tratando o erro internamente.

Duas condições de dados alimentam isso:

- áudios antigos (~15 mensagens) nunca tiveram o binário enviado ao bucket — `media_url` nulo, nenhum objeto em `whatsapp-media`; toda tentativa de assinatura falha;
- imagens/documentos cuja URL assinada de 7 dias expirou e cujo objeto foi removido/nunca existiu no caminho determinístico.

## 2. Arquivos e funções envolvidos

- `supabase/functions/chat-media/index.ts` — monta candidatos (`media_url` parseada, `metadata.media_path`, caminho determinístico `{conversation_id}/in/{message_id}.{ext}`) e devolve `404 media_unavailable` quando nenhum assina.
- `src/hooks/useSignedMediaUrls.ts` — chama `supabase.functions.invoke('chat-media')` para **toda** mensagem de mídia da conversa aberta.
- `src/components/ChatInterface.tsx` — `mediaSrc()` + `renderMessageContent()` (imagem, documento, áudio, vídeo).
- `src/components/ExpedicaoChat.tsx` / `src/components/DermoChat.tsx` — mesma resolução; já existe um texto "Mídia indisponível" parcial.
- `src/components/MessageActions.tsx` — usa `msg.mediaUrl` bruto (URL antiga possivelmente expirada) em OCR/STT/download.

## 3. Por que o 404 vira popup global

Não é uma exceção não capturada do React: `supabase.functions.invoke` nunca lança — retorna `{ data: null, error }`, e o hook já tem `try/catch` devolvendo `null`. O popup vem do **monitor de runtime do preview**, que trata qualquer resposta não-2xx de edge function como erro da aplicação. Ou seja, o problema está em **A) a edge function responder com status de erro para um caso normal** — o frontend já não quebra, mas exibe fallback ruim e continua disparando chamadas 404.

Agravante (item 7 do pedido): o hook só faz cache dos **sucessos**. Cada re-render/nova seleção de conversa refaz a chamada para as mesmas mídias ausentes, repetindo o 404 (e o popup) indefinidamente ao rolar.

## 4. Comportamento atual por tipo de mídia

| Tipo | Mídia existente | Mídia ausente hoje |
| --- | --- | --- |
| Imagem | assina, miniatura + lightbox OK | cai em `msg.content`/URL expirada → `onError` troca por placeholder externo "Erro Imagem" (`placehold.co`) + 404 global |
| Áudio | player toca | `src` nulo → botão desabilitado, sem aviso; 404 global a cada render |
| Documento/PDF | link abre | `href="#"`, rótulo "clique para abrir" enganoso; 404 global |
| Vídeo | player OK | já mostra "Vídeo indisponível" (único fallback correto); 404 global |
| Expedição/Dermo | assina | texto "Mídia indisponível" parcial; 404 global |

## 5. Mudança mínima necessária

**Backend (`chat-media`)** — quando nenhum candidato assina, responder **HTTP 200** com corpo explícito:

```json
{ "ok": false, "reason": "media_unavailable", "url": null, "media_type": "...", "expires_in": 0 }
```

Erros reais permanecem com status de erro: 401 sem sessão, 403 sem permissão, 400 payload inválido, 500 exceção. Nada de inventar URL nem devolver arquivo de outro registro.

**Frontend (`useSignedMediaUrls`)** — passar a devolver, por mensagem, um estado `'loading' | 'ready' | 'unavailable'` além da URL, e **cachear negativamente** (`unavailable`) por sessão, para não repetir a chamada. Sem retry automático.

**Componentes** — usar o estado para renderizar o fallback local por tipo, sem tocar no layout dos balões.

## 6. Fallback "Mídia indisponível"

Bloco discreto dentro do próprio balão, mesma largura da mídia: ícone pequeno (imagem/áudio/arquivo conforme o tipo) + texto `Mídia indisponível` e, na segunda linha, `arquivo não está mais disponível`. A legenda (`content`) e a transcrição continuam sendo exibidas normalmente logo abaixo — nas mensagens de áudio antigas a transcrição já é o conteúdo útil. Sem toast, sem popup, sem placeholder externo.

## 7. Como garantir que mídia válida continue funcionando

- A ordem de candidatos e a lógica de assinatura em `chat-media` não mudam — só muda o status/corpo do caso "nenhum candidato".
- `mediaSrc()` mantém a precedência `URL assinada fresca > media_url gravada`.
- O fallback só aparece quando o estado é `unavailable` **e** não há `media_url` utilizável.
- Testes cobrindo uma imagem recente, um PDF e um áudio novo (com objeto no bucket) antes/depois.

## 8. Riscos

Baixos. Um 200 com `ok:false` muda o contrato da função, mas o único consumidor é `useSignedMediaUrls`. Risco residual: mídia válida classificada como indisponível por falha transitória de assinatura — mitigado mantendo o cache negativo apenas em memória (some ao recarregar a página) e não persistindo nada no banco.

## 9. Plano de implementação e teste

1. `supabase/functions/chat-media/index.ts`: trocar o `404 media_unavailable` por `200 { ok:false, reason:'media_unavailable' }`; manter log de servidor. Deploy só dessa função.
2. `src/hooks/useSignedMediaUrls.ts`: novo retorno com estado por mensagem + cache negativo; sem retry.
3. `src/components/ChatInterface.tsx`: fallback local para imagem (substitui o placeholder externo), áudio, documento; vídeo mantém o texto atual padronizado.
4. `src/components/ExpedicaoChat.tsx` e `DermoChat.tsx`: mesmo componente de fallback nos balões, no bloco "Motivo do encaminhamento" e no histórico.
5. Testes: abrir no preview uma conversa com áudio antigo (sem objeto) e outra com imagem recente; confirmar zero popup global, mídia válida abrindo/tocando, e uma única chamada por mensagem indisponível na aba de rede. Rodar a suíte existente (`bunx vitest run`).

Nada é alterado em handoff da Letícia, handoff das dermoconsultoras, reabertura automática da Nina, classificação logística, WhatsApp, Shopify, contas, permissões, filas, mensagens ou `conversation_handoff_events`. Nenhuma migração, nenhum registro real alterado, nenhuma mídia apagada.
