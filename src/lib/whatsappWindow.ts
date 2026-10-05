// Janela de 24 h na tela. Reaproveita a regra canônica de _shared (mesma do banco).
// A tela só AVISA; o servidor continua decidindo.
import { computeWhatsAppWindow, type WhatsAppWindow, type WindowMessage } from '../../supabase/functions/_shared/whatsappWindow';

export { computeWhatsAppWindow };
export type { WhatsAppWindow, WindowMessage };

export const WINDOW_CLOSED_TITLE = 'Janela de 24 horas encerrada';
export const WINDOW_CLOSED_BODY =
  'Para retomar o atendimento, é necessário enviar um modelo aprovado ou aguardar uma nova mensagem do cliente.';

/** Erro do servidor/banco indicando janela fechada (qualquer formato). */
export function isWindowClosedError(e: unknown): boolean {
  if (!e) return false;
  const anyE = e as { message?: unknown; error?: unknown };
  return anyE.message === 'whatsapp_window_closed' || anyE.error === 'whatsapp_window_closed';
}

/**
 * Recusa do servidor registrada pela tela: vale enquanto a última mensagem do
 * cliente for a mesma de quando o servidor recusou. Uma nova mensagem libera.
 */
export interface ServerRefusal { conversationId: string; lastCustomerAt: string | null }

export interface ComposerWindow extends WhatsAppWindow { canSendFreeform: boolean }

export function resolveComposerWindow(
  conversationId: string | null | undefined,
  messages: WindowMessage[],
  now: Date,
  refusal: ServerRefusal | null,
): ComposerWindow {
  const w = computeWhatsAppWindow(messages, now);
  const refused = !!refusal && refusal.conversationId === conversationId
    && refusal.lastCustomerAt === w.last_customer_message_at;
  return { ...w, canSendFreeform: w.is_freeform_safe && !refused };
}
