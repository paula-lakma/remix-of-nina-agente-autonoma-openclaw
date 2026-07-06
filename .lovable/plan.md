
## O que os dados mostram agora

Você tem razão — Meta e webhook estão OK. A mensagem "Oi" do número final **1113** chegou às **14:25:28** de hoje:

- `message_grouping_queue`: 1 linha nova nas últimas 2h, de `553484161113`, `processed=true`.
- `messages`: mensagem `user` "Oi" inserida, Nina respondeu 26s depois.
- Rede do front: PATCH marcando essa conversa como lida — ou seja, **ela apareceu no /chat normalmente**.

Sobre a conversa que **você finalizou**:
- É a `a7b8eddb-…`, contato `+55 14 99783-5777` (final **5777**, não 1113).
- `attendance_finished = true` desde `2026-06-26 13:49`.
- Última mensagem do cliente nessa conversa: `2026-06-25 23:30`. **Desde a finalização, nenhuma mensagem nova desse número chegou no webhook** (`message_grouping_queue` não tem entrada para 5514997835777 depois de 25/jun).
- Ou seja: no fluxo real "finalizou → cliente responde" ainda **não houve** uma mensagem de teste chegando; o que veio hoje foi de outro contato (1113), que não estava finalizado.

Analisando o código do fluxo finalizar/reabrir, achei **um bug real** que explica a sensação de "não chega no front", mesmo com a mensagem entrando no banco:

### Bug encontrado — UPDATE de conversa não sincroniza `attendanceFinished`

`src/hooks/useConversations.ts` (handler do `UPDATE` em `conversations`, ~linha 321):

```ts
return {
  ...conv,
  status: updated.status,
  isActive: updated.is_active,
  assignedTeam: updated.assigned_team,
};
```

Quando o trigger `trg_reopen_finished_conversation` reabre a conversa (seta `attendance_finished=false`, `status='nina'`, `human_status=null`, etc.), o realtime dispara esse UPDATE — mas o handler **ignora** `attendance_finished`, `attendance_finished_at`, `ai_paused`, `human_status`, `human_takeover_required`, `requires_dermoconsultant`, `handoff_type`, `nina_reactivated_at`, `assigned_user_id`, `assigned_at`, `tags`, `metadata`, etc.

Efeito visível:
- A tag verde **"Finalizado"** continua na lista.
- O banner verde **"Atendimento finalizado…"** continua dentro da conversa.
- O botão "Finalizar" fica desabilitado.
- Parece que "nada aconteceu" quando o cliente responde — a mensagem até é inserida no thread, mas a UI comunica o oposto.

## Plano de correção

### 1. Sincronizar todos os campos relevantes no UPDATE realtime
Em `src/hooks/useConversations.ts`, no `.on('postgres_changes', { event: 'UPDATE', table: 'conversations' })`, substituir o merge parcial por um merge que reflita o estado atual do registro — mesmos campos que `transformDBToUIConversation` produz:

- `status`, `isActive`, `assignedTeam`, `assignedUserId`, `assignedAt`
- `attendanceFinished`, `attendanceFinishedAt`
- `aiPaused`, `humanTakeoverRequired`, `requiresDermoconsultant`
- `handoffType`, `humanStatus`, `handoffCreatedAt`, `handoffReason`
- `tags`, `ninaReactivatedAt`

Isso resolve o cenário "cliente responde → banner some, Nina volta, badge some" sem precisar de refetch.

### 2. Ajuste de defesa no INSERT de mensagem
Ainda em `useConversations.ts`, quando entrar mensagem `from_type='user'` para uma conversa com `attendanceFinished=true` em memória, forçar localmente `attendanceFinished=false, status='nina'` além de anexar a mensagem — assim a UI atualiza **na hora**, mesmo que o UPDATE do postgres_changes chegue com atraso.

### 3. Verificação da conversa 5777 (sem código, você faz o teste)
Como não há evidência do webhook receber mensagem dessa conversa desde 25/jun, peça ao contato para enviar **um "oi" agora** e me avise. Vou checar em segundos:
- `message_grouping_queue` (deve aparecer entrada para `5514997835777`);
- `messages` (nova linha `from_type='user'`);
- `conversations.attendance_finished` (deve virar `false` via trigger);
- Se todos os 3 acontecerem e a UI ainda não atualizar, o problema não é o bug acima e vamos abrir uma segunda frente.

## Arquivos a editar
- `src/hooks/useConversations.ts` — handler de UPDATE em `conversations` + defesa no INSERT de `messages`.

## O que **não** precisa mudar
- Webhook (`whatsapp-webhook`), trigger `trg_reopen_finished_conversation`, botão "Finalizar atendimento", `api.finishAttendance`. Todos verificados e corretos.
