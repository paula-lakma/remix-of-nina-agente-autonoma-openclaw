# João Felipe 08/09 11:33: por que o pedido explícito de dermoconsultora não virou handoff

## Auditoria read-only da execução real

Mensagens reais na conversa `a7b8eddb-…a5a1` (horários UTC = 11:34/11:35 em São Paulo):

```text
12:34:49Z  cliente  "Quero falar com uma dermoconsultora para me ajudar a escolher um protocolo profissional."
12:35:21Z  nina     "Claro, Joao! Vou te encaminhar para a nossa dermoconsultora agora..."   (source: openclaw, run 3d83b3ca)
14:33:58Z  cliente  mesma frase (novo teste)
14:34:30Z  nina     "Joao, o encaminhamento para a dermoconsultora já foi feito..."          (source: openclaw, run a9cf09cc)
```

Estado atual da conversa (consultado agora): `status=nina`, `ai_paused=false`, `human_takeover_required=false`, `requires_dermoconsultant=false`, `handoff_type=null`, `handoff_reason=null`, `assigned_user_id=null`, `assigned_at=null`, `attendance_finished=false`, `human_status=null`.

`conversation_handoff_events`: nenhum evento após 02/09 (`reopened_by_message`). Nenhum evento de dermo, nenhum grant novo. Nenhum erro registrado — o fluxo simplesmente não chegou a chamar `applyHandoff`/`pick_dermo_assignee`.

Não há logs retidos das execuções de `nina-reply` desses horários, então a versão exata que rodou às 12:35 não pode ser confirmada por log; a evidência de comportamento está abaixo.

## Reprodução exata com o código atual

Rodando o código local com os textos reais:

- `detectHandoffTarget("Quero falar com uma dermoconsultora…")` → `{ reason: dermoconsultora_request, destination: dermoconsultant }` — a classificação funciona.
- `extractHandoffMarker(resposta das 14:34)` → `target: null` — o modelo **não** emitiu `[[HANDOFF:dermoconsultora_request]]`.
- `isConfirmedHandoffResponse("o encaminhamento para a dermoconsultora já foi feito…")` → **false**.
- `resolveHandoffDecision(...)` → **`target: null`** → `applyResolvedHandoff` nunca é chamado.

Para a resposta das 12:35 ("Vou te encaminhar…") o código atual **retorna** `dermoconsultora_request`. Como na prática nada aconteceu às 12:35, essa execução rodou uma versão anterior à publicação; a das 14:34 já rodou o código novo e parou no ponto acima.

## Causa raiz

Em `resolveHandoffDecision` (`supabase/functions/_shared/handoff.ts:389-395`), a intenção detectada na mensagem do cliente só é aplicada quando:

1. o destino é `financeiro` (Leticia — determinístico), **ou**
2. o texto do modelo é reconhecido como confirmação por `isConfirmedHandoffResponse`.

Para destino `dermoconsultant` o handoff depende do que o modelo escreveu ou do marcador. Nesta execução:

- o marcador não veio (o prompt com `[[HANDOFF:dermoconsultora_request]]` vive no `_shared/handoff.ts`, mas o cérebro que respondeu é o OpenClaw da VPS, cuja base ainda não foi reconstruída com esse texto);
- a frase escolhida foi passado ("já foi feito"), que `isConfirmedHandoffResponse` não reconhece (ele cobre "vou te encaminhar/passar/conectar", "já encaminhei", "foi encaminhado", mas não "o encaminhamento … já foi feito").

Resultado: o cliente recebeu uma promessa de encaminhamento sem nenhum encaminhamento real. Ponto exato da parada: `resolveHandoffDecision` → `target: null`, antes de `applyResolvedHandoff`.

Verificações complementares: `public.is_dermo_handoff_reason` no banco em uso **contém** `dermoconsultora_request` (migração aplicada); `pick_dermo_assignee` nunca chegou a ser chamado; nenhum erro de RPC, grant ou update.

## Correção mínima proposta

1. **Tornar o pedido explícito de dermoconsultora determinístico**, igual à logística: em `resolveHandoffDecision`, aplicar o alvo detectado na mensagem do cliente quando `destination === "financeiro"` **ou** `reason === "dermoconsultora_request"`, sem depender da frase do modelo nem do marcador. Casos clínicos sensíveis continuam exigindo confirmação, como hoje.
2. **Ampliar `isConfirmedHandoffResponse`** para reconhecer a forma passada/nominal ("o encaminhamento … já foi feito", "encaminhamento realizado"), mantendo a rejeição de perguntas/ofertas.
3. **Aplicar o mesmo caminho determinístico no `nina-orchestrator`**, que hoje só executa handoff determinístico para `destination === "financeiro"` (`nina-orchestrator/index.ts:513`): incluir `dermoconsultora_request` com a mensagem de confirmação adequada ("Vou te encaminhar para uma dermoconsultora…"), preservando o balanceamento normal (sem prioridade da Laura).
4. **Testes**: casos com as duas frases reais do João (12:35 e 14:34) resultando em `applyHandoff` chamado; frases genéricas e "protocolo" isolado continuam sem handoff; matriz logística/Leticia inalterada.
5. **Publicar somente** `nina-reply` e `nina-orchestrator`.

Opcional, a confirmar com você: reconstruir a base do cérebro (`brain-build`) para que o OpenClaw passe a emitir o marcador. Não é necessário para a correção acima funcionar.

## Fora do escopo

Nada é alterado em: João Felipe (nenhuma normalização, nenhuma atribuição, nenhuma mensagem), handoff da Leticia, precedência logística, prioridade da Laura, balanceamento das cinco dermos, contas, RLS, reabertura automática, chat-media, Shopify, WhatsApp, histórico ou migrations.
