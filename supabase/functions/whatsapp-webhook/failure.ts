// Pure helpers for WhatsApp status "failed" — no I/O.
// Keeps only technical error fields Meta sends in statuses[].errors[]
// (code, title, message, error_data.details, href). Never personal data.

export interface WhatsAppFailure {
  code?: number | string;
  title?: string;
  message?: string;
  details?: string;
  href?: string;
  received_at: string;
}

// deno-lint-ignore no-explicit-any
export function extractWhatsAppFailure(status: any, receivedAt: string): WhatsAppFailure | null {
  if (!status || status.status !== 'failed') return null;
  const err = Array.isArray(status.errors) ? status.errors[0] : null;
  if (!err || typeof err !== 'object') return null;
  const out: WhatsAppFailure = { received_at: receivedAt };
  if (typeof err.code === 'number' || typeof err.code === 'string') out.code = err.code;
  if (typeof err.title === 'string') out.title = err.title;
  if (typeof err.message === 'string') out.message = err.message;
  const details = err.error_data?.details;
  if (typeof details === 'string') out.details = details;
  if (typeof err.href === 'string') out.href = err.href;
  // Only received_at → nothing real to save.
  return Object.keys(out).length > 1 ? out : null;
}

// Merge only the whatsapp_failure key; keep everything else.
// Same error arriving again (duplicate webhook) keeps the original received_at.
export function mergeFailureMetadata(
  existing: Record<string, unknown> | null | undefined,
  failure: WhatsAppFailure,
): Record<string, unknown> {
  const base = existing && typeof existing === 'object' ? existing : {};
  const prev = base.whatsapp_failure as WhatsAppFailure | undefined;
  if (prev) {
    // Enrich: keep known fields, add/refresh fields the new event brings; keep first received_at.
    const { received_at: _b, ...n } = failure;
    const combined = { ...prev, ...n, received_at: prev.received_at } as WhatsAppFailure;
    if (JSON.stringify(combined) === JSON.stringify(prev)) return { ...base };
    return { ...base, whatsapp_failure: combined };
  }
  return { ...base, whatsapp_failure: failure };
}
