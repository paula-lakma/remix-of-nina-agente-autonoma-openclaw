# Auditoria: João Felipe encaminhado à Leticia, mas invisível na conta dela

Somente leitura. Nada foi alterado, nenhuma mensagem enviada, nenhum handoff criado.

## Estado atual real do João (conversa `a7b8eddb…f5a1`)

- `ai_paused = true`, `status = paused`, `human_takeover_required = true`
- `handoff_type = financeiro`, `handoff_reason = order_financial_question`, `handoff_created_at = 31/08 20:26`
- `assigned_user_id = 2222…0004` (Leticia), `assigned_at = 20:26`
- `attendance_finished = true`, `attendance_finished_at = 31/08 20:40`, `attendance_finished_by = conta financeiro@lakma.com.br`
- `human_status = finalizado`
- Concessão de acesso: criada 20:26 e **revogada 20:40** com motivo `attendance_finished`
- Nenhuma mensagem nova do cliente depois das 20:26

## Causa raiz exata

O handoff funcionou. Às 20:26 a Nina classificou "Paguei frete de 4 dias, quando chega meu pedido?" como `order_financial_question`, pausou, atribuiu à Leticia e criou concessão ativa — a conversa apareceu para ela.

Às 20:40, a **própria conta da Leticia** (`financeiro@lakma.com.br`, via `expedicao_chat`, evento `attendance_finished` com `source: expedicao_chat`) finalizou o atendimento. Isso marcou `attendance_finished = true` / `human_status = finalizado` e o gatilho `revoke_grants_on_conversation_change` revogou a concessão com motivo `attendance_finished`. Sem concessão ativa, a RPC `list_my_expedicao_conversations` deixa de retornar a conversa — ela sumiu da conta dela no mesmo instante.

Ou seja: não é falha de roteamento nem de atribuição. É um atendimento finalizado (provavelmente clique acidental em "Finalizar atendimento") que deixou o estado atual em "Finalizado", com responsável residual Leticia visível no painel admin.

## De onde vem cada tag do painel

- **Finalizado** → `attendance_finished = true` (e `human_status = 'finalizado'`)
- **Pausado** → `status = 'paused'`
- **Nina pausada** → `ai_paused = true`

## Por que ele não aparece para a Leticia

`list_my_expedicao_conversations` não filtra `attendance_finished` diretamente; ela exige **concessão ativa** (`conversation_access_grants.is_active`) + `assigned_user_id` igual ao membro da concessão + motivo na allowlist. A finalização revogou a concessão → filtro falha → conversa invisível. O mesmo predicado bloqueia leitura de mensagens e resposta (`expedicao_can_access_conversation`).

## Um novo handoff resolveria?

- **Leticia (expedição/financeiro):** sim. `apply_expedicao_handoff` já zera `attendance_finished`, `attendance_finished_at`, `attendance_finished_by`, define `human_status = 'aguardando_humano'`, reatribui e cria concessão ativa. Nesse caminho, um novo handoff já representa um novo atendimento ativo.
- **Dermoconsultoras:** **não**. `applyHandoff` em `supabase/functions/_shared/handoff.ts` monta o update com `ai_paused`, `human_takeover_required`, `handoff_type/reason/created_at`, `human_status`, `status`, `requires_dermoconsultant` e atribuição — mas **nunca limpa `attendance_finished`**. Uma conversa finalizada que receba novo handoff clínico continua marcada como "Finalizado" no estado atual (a concessão nova é criada, então ela aparece para a dermo, porém com estado e tag incoerentes e sujeita a tratamento de "encerrada" na UI).

Observação: a reabertura automática por nova mensagem do cliente (`reopen_finished_conversation_on_message`) limpa `attendance_finished`, mas devolve a conversa para a Nina — não recria concessão nem atendimento humano.

## Funções/RPCs envolvidas

- `expedicao_finish_conversation` (origem da finalização)
- Gatilho `revoke_grants_on_conversation_change` (revoga a concessão ao finalizar)
- `list_my_expedicao_conversations` / `expedicao_can_access_conversation` (visibilidade)
- `apply_expedicao_handoff` (já correto)
- `applyHandoff` em `supabase/functions/_shared/handoff.ts` (caminho dermo — incompleto)
- `list_my_dermo_conversations` / `dermo_can_access_conversation`

## Mudança mínima necessária

1. **Caminho dermo:** incluir no update de `applyHandoff` a limpeza de `attendance_finished = false`, `attendance_finished_at = NULL`, `attendance_finished_by = NULL`, igualando o comportamento já existente em `apply_expedicao_handoff`. Assim todo handoff válido, de qualquer destino, significa atendimento ativo novo.
2. **João Felipe (normalização pontual, se você quiser):** como não há handoff novo, uma opção é apenas reexecutar o fluxo existente de encaminhamento para a Leticia sobre a mesma conversa (sem enviar mensagem), o que limpa a finalização e recria a concessão ativa. Alternativa mais conservadora: deixar como está e aguardar a próxima mensagem do cliente.

Histórico preservado nos dois casos: `conversation_handoff_events` (incluindo os `attendance_finished` anteriores) e as concessões revogadas permanecem intactos — só o estado atual muda.

## A correção vale para as dermoconsultoras?

Sim — é exatamente onde a falha existe hoje. O caminho da expedição já está correto; a paridade deve ser dada ao caminho dermo (e a qualquer destino futuro que passe por `applyHandoff`).

## Riscos

- Baixos. Limpar a finalização só ocorre no momento de um handoff válido novo, que por definição abre um atendimento.
- Não afeta classificação logística, Shopify, sender, rastreio, filas ou contas.
- Não amplia acesso: visibilidade continua dependendo exclusivamente de concessão ativa.
- Efeito colateral esperado e desejado: conversas antes marcadas como "Finalizado" deixam de exibir essa tag ao receber novo encaminhamento.
