# Brena — auditoria read-only do handoff logístico que não aconteceu

Tudo abaixo foi verificado agora, sem alterar dados, contas ou funções.

## 1. Classificação real da mensagem

Texto que chegou ao classificador (idêntico ao salvo em `messages`, 09/09 12:36:10 UTC):
"Gostaria de saber sobre os meus produtos, por que ainda não chegaram"

Execução real de `detectHandoffTarget(...)` → **null**.

Comparação com as frases citadas:

| Frase | Resultado real |
| --- | --- |
| "Gostaria de saber sobre os meus produtos, por que ainda não chegaram" | null |
| "meus produtos ainda não chegaram" | null |
| "meu pedido não chegou" | where_is_my_order / financeiro |
| "ainda não recebi meu pedido" | where_is_my_order / financeiro |
| "estou esperando meu pedido" | null |
| "quando meus produtos chegam?" | null |
| "cadê meu pedido?" | null |
| "meu pedido está demorando" | null |
| "não recebi a compra" | where_is_my_order / financeiro |
| "Gostaria de saber sobre o meu pedido" | null |

## 2. Motivo canônico

Nenhum detectado. O motivo correto seria `where_is_my_order` (destino `financeiro` → Leticia).
A regex atual exige `ainda não chegou` / `ainda não recebi` no singular e sempre atrelado às
palavras `pedido/encomenda/compra`. "produtos ... ainda não **chegaram**" (plural, sujeito
"produtos") não casa em nenhuma alternativa.

## 3. Decisão real de handoff

`resolveHandoffDecision` → `{ target: null, source: "customer_intent" }`.
Sem marcador `[[HANDOFF:...]]` no texto do agente e sem detecção por texto, não há alvo.

## 4. Encaminhamento para Leticia

Não foi chamado. `applyResolvedHandoff` só executa com `target` preenchido; portanto
`apply_expedicao_handoff` não rodou, Leticia não foi selecionada e não houve erro registrado.
O destino financeiro continua determinístico — ele simplesmente nunca foi acionado.

## 5. Estado real da conversa (Brena kezia, `1928c6f8-…c984`)

| Campo | Valor |
| --- | --- |
| status | `nina` |
| ai_paused | `false` |
| human_takeover_required | `false` |
| requires_dermoconsultant | `false` |
| handoff_type / handoff_reason | `null` / `null` |
| assigned_user_id / assigned_at | `null` / `null` |
| attendance_finished | `false` |
| human_status | `null` |
| last_message_at | 09/09 12:38 UTC |

## 6. Grants e eventos

Zero registros em `conversation_access_grants` e `conversation_handoff_events` para esta
conversa, em qualquer horário.

## 7. Por que o handoff não aconteceu

A matriz logística cobre o vocabulário "pedido/encomenda/compra" no singular, mas não a forma
como a cliente escreveu: sujeito "produtos" no plural com verbo "chegaram", além de outras
formas comuns ("cadê meu pedido", "está demorando", "estou esperando", "quando chegam").
Sem motivo detectado, nada mais no fluxo executa.

## 8. Por que a Nina falou "equipe de expedição"

A expressão não está fixa em nenhum texto do projeto — foi o modelo parafraseando as instruções.
A palavra "expedição" aparece repetidamente nas instruções que alimentam a Nina:
`TRACKING_HANDOFF_PROMPT` em `supabase/functions/_shared/handoff.ts`, o prompt gerado em
`supabase/functions/brain-build/index.ts`, `skills/nina/SKILL.md` e
`skills/nina/prompts/conversa.md`.

## Mudança mínima proposta (não executada)

1. **Ampliar `where_is_my_order`** em `supabase/functions/_shared/handoff.ts` para reconhecer:
   - sujeito plural e "produtos/itens/encomenda/compra/mercadoria" além de "pedido";
   - "ainda não chegou/chegaram/recebi/recebemos", "não chegou até agora";
   - "cadê/onde está meu pedido", "estou esperando meu pedido", "está demorando/atrasando",
     "quando chega / quando chegam / quando vou receber".
   Proteção contra falso positivo: exige referência a pedido/produto/entrega junto do sintoma
   de não recebimento — perguntas comerciais ("quais produtos vocês têm?", "esse produto é
   bom?", "quanto custa o produto?") continuam sem handoff.
2. **Determinismo já existente preservado**: detectado o motivo logístico, o encaminhamento
   para Leticia acontece independentemente da frase escrita ao cliente.
3. **Linguagem**: trocar "expedição" por "Leticia / setor responsável pelo seu pedido" nos
   textos voltados ao cliente em `TRACKING_HANDOFF_PROMPT`, `brain-build`, `skills/nina/SKILL.md`
   e `skills/nina/prompts/conversa.md`, mantendo os nomes técnicos dos motivos canônicos
   inalterados.
4. **Testes** em `src/__tests__/handoff-classification-matrix.test.ts`: a frase real da Brena e
   as variações acima → `where_is_my_order` / `financeiro`; negativos comerciais → `null`;
   precedência logística sobre dermatológico inalterada.

## Arquivos que precisariam mudar

- `supabase/functions/_shared/handoff.ts` (matriz logística + texto do prompt)
- `supabase/functions/brain-build/index.ts` (texto)
- `skills/nina/SKILL.md`, `skills/nina/prompts/conversa.md` (texto)
- `src/__tests__/handoff-classification-matrix.test.ts` (testes)

Depois: suíte completa + typecheck e publicação apenas de `nina-reply` e `nina-orchestrator`.

## Fora do escopo

Dermoconsultoras, rodízio, regra reduzida da Talia, prioridade da Laura, reabertura, RLS,
Shopify, WhatsApp sender, chat-media e histórico permanecem intocados. A conversa da Brena não
é atribuída e nenhuma mensagem é enviada.
