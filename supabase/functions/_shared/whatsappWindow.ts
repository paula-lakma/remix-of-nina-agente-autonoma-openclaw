// Canonical WhatsApp customer-service window (pure). Mirrors SQL public.whatsapp_freeform_window.
// Real Meta window = last customer message + 24h. NEW human free text is only allowed until +23h55m.

export const WINDOW_MS = 24 * 60 * 60_000;
export const FREEFORM_SAFE_MS = WINDOW_MS - 5 * 60_000;

export interface WindowMessage { from_type: string; sent_at: string | null }
export interface WhatsAppWindow {
  last_customer_message_at: string | null;
  window_open_until: string | null;
  freeform_safe_until: string | null;
  is_window_open: boolean;
  is_freeform_safe: boolean;
}

export function computeWhatsAppWindow(messages: WindowMessage[], now: Date = new Date()): WhatsAppWindow {
  let last: number | null = null;
  for (const m of messages) {
    if (m.from_type !== "user" || !m.sent_at) continue; // only real inbound customer messages count
    const t = Date.parse(m.sent_at);
    if (Number.isFinite(t) && (last === null || t > last)) last = t;
  }
  if (last === null) {
    return { last_customer_message_at: null, window_open_until: null, freeform_safe_until: null, is_window_open: false, is_freeform_safe: false };
  }
  const n = now.getTime();
  return {
    last_customer_message_at: new Date(last).toISOString(),
    window_open_until: new Date(last + WINDOW_MS).toISOString(),
    freeform_safe_until: new Date(last + FREEFORM_SAFE_MS).toISOString(),
    is_window_open: n < last + WINDOW_MS,
    is_freeform_safe: n < last + FREEFORM_SAFE_MS,
  };
}

/** Maps the DB error raised by the guard into a stable 409 payload, or null if unrelated. */
// deno-lint-ignore no-explicit-any
export function windowClosedPayload(error: any): Record<string, unknown> | null {
  if (!error || error.message !== "whatsapp_window_closed") return null;
  let details: Record<string, unknown> = {};
  try { details = error.details ? JSON.parse(error.details) : {}; } catch { /* ignore */ }
  return {
    error: "whatsapp_window_closed",
    message: "Janela de 24 horas encerrada. Para retomar o atendimento, é necessário enviar um modelo aprovado.",
    last_customer_message_at: details.last_customer_message_at ?? null,
    window_open_until: details.window_open_until ?? null,
  };
}
