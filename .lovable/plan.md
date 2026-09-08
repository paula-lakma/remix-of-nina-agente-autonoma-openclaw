# Pedido explícito de dermoconsultora não gera handoff — diagnóstico e correção mínima

## 1. Causa raiz exata

Nenhum mecanismo reconhece o **pedido explícito de falar com uma dermoconsultora/especialista**:

- `SENSITIVE_REASON_MATRIX` (`supabase/functions/_shared/handoff.ts`) só cobre sintomas e situações clínicas (gestante, alergia, reação, pele sensibilizada, contraindicação, medicamento, procedimento recente, adaptação de protocolo, dúvida técnica, protocolo não aprovado, link não localizado). Não há padrão para "quero falar com uma dermoconsultora", "especialista", "dermo", "escolher um protocolo".
- O alias `dermoconsultora -> sensitive_case` existe em `REASON_ALIASES`, mas só é aplicado a motivo **estruturado** (`handoff_reason` ou `[[HANDOFF:...]]`), nunca ao texto do cliente.
- O bloco de prompt `TRACKING_HANDOFF_PROMPT` só instrui o marcador `[[HANDOFF:<motivo>]]` para a lista logística/financeira. Para dermoconsultora não há instrução equivalente, então o modelo escreveu a frase de encaminhamento sem emitir marcador.
- Mesmo que a classificação existisse, o fallback dermatológico exige `isConfirmedHandoffResponse(...)`. A frase real "**Vou te encaminhar** para a nossa dermoconsultora" **não casa** com a expressão atual, que só aceita `vou encaminhar` colado (sem o pronome "te"). Verificado por execução direta da regex: resultado `false`.

Ou seja: existem **duas** falhas empilhadas — falta de classificação da intenção explícita e confirmação textual restrita demais.

## 2. Classificação produzida para a mensagem do João

`detectHandoffTarget("Quero falar com uma dermoconsultora para me ajudar a escolher um protocolo profissional.")` → **null** (nenhuma das três matrizes casa).

## 3. Decisão real de handoff

`resolveHandoffDecision` retornou `target: null`, `source: "customer_intent"`. Sem motivo estruturado, sem marcador, sem match de texto.

## 4. `applyHandoff` foi chamado?

Não. `nina-reply` só chama `applyResolvedHandoff` quando `handoffDecision.target` existe.

## 5. O balanceamento executou?

Não. `pick_dermo_assignee` / `pick_next_dermoconsultora` nunca foram acionados — o fluxo parou antes. Nenhuma dermoconsultora foi escolhida e nenhuma operação falhou depois da escolha.

## 6. Estado real no banco (conversa `a7b8eddb-…a5a1`, Joao Felipe)

| Campo | Valor |
| --- | --- |
| status | `nina` |
| ai_paused | `false` |
| human_takeover_required | `false` |
| requires_dermoconsultant | `false` |
| handoff_type / handoff_reason | `null` / `null` |
| assigned_user_id | `null` |
| attendance_finished | `false` |
| human_status | `null` |

`conversation_access_grants`: nenhuma concessão ativa (as últimas são de 01/09, financeiras, já inativas).
`conversation_handoff_events`: nenhum evento em 08/09; o último é `reopened_by_message` de 02/09.

Mensagens confirmam: cliente 12:34:43, resposta da Nina 12:35:21, e a conversa atualizada 12:35:21 sem qualquer mudança de estado.

## 7. Ponto exato onde o fluxo parou

`resolveHandoffDecision` em `supabase/functions/nina-reply/index.ts` (chamada por volta da linha 152) — `target = null`, então o bloco `if (handoffDecision.target)` foi ignorado. Nada de balanceamento, atribuição, concessão ou evento.

## 8. Por que a Nina respondeu como se tivesse encaminhado

A frase foi gerada apenas pelo modelo. O texto do agente é escrito **antes** de qualquer confirmação de handoff, e nada no backend valida se o encaminhamento prometido realmente ocorreu. Isso vale para todas as frases citadas ("quero falar com uma especialista", "preciso de ajuda de uma dermo", "quero ajuda para escolher um protocolo", "quero atendimento de uma dermoconsultora") — nenhuma delas casa hoje com a matriz, então todas reproduzem a mesma falha.

## 9. Mudança mínima necessária

**Novo motivo canônico `dermoconsultora_request`** — pedido explícito de atendimento humano por dermoconsultora. Não é caso sensível, não reutiliza `sensitive_case`, não cria tabela, campo nem novo `handoff_type` (continua `dermoconsultora` / destino `dermoconsultant`).

