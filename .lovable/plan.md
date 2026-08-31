# Auditoria: João Felipe — Nina ativa com "Responsável: Leticia" residual

Somente leitura foi feita. Nada foi alterado, nenhuma mensagem enviada, nenhum handoff aplicado.

## Estado real atual do João Felipe (verificado no banco)

Conversa `a7b8eddb…f5a1`, contato "Joao Felipe":

- `ai_paused = false`, `status = nina`, `human_takeover_required = false`
- `handoff_type = NULL`, `handoff_reason = NULL`, `attendance_finished = false`
- `human_status = devolvido_para_nina`, `nina_reactivated_at = 31/08 20:06`
- `assigned_user_id = 2222…0004` (Leticia — **residual, não foi limpo**)
- `handoff_created_at = 27/08 19:31` (resíduo do backfill)
- Concessão em `conversation_access_grants`: **inativa**, revogada em 31/08 20:06 com motivo `human_takeover_cleared` (revogação automática do gatilho ao reativar a Nina)
- Eventos: `nina_reactivated` (31/08 20:06) após `handoff_financeiro / where_is_my_order` (27/08, backfill)
- Mensagens: 19:49 cliente "Meu pedido foi enviado?" (sem resposta — Nina ainda pausada); 20:06 cliente "Oi"; 20:06 Nina "Seu pedido já foi encaminhado…"

## Causa raiz exata

O fluxo "Reativar Nina" (`src/services/api.ts`, `reactivateNina`) limpa `ai_paused`, `human_takeover_required`, `handoff_type`, `handoff_reason` e `status`, **mas não limpa `assigned_user_id`, `assigned_at`, `handoff_created_at` nem `trigger_message_id`**. Ao mesmo tempo, o gatilho `revoke_grants_on_conversation_change` revoga a concessão de acesso. Resultado: um estado meio-limpo — sem concessão (Leticia não vê) e com responsável humano residual (o painel mostra "Responsável: Leticia").

## Por que Leticia aparece como responsável mas não enxerga a conversa

- O painel admin deriva "Responsável" de `assigned_user_id`, que continuou apontando para ela.
- A lista real dela vem da RPC `list_my_expedicao_conversations`, que exige simultaneamente: papel `expedicao` + **concessão ativa** + `conversations.assigned_user_id = team_member da concessão` + motivo na allowlist. A concessão foi revogada → a conversa some da conta dela. Mesma condição vale em `expedicao_can_access_conversation` (leitura de mensagens e resposta).

## Por que a Nina respondeu "já foi encaminhado"

Não foi decisão de roteamento: nenhum campo residual influencia o texto. A última mensagem do cliente foi apenas "Oi" — não casa com `LOGISTICS_REASON_MATRIX` e não é "continuação curta" reconhecida, então `resolveHandoffDecision` corretamente não aplicou handoff. O texto veio do **histórico da conversa** enviado ao modelo: as respostas anteriores dizem "já foi encaminhado", e o modelo repetiu isso. Ou seja, é alucinação de contexto, não estado de banco. Observação relevante: a mensagem "Meu pedido foi enviado?" (19:49) ficou sem resposta porque a Nina ainda estava pausada; não houve nova classificação logística depois disso.

## Arquivos e funções envolvidos

- `src/services/api.ts` → `reactivateNina`, `takeoverConversation`
- Gatilho `revoke_grants_on_conversation_change` (revoga a concessão)
- RPCs `list_my_expedicao_conversations`, `expedicao_can_access_conversation`, `apply_expedicao_handoff`
- `supabase/functions/_shared/handoff.ts` (`LOGISTICS_REASON_MATRIX`, `resolveHandoffDecision`), `supabase/functions/nina-reply/index.ts`
- UI do responsável: `src/components/ChatInterface.tsx`

## Mudança mínima necessária

1. Em `reactivateNina`, na mesma atualização, também zerar `assigned_user_id`, `assigned_at`, `handoff_created_at` e `trigger_message_id` (além do que já limpa). Assim "Nina ativa" passa a significar sempre "sem responsável humano".
2. Nada mais muda: gatilho, RPCs, classificação logística, dermoconsultoras, Shopify, sender, rastreio e backfills ficam intactos.

Opcional (só se você quiser): na tela do admin, não exibir "Responsável" quando a Nina estiver ativa — é redundante depois do item 1.

## Como normalizar o João com segurança

Uma única atualização nessa conversa, sem enviar mensagem e sem criar handoff: limpar `assigned_user_id`, `assigned_at`, `handoff_created_at` e `trigger_message_id`, mantendo `ai_paused = false` e `status = nina`. A concessão já está revogada; nada a fazer nela. `conversation_handoff_events` e demais auditorias permanecem intactas. Registro opcional de um evento de auditoria `state_normalized`.

## Como garantir que o próximo handoff logístico funcione

Com o estado limpo, uma mensagem como "Paguei frete de 4 dias. Quando meu pedido chega?" casa em `order_financial_question` (padrões `frete`, `quando … chega`), destino `financeiro` → `apply_expedicao_handoff` → Nina pausada, Leticia atribuída, concessão ativa, conversa visível para ela. Validação sugerida após a correção: repetir o teste com **conversa sintética**, conferindo os campos e a lista real da Leticia — sem tocar em conversas reais.

## Riscos

- Baixos. Limpar `assigned_user_id` na reativação altera o que o painel mostra em conversas devolvidas à Nina (passa a "sem responsável"), o que é o comportamento correto.
- Não afeta conversas em atendimento humano ativo (essas não passam por reativação).
- Não reintroduz acesso da Leticia a nada: acesso continua dependendo exclusivamente de concessão ativa.
- Persiste (fora do escopo desta correção) a possibilidade de a Nina repetir "já foi encaminhado" com base no histórico; se quiser, tratamos isso depois em uma etapa separada de prompt.
