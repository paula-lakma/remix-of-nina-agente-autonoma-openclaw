# Reabertura automática: eliminar responsável humano residual

Auditoria somente leitura. Nada foi alterado, nenhuma mensagem enviada, nenhum handoff criado.

## 1. Causa raiz exata

A rotina de reabertura automática limpa o estado de finalização e devolve a conversa à Nina, mas **não limpa a atribuição humana**: `assigned_user_id`, `assigned_at` e `handoff_created_at` permanecem com os valores do atendimento anterior. Como o painel deriva "Responsável" de `assigned_user_id`, a conversa aparece como Nina ativa com Responsável = Leticia.

## 2. Função responsável pela reabertura automática

Gatilho `trg_reopen_finished_conversation` na tabela `messages` (AFTER INSERT) → função `public.reopen_finished_conversation_on_message()`.

Ela roda quando `from_type = 'user'` e a conversa está com `attendance_finished = true`, e hoje limpa exatamente:

- `attendance_finished = false`
- `attendance_finished_at = NULL`
- `attendance_finished_by = NULL`
- `ai_paused = false`
- `human_takeover_required = false`
- `requires_dermoconsultant = false`
- `handoff_type = NULL`
- `handoff_reason = NULL`
- `human_status = NULL`
- `status = 'nina'`

E registra o evento `reopened_by_message / new_incoming_message`.

**Não toca em:** `assigned_user_id`, `assigned_at`, `handoff_created_at`.

## 3. Diferença entre reabertura automática e o botão manual

O botão manual ("Reativar Nina", `reactivateNina` em `src/services/api.ts`) já foi corrigido e limpa também `assigned_user_id`, `assigned_at` e `handoff_created_at`, além dos campos de finalização. A função do gatilho ficou defasada em relação a ele. É a única divergência entre os dois caminhos.

## 4. Campos residuais confirmados (João Felipe, leitura de hoje)

Conversa `a7b8eddb…f5a1` após a reabertura automática das 12:43:

- `status = nina`, `ai_paused = false`, `human_takeover_required = false` — corretos
- `attendance_finished = false`, `attendance_finished_at`/`by = NULL` — corretos
- `handoff_type = NULL`, `handoff_reason = NULL`, `human_status = NULL` — corretos
- `assigned_user_id = 2222…0004` (Leticia) — **residual**
- `assigned_at = 01/09 12:35` — **residual**
- `handoff_created_at = 01/09 12:35` — **residual**
- `conversation_access_grants`: nenhuma concessão ativa; a última foi revogada em 12:39 com motivo `attendance_finished` — correto
- `conversation_handoff_events`: histórico completo preservado, incluindo `reopened_by_message` às 12:43 — correto

## 5. Mudança mínima necessária

Uma única migração que substitui o corpo de `public.reopen_finished_conversation_on_message()` acrescentando três campos ao mesmo `UPDATE` já existente:

- `assigned_user_id = NULL`
- `assigned_at = NULL`
- `handoff_created_at = NULL`

Nada mais muda: mesma condição `WHERE attendance_finished = true`, mesmo evento de auditoria, mesmo gatilho, mesma tabela.

## 6. Vale igualmente para Leticia e dermoconsultoras

Sim. O gatilho é único e está na tabela `messages`, sem qualquer distinção de destino do handoff anterior. A correção passa a valer de forma idêntica após atendimento da expedição/financeiro e após atendimento de dermoconsultora. As concessões humanas anteriores já são revogadas em ambos os casos pelo gatilho `revoke_grants_on_conversation_change`.

## 7. Preservação do histórico

- `conversation_handoff_events` não é tocado — nenhum evento é apagado ou reescrito; o evento `reopened_by_message` continua sendo inserido.
- `conversation_access_grants` mantém as concessões antigas como registro inativo (com `reason`, `trigger_message_id`, `revoked_at` e `revoke_reason`).
- Mensagens, filas e mídias intactas.
- Só os campos de **estado atual** da conversa são zerados — que é exatamente a regra de negócio pedida.

## 8. Riscos

- Baixos e limitados ao instante da reabertura automática. A partir da correção, uma conversa reaberta pelo cliente passa a aparecer como "sem responsável" no painel — comportamento correto e já idêntico ao do botão manual.
- Não afeta atendimentos humanos ativos: o `UPDATE` só roda quando `attendance_finished = true`.
- Não reabre acesso a ninguém: visibilidade continua dependendo exclusivamente de concessão ativa.
- Se a nova mensagem exigir handoff, o fluxo normal (`apply_expedicao_handoff` ou `applyHandoff` das dermoconsultoras) cria um handoff novo e limpo logo em seguida.

## 9. Plano de implementação e teste mínimo

1. Migração única com `CREATE OR REPLACE FUNCTION public.reopen_finished_conversation_on_message()` incluindo os três campos adicionais. Sem recriar o gatilho.
2. Teste em **conversa sintética**, não em conversa real: finalizar atendimento → inserir mensagem de cliente → conferir que todos os campos ficam no estado alvo (`status = nina`, `ai_paused = false`, `human_takeover_required = false`, `attendance_finished = false` e datas nulas, `assigned_user_id`/`assigned_at`/`handoff_created_at` nulos, sem concessão ativa) e que o evento `reopened_by_message` foi gravado.
3. Repetir o mesmo teste com um atendimento anterior de dermoconsultora, confirmando resultado idêntico.
4. Conferir que nenhuma linha de `conversation_handoff_events` anterior foi alterada e que nada entrou em `send_queue`.

Fora do escopo: João Felipe não será normalizado nesta etapa; `apply_expedicao_handoff`, `applyHandoff`, classificação logística, balanceamento, regras da Laura, WhatsApp, Shopify, contas, permissões e filas permanecem intactos.
