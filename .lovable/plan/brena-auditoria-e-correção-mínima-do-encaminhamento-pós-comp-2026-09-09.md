# Brena — auditoria e correção mínima do encaminhamento pós-compra para a Leticia

Auditoria feita read-only; nada foi alterado ainda.

## 1. Classificação real da mensagem

Texto que chegou ao classificador (idêntico ao salvo em `messages`, 09/09 12:36:10 UTC):
"Gostaria de saber sobre os meus produtos, por que ainda não chegaram"

`detectHandoffTarget(...)` → **null**.

| Frase | Resultado real hoje |
| --- | --- |
| "Gostaria de saber sobre os meus produtos, por que ainda não chegaram" | null |
| "Gostaria de saber sobre o meu pedido" | null |
| "meus produtos ainda não chegaram" | null |
| "estou esperando meu pedido" | null |
| "quando meus produtos chegam?" | null |
| "cadê meu pedido?" | null |
| "meu pedido está demorando" | null |
| "meu pedido não chegou" | where_is_my_order / financeiro |
| "ainda não recebi meu pedido" | where_is_my_order / financeiro |
| "não recebi a compra" | where_is_my_order / financeiro |

## 2. Motivo canônico

Nenhum detectado. O correto é `where_is_my_order` (destino `financeiro` → Leticia) para "não
chegou / cadê / esperando / quando chega", e `order_financial_question` para dúvida genérica
sobre o pedido já feito. Ambos já existem — nenhuma estrutura nova.

## 3. Decisão real de handoff

`resolveHandoffDecision` → `{ target: null, source: "customer_intent" }`. Sem marcador
`[[HANDOFF:...]]` e sem detecção por texto, nada é aplicado.

## 4. Encaminhamento para Leticia

Não foi chamado. `applyResolvedHandoff` e `apply_expedicao_handoff` não executaram; Leticia não
foi selecionada; não houve erro. O destino financeiro continua determinístico — nunca foi
acionado.

## 5. Estado real da conversa (Brena kezia, `1928c6f8-…c984`)

status `nina`; ai_paused `false`; human_takeover_required `false`;
requires_dermoconsultant `false`; handoff_type/handoff_reason `null`;
assigned_user_id/assigned_at `null`; attendance_finished `false`; human_status `null`;
last_message_at 09/09 12:38 UTC.

## 6. Grants e eventos

Zero registros em `conversation_access_grants` e `conversation_handoff_events`.

## 7. Por que o handoff não aconteceu

A matriz logística exige "pedido/encomenda/compra" no singular com verbos específicos. Não cobre
sujeito "produtos" no plural ("chegaram"), nem "cadê", "estou esperando", "está demorando",
"quando chegam", nem a dúvida genérica "sobre o meu pedido". Sem motivo, o fluxo inteiro para.

## 8. Por que a Nina falou "equipe de expedição"

A expressão não está escrita em lugar nenhum — o modelo parafraseou as instruções, que repetem
"expedição": `TRACKING_HANDOFF_PROMPT` (`supabase/functions/_shared/handoff.ts`), o texto gerado
em `supabase/functions/brain-build/index.ts`, `skills/nina/SKILL.md` e
`skills/nina/prompts/conversa.md`.

## 9. Como a linguagem chega ao runtime (confirmado)

- **Caminho Lovable** (`nina-orchestrator`): usa `TRACKING_HANDOFF_PROMPT` diretamente no prompt.
  Basta publicar a função.
- **Caminho OpenClaw/VPS**: `brain-build` **gera** `SKILL.md`, `prompts/conversa.md`,
  `identity/` e `knowledge/` e comita no branch `nina-brain` do repositório do cliente;
  a VPS puxa esse branch via `scripts/brain_sync.sh` (cron a cada 2 minutos).
  Os arquivos `skills/nina/*` deste projeto são apenas a fonte de referência — o que vale em
  produção é o que o `brain-build` gerou por último.
- **Conclusão:** editar os arquivos não basta. É obrigatório publicar `brain-build` e depois
  executar a reconstrução do cérebro (`/cerebro` → reconstruir), aguardando o sync da VPS.

## Correção mínima proposta

### A. Classificação — pós-compra sempre vai para a Leticia

Somente em `supabase/functions/_shared/handoff.ts`, na matriz logística:

- `where_is_my_order`: reconhecer plural e outros sujeitos ("produtos", "itens", "mercadoria",
  "encomenda", "compra"), "ainda não chegou/chegaram", "não chegou até agora", "cadê / onde
  está", "estou esperando", "está demorando/atrasando", "quando chega/chegam/vou receber".
- `order_financial_question`: reconhecer dúvida genérica sobre pedido já realizado —
  "sobre o meu pedido", "dúvida sobre meu pedido", "informações sobre minha compra",
  "quero saber do meu pedido", "prazo do meu pedido", "quero saber do rastreio".
- **Guarda anti-falso-positivo:** exige possessivo/pós-compra (`meu/minha/meus/minhas` pedido,
  compra, encomenda, produtos, ou referência a entrega/rastreio já existente). Intenção
  comercial nunca encaminha: "quero fazer um pedido", "como faço para comprar?", "quais
  produtos vocês têm?", "quanto custa esse produto?", "quero comprar um kit".

O determinismo já existente é preservado: detectado o motivo, o handoff para a Leticia acontece
independentemente da frase escrita ao cliente.

### B. Linguagem — remover "expedição" do que chega ao cliente

Trocar por "Leticia / setor responsável pelo seu pedido" nos textos de instrução em
`TRACKING_HANDOFF_PROMPT`, `brain-build`, `skills/nina/SKILL.md` e
`skills/nina/prompts/conversa.md`, com a frase-modelo:
"Vou encaminhar seu atendimento para a Leticia, que vai verificar as informações do seu pedido."
Instrução explícita de **nunca** dizer equipe/setor/time/nossa expedição.
Nomes técnicos internos (motivos canônicos, `apply_expedicao_handoff`, papel `expedicao`,
`expedicao-chat`) permanecem inalterados. Nenhuma conta, equipe ou fila nova.

### C. Testes

Em `src/__tests__/handoff-classification-matrix.test.ts`: as 10 frases que devem encaminhar
(destino `financeiro`) e as 5 comerciais que não devem, além da precedência logística sobre
dermatológico já existente.

## Publicação necessária

1. Publicar `nina-orchestrator` e `nina-reply` (classificação + prompt do caminho Lovable).
2. Publicar `brain-build`.
3. Executar a reconstrução do cérebro e confirmar que o novo `SKILL.md`/`conversa.md` foi
   commitado no branch `nina-brain`; a VPS sincroniza em até ~2 minutos.
4. Verificar que o conteúdo publicado não contém mais "expedição" em texto voltado ao cliente.

## Arquivos afetados

- `supabase/functions/_shared/handoff.ts`
- `supabase/functions/brain-build/index.ts`
- `skills/nina/SKILL.md`, `skills/nina/prompts/conversa.md`
- `src/__tests__/handoff-classification-matrix.test.ts`

## Preservado

Dermoconsultoras, rodízio, `weight=8` da Talia, prioridade da Laura, classificação sensível,
reabertura, RLS, Shopify, WhatsApp sender, chat-media e histórico. A conversa da Brena não é
atribuída manualmente e nenhuma mensagem é enviada.
