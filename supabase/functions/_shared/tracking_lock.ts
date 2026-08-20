/**
 * FASE 2B1 — PREPARAÇÃO (código inerte).
 *
 * Este módulo NÃO é importado por nenhuma função implantada.
 * Ele existe para revisão da Fase 2B2 e para os testes isolados de lógica.
 *
 * Regra do interruptor:
 *   SHOPIFY_SHARED_TRACKING_LOCK_ENABLED === "true"  -> integração ligada
 *   ausente / "false" / qualquer outro valor         -> DESLIGADA (fluxo legado)
 *
 * A checagem do interruptor SEMPRE acontece antes de qualquer chamada à nova trava.
 */

// deno-lint-ignore no-explicit-any
type Any = any;

export const SHOPIFY_LOCK_FLAG = "SHOPIFY_SHARED_TRACKING_LOCK_ENABLED";

/** Interruptor exclusivo da integração Shopify (não reutiliza MANUAL_TRACKING_SEND_ENABLED). */
export function sharedTrackingLockEnabled(
  env: (k: string) => string | undefined = (k) =>
    (globalThis as Any).Deno?.env?.get?.(k),
): boolean {
  return (env(SHOPIFY_LOCK_FLAG) ?? "") === "true";
}

/**
 * Chave canônica compartilhada entre origens (Shopify e envio manual).
 * Mesmo pedido + mesmo rastreio => mesma chave => uma única mensagem.
 */
export function buildTrackingKey(
  orderNumber: string | null | undefined,
  trackingNumber: string | null | undefined,
): string {
  const order = String(orderNumber ?? "").trim().replace(/^#/, "").toUpperCase() || "-";
  const tracking = String(trackingNumber ?? "").trim().toUpperCase();
  return `${order}::${tracking}`;
}

export interface AcquireInput {
  fulfillmentId: string;
  trackingNumber: string;
  orderNumber: string | null;
  phoneNumber: string | null;
  customerName: string | null;
  carrier: string | null;
  templateName: string | null;
  eventId: string | null;
}

export interface AcquireResult {
  acquired: boolean;
  reason?: "legacy_duplicate" | "shared_duplicate" | "error";
  tracking_key?: string;
  notification_id?: string;
  lock_id?: string;
  legacy_retried?: boolean;
  detail?: string;
}

/**
 * Aquisição coordenada das DUAS deduplicações em uma única transação (RPC).
 * A RPC `acquire_shopify_tracking_locks` (ver docs/fase-2b2/) é atômica:
 * se qualquer um dos dois lados bloquear, nada fica preso em `processing`.
 */
export async function acquireCoordinatedLock(
  supabase: Any,
  input: AcquireInput,
): Promise<AcquireResult> {
  const trackingKey = buildTrackingKey(input.orderNumber, input.trackingNumber);
  const { data, error } = await supabase.rpc("acquire_shopify_tracking_locks", {
    p_tracking_key: trackingKey,
    p_fulfillment_id: input.fulfillmentId,
    p_tracking_number: input.trackingNumber,
    p_order_number: input.orderNumber,
    p_phone_number: input.phoneNumber,
    p_customer_name: input.customerName,
    p_carrier: input.carrier,
    p_template_name: input.templateName,
    p_event_id: input.eventId,
  });
  if (error) return { acquired: false, reason: "error", detail: error.message, tracking_key: trackingKey };
  return { ...(data as AcquireResult), tracking_key: trackingKey };
}

export type ReleaseResult = "queued" | "sent" | "failed";

/**
 * Liberação/compensação coordenada.
 *  - "queued": fila aceitou o item (grava send_queue_id nos dois lados)
 *  - "sent":   Meta/WhatsApp aceitou de fato
 *  - "failed": falha real -> nova tentativa fica permitida
 */
export async function releaseCoordinatedLock(
  supabase: Any,
  args: {
    trackingKey: string;
    fulfillmentId: string;
    trackingNumber: string;
    result: ReleaseResult;
    sendQueueId?: string | null;
    errorMessage?: string | null;
  },
): Promise<{ released: boolean; detail?: string }> {
  const { data, error } = await supabase.rpc("release_shopify_tracking_locks", {
    p_tracking_key: args.trackingKey,
    p_fulfillment_id: args.fulfillmentId,
    p_tracking_number: args.trackingNumber,
    p_result: args.result,
    p_send_queue_id: args.sendQueueId ?? null,
    p_error_message: args.errorMessage ?? null,
  });
  if (error) return { released: false, detail: error.message };
  return data as { released: boolean };
}

/* ------------------------------------------------------------------ *
 * Máquina de estados (pura) — usada nos testes isolados desta fase.
 * ------------------------------------------------------------------ */

export type LockStatus = "none" | "processing" | "queued" | "sent" | "failed";

/** Um status pode ser reivindicado? sent/processing/queued bloqueiam; failed e inexistente liberam. */
export function canClaim(status: LockStatus, staleProcessing = false): boolean {
  if (status === "none" || status === "failed") return true;
  if (status === "processing" && staleProcessing) return true; // expiração de 30 min
  return false;
}

/** Transições válidas do ciclo assíncrono. */
export function nextStatus(current: LockStatus, event: "acquire" | "queued" | "sent" | "failed"): LockStatus {
  switch (event) {
    case "acquire":
      return canClaim(current) ? "processing" : current;
    case "queued":
      return current === "processing" ? "queued" : current;
    case "sent":
      return current === "processing" || current === "queued" ? "sent" : current;
    case "failed":
      return current === "sent" ? "sent" : "failed";
  }
}
