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

1. **Classificar o pedido explícito** — adicionar à `SENSITIVE_REASON_MATRIX` um motivo `dermoconsultora` (canônico `sensitive_case`) cobrindo: `dermoconsultora / dermo consultora / dermoconsultor`, `especialista`, `falar com uma dermo`, `escolher (um) protocolo`, `protocolo profissional`, `atendimento de uma dermo`. Mantida **abaixo** da matriz logística, preservando a precedência absoluta da expedição.
2. **Ampliar `isConfirmedHandoffResponse`** para aceitar pronome entre verbo e complemento: `vou te encaminhar`, `vou lhe passar`, `vou te deixar com`, `vou te conectar`, `vou chamar a dermoconsultora`. Continua bloqueando perguntas/ofertas ("quer que eu encaminhe?", "posso encaminhar?").
3. **Instruir o marcador estruturado também para dermoconsultora** no bloco de prompt: ao confirmar encaminhamento dermatológico, emitir `[[HANDOFF:sensitive_case]]` (ou o motivo clínico específico). Isso torna o caminho principal determinístico e deixa a regex como rede de segurança.

Nada de novo campo, nada de migração, nada de mudança em `apply_expedicao_handoff`, balanceamento, prioridade da Laura, contas ou RLS.

## 10. A correção vale para todas as dermoconsultoras?

Sim. A mudança é na classificação/confirmação, antes do `pick_dermo_assignee`. O balanceamento least-loaded entre as cinco contas válidas e a prioridade da Laura apenas para casos sensíveis continuam exatamente como estão.

## 11. Plano de implementação e teste

**Arquivos tocados:** somente `supabase/functions/_shared/handoff.ts` (matriz sensível, `isConfirmedHandoffResponse`, texto de `TRACKING_HANDOFF_PROMPT`) e os testes em `src/__tests__/handoff-classification-matrix.test.ts`.

**Testes a adicionar:**
- classificam para dermoconsultora: as cinco frases citadas + a mensagem real do João;
- confirmação textual: "Vou te encaminhar para a nossa dermoconsultora agora." → `true`;
- não confirmação: "Quer que eu te encaminhe para a dermoconsultora?" → `false`;
- precedência preservada: "meu protocolo chegou atrasado" e "quando chega meu pedido?" continuam indo para a Leticia;
- casos clínicos existentes (gestante, alergia, reação, procedimento recente) inalterados.

Rodar a suíte completa (`bunx vitest run`) e o typecheck, depois publicar apenas `nina-reply` e `nina-orchestrator`.

**Validação controlada:** um teste sintético de conversa com "Quero falar com uma dermoconsultora" confirmando pausa da Nina, `requires_dermoconsultant=true`, atribuição a uma das cinco dermoconsultoras pelo balanceamento, concessão ativa e evento `handoff_dermoconsultant`; limpar os dados sintéticos ao final.

## Preservado

João Felipe não é normalizado nem atribuído nesta etapa. Nada muda em Leticia, fluxo logístico, reabertura automática, chat-media, Shopify, WhatsApp sender, contas, permissões, filas, mensagens ou histórico. Nenhuma mensagem é enviada a cliente real.
