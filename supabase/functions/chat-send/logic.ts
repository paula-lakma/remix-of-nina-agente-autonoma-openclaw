// Regra pura do envio manual do Chat completo (testável fora do Deno).
// Ordem: sessão -> papel -> acesso à conversa -> idempotência -> mensagem
// (trava da janela de 24h no banco) -> fila (servidor) -> aciona o envio.
// Se a fila falhar, a mensagem vira `failed` (nunca fica presa em `processing`).

export interface ChatSendInput { conversationId: string; content: string; requestId: string }

export interface ChatSendDeps {
  userId: string | null;
  isStaff(userId: string): Promise<boolean>;
  /** Lê a conversa com a sessão da pessoa (RLS); null = sem acesso. */
  loadConversation(id: string): Promise<{ id: string; contact_id: string } | null>;
  findByRequestId(conversationId: string, requestId: string): Promise<{ id: string; status: string; queued: boolean } | null>;
  /** Grava a mensagem com a sessão da pessoa; o banco aplica a janela de 24h. */
  insertMessage(row: Record<string, unknown>): Promise<{ id?: string; error?: { code?: string; message?: string; details?: string } }>;
  insertQueue(row: Record<string, unknown>): Promise<{ error?: { message?: string } }>;
  markFailed(messageId: string, reason: string, requestId: string): Promise<void>;
  triggerSender(): Promise<void>;
}

export type ChatSendResult = { status: number; body: Record<string, unknown> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CHAT_SEND_MESSAGES: Record<string, string> = {
  unauthorized: "Sua sessão expirou. Entre novamente para enviar.",
  forbidden: "Você não tem permissão para responder esta conversa.",
  invalid_request: "Pedido de envio inválido. Recarregue a página e tente de novo.",
  empty_content: "Escreva uma mensagem antes de enviar.",
  content_too_long: "Mensagem longa demais (máximo 4000 caracteres).",
  conversation_not_found: "Conversa não encontrada ou sem acesso.",
  whatsapp_window_closed: "Janela de 24 horas encerrada. Para retomar o atendimento, é necessário enviar um modelo aprovado.",
  message_failed: "Não foi possível registrar a mensagem. Tente novamente.",
  queue_failed: "A mensagem não entrou na fila de envio e foi marcada como falha. Tente novamente.",
};

const fail = (status: number, code: string, extra: Record<string, unknown> = {}): ChatSendResult =>
  ({ status, body: { ok: false, error: code, message: CHAT_SEND_MESSAGES[code] ?? "Erro ao enviar.", ...extra } });

export async function handleChatSend(deps: ChatSendDeps, input: Partial<ChatSendInput>): Promise<ChatSendResult> {
  if (!deps.userId) return fail(401, "unauthorized");
  if (!(await deps.isStaff(deps.userId))) return fail(403, "forbidden");

  const conversationId = String(input.conversationId ?? "");
  const requestId = String(input.requestId ?? "");
  if (!UUID_RE.test(conversationId) || !UUID_RE.test(requestId)) return fail(400, "invalid_request");
  const content = typeof input.content === "string" ? input.content.trim() : "";
  if (!content) return fail(400, "empty_content");
  if (content.length > 4000) return fail(400, "content_too_long");

  const conv = await deps.loadConversation(conversationId);
  if (!conv) return fail(404, "conversation_not_found");

  const existing = await deps.findByRequestId(conversationId, requestId);
  if (existing) {
    if (existing.queued) return { status: 200, body: { ok: true, message_id: existing.id, deduped: true } };
    return fail(409, existing.status === "failed" ? "queue_failed" : "message_failed", { message_id: existing.id, deduped: true });
  }

  const ins = await deps.insertMessage({
    conversation_id: conversationId,
    content,
    type: "text",
    from_type: "human",
    status: "processing",
    sent_at: new Date().toISOString(),
    metadata: { client_request_id: requestId, source: "chat_manual", sent_by_user_id: deps.userId },
  });
  if (ins.error) {
    if (ins.error.code === "23505") {
      // clique duplo simultâneo: a outra chamada já gravou
      const again = await deps.findByRequestId(conversationId, requestId);
      return { status: 200, body: { ok: true, message_id: again?.id ?? null, deduped: true } };
    }
    if (ins.error.message === "whatsapp_window_closed") return fail(409, "whatsapp_window_closed");
    return fail(500, "message_failed");
  }
  const messageId = ins.id!;

  const q = await deps.insertQueue({
    conversation_id: conversationId,
    contact_id: conv.contact_id,
    content,
    from_type: "human",
    message_type: "text",
    priority: 2,
    message_id: messageId,
    metadata: { client_request_id: requestId, source: "chat_manual" },
  });
  if (q.error) {
    await deps.markFailed(messageId, q.error.message === "whatsapp_window_closed" ? "whatsapp_window_closed" : "queue_failed", requestId);
    if (q.error.message === "whatsapp_window_closed") return fail(409, "whatsapp_window_closed", { message_id: messageId });
    return fail(500, "queue_failed", { message_id: messageId });
  }

  try { await deps.triggerSender(); } catch (_e) { /* fila processa depois */ }
  return { status: 200, body: { ok: true, message_id: messageId } };
}
