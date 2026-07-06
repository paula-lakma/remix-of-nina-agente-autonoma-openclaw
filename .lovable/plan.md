
## Achei o bug — e é grave

Nos logs do `whatsapp-webhook` a mensagem "oi" do **5514997835777** (final 5777) chegou às **14:31:24** de hoje, mas o insert falhou:

```
ERROR [Webhook] Error creating message:
  code: 42703
  message: column "reason" of relation "conversation_handoff_events" does not exist
```

### Causa raiz
A tabela `public.conversation_handoff_events` tem a coluna **`handoff_reason`**, não `reason`. Dois pontos estão gravando com o nome errado:

1. **Trigger `reopen_finished_conversation_on_message`** (dispara em `AFTER INSERT ON public.messages`) faz:
   ```sql
   INSERT INTO public.conversation_handoff_events
     (conversation_id, event_type, actor_user_id, reason)
   VALUES (..., 'reopened_by_message', NULL, 'new_incoming_message');
   ```
   Como o trigger é `AFTER INSERT` e faz `RAISE`/erro implícito, **a transação inteira da inserção da mensagem é revertida**. Ou seja: quando um cliente responde a uma conversa finalizada, a mensagem **não chega no `messages`**, não chega no realtime, não chega no front, e ainda por cima o webhook responde 200 (o `try/catch` do handler engole o erro por mensagem). Foi exatamente o que aconteceu com o 5777.

2. **`src/services/api.ts` → `finishAttendance`** (linha ~1529) também insere `reason: 'finalizado_por_humano'`. Provavelmente falha silenciosa hoje (o UPDATE anterior já persiste `attendance_finished=true`, então parece que "funcionou").

## Plano de correção

### 1. Migration: corrigir o trigger
Recriar `public.reopen_finished_conversation_on_message()` trocando `reason` por `handoff_reason` — mantendo todo o resto do comportamento (reabre, reativa Nina, insere evento).

```sql
CREATE OR REPLACE FUNCTION public.reopen_finished_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.from_type = 'user' THEN
    UPDATE public.conversations
       SET attendance_finished = false,
           attendance_finished_at = NULL,
           attendance_finished_by = NULL,
           ai_paused = false,
           human_takeover_required = false,
           requires_dermoconsultant = false,
           handoff_type = NULL,
           handoff_reason = NULL,
           human_status = NULL,
           status = 'nina',
           updated_at = now()
     WHERE id = NEW.conversation_id
       AND attendance_finished = true;

    IF FOUND THEN
      INSERT INTO public.conversation_handoff_events
        (conversation_id, event_type, actor_user_id, handoff_reason)
      VALUES (NEW.conversation_id, 'reopened_by_message', NULL, 'new_incoming_message');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
```

### 2. Corrigir `src/services/api.ts` → `finishAttendance`
Trocar `reason` por `handoff_reason` no insert em `conversation_handoff_events`.

### 3. Reprocessar a mensagem "perdida" do 5777
Peço para o cliente reenviar "oi" — com o trigger corrigido a mensagem entra normal, o trigger reabre a conversa, e o realtime mostra tudo no front. (Não vamos forjar a inserção retroativa; o `wamid` original já foi consumido pelo webhook.)

### 4. (Opcional, defensivo) Fila de retentativa no webhook
Como o `try/catch` por mensagem hoje engole erros e devolve 200, mensagens que quebram por qualquer motivo somem. Se quiser posso adicionar um `console.error` mais visível e, futuramente, uma tabela `webhook_dead_letters`. Fora do escopo dessa correção emergencial — só listo para você decidir depois.

## Arquivos alterados
- **Nova migration** — recria `reopen_finished_conversation_on_message()` com `handoff_reason`.
- **`src/services/api.ts`** — `finishAttendance` usa `handoff_reason`.

## Não muda
- Webhook, `useConversations.ts` (já sincronizado no fix anterior), botão "Finalizar", trigger em si (só o corpo da função).