1. `supabase/functions/_shared/handoff.ts`
   - `REASON_DESTINATIONS`: adicionar `dermoconsultora_request: "dermoconsultant"`.
   - `REASON_ALIASES`: reapontar o alias legado `dermoconsultora` para `dermoconsultora_request` (hoje aponta para `sensitive_case`).
   - `SENSITIVE_REASON_MATRIX`: nova entrada `dermoconsultora_request`, colocada **por último** na matriz. O padrão exige **dois componentes simultâneos**:
     1. **Intenção de contato humano**: `falar com`, `atendimento de`, `me passa/passar para`, `me transfere`, `quero que ... me ajude`, `preciso de ajuda de`, `conversar com`, `chamar`, `atender`.
     2. **Alvo dermatológico/estético**: `dermoconsultora`, `dermo consultora`, `dermo`, `especialista em estética`, `especialista da pele`, `especialista em protocolo`, `alguém da equipe de dermoconsultoras`.
     Termos genéricos como `alguém da equipe`, `atendente humano` ou `especialista` isolados **não** disparam `dermoconsultora_request`. A palavra "protocolo" **não** participa do padrão sozinha.
   - `isConfirmedHandoffResponse`: aceitar pronome entre verbo e complemento — `vou te encaminhar`, `vou te passar`, `vou te conectar`, `vou te deixar com`, `vou lhe passar`, `vou chamar a dermoconsultora`. Continua rejeitando perguntas/ofertas ("quer que eu encaminhe?", "posso te encaminhar?").
   - Bloco de prompt: instruir o marcador estruturado `[[HANDOFF:dermoconsultora_request]]` **apenas** quando o cliente pedir explicitamente uma pessoa/dermoconsultora, e reforçar que dúvida sobre protocolo, indicação ou explicação continua sendo respondida pela Nina com a base de conhecimento.

2. **Uma migração mínima**: incluir `dermoconsultora_request` em `public.is_dermo_handoff_reason` (allowlist de concessão de acesso). `public.is_sensitive_dermo_reason` **não** é alterada — por isso `pick_dermo_assignee` cai automaticamente no ramo `balanced` (least-loaded) e a Laura não recebe prioridade nesses pedidos.

Nada muda em `pick_next_dermoconsultora`, `applyHandoff`, `apply_expedicao_handoff`, precedência logística, contas, permissões ou RLS.

## 10. A correção vale para todas as dermoconsultoras?

Sim. A distribuição continua sendo `pick_dermo_assignee` → `pick_next_dermoconsultora` (least-loaded) entre as cinco contas válidas. A prioridade da Laura permanece restrita à lista clínica atual.

## 11. Plano de implementação e teste

**Arquivos tocados:** `supabase/functions/_shared/handoff.ts`, uma migração de uma linha em `is_dermo_handoff_reason`, e `src/__tests__/handoff-classification-matrix.test.ts`.

**Testes a adicionar:**
- encaminham com `dermoconsultora_request` / destino `dermoconsultant`: "quero falar com uma dermoconsultora", "quero falar com uma especialista", "preciso falar com uma dermo", "quero atendimento de uma dermoconsultora", "pode me passar para uma dermo?", "preciso falar com alguém da equipe de dermoconsultoras", "quero que uma dermoconsultora me ajude a escolher um protocolo" e a mensagem real do João;
- **não** encaminham (retornam `null`): "qual protocolo profissional você indica?", "quero escolher um protocolo", "me explique o protocolo de acne", "qual protocolo usar para manchas?", "me indique um protocolo";
- `dermoconsultora_request` **não** é motivo sensível (sem prioridade da Laura) e **não** está na allowlist da expedição;
- confirmação textual: "Vou te encaminhar para a nossa dermoconsultora agora." → `true`; "Quer que eu te encaminhe para a dermoconsultora?" → `false`;
- precedência preservada: "meu protocolo chegou atrasado" e "quando chega meu pedido?" continuam com a Leticia;
- casos clínicos (gestante, alergia, reação, procedimento recente) inalterados e ainda sensíveis.

Rodar `bunx vitest run` e o typecheck; publicar apenas `nina-reply` e `nina-orchestrator`.

**Validação controlada:** conversa sintética com "Quero falar com uma dermoconsultora" confirmando pausa da Nina, `requires_dermoconsultant=true`, motivo `dermoconsultora_request`, atribuição via balanceamento (modo `balanced`), concessão ativa e evento `handoff_dermoconsultant`; dados sintéticos removidos ao final.

## Confirmações explícitas

1. Pedido comum de dermoconsultora entra no **balanceamento normal** (`mode: balanced`).
2. A Laura **não** ganha prioridade nesses pedidos.
3. Somente os casos clínicos sensíveis já listados mantêm a prioridade da Laura.
4. Pedir informação sobre protocolo, sem solicitar uma pessoa, **continua sendo atendido pela Nina**.
5. A mensagem real do João Felipe passa a gerar handoff para uma dermoconsultora pelo balanceamento normal.

## Preservado

João Felipe não é normalizado nem atribuído nesta etapa. Nada muda em Leticia, fluxo logístico, reabertura automática, chat-media, Shopify, WhatsApp sender, contas, permissões, filas, mensagens ou histórico. Nenhuma mensagem é enviada a cliente real.
