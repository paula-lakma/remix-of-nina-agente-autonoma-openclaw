// Vendas V2 Fase 2 Passo 4: recebimento de refunds/create (caixa de entrada) e processamento (worker).
// Nunca registra segredos. Nada aqui toca shopify-webhook, rastreio, WhatsApp ou Vendas V1.
import { losslessParse } from "./shopify_admin.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

export const REFUNDS_TOPIC = "refunds/create";
export const MAX_ATTEMPTS = 5;
/** Espera após a falha N (N = tentativas já feitas): 1ª +5 min, 2ª +15, 3ª +30, 4ª +60; 5ª => failed. */
export const BACKOFF_MINUTES = [5, 15, 30, 60] as const;

/** HMAC-SHA256 (base64) do corpo bruto, comparação em tempo constante. Fail-closed. */
export async function verifyShopifyHmac(secret: string, rawBody: string, provided: string | null): Promise<boolean> {
  if (!secret || !provided) return false;
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
    if (expected.length !== provided.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}

export async function signShopifyHmac(secret: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

const BIG = "__lakma_bigint__:";
/** Troca os marcadores de inteiros longos por texto com os dígitos exatos. */
export function unmarkBigInts(v: Any): Any {
  if (typeof v === "string") return v.startsWith(BIG) ? v.slice(BIG.length) : v;
  if (Array.isArray(v)) return v.map(unmarkBigInts);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unmarkBigInts(x)]));
  return v;
}

/** ID como texto: inteiros exatos (≤15 dígitos são exatos em double; maiores já vêm como texto). */
function idText(v: Any): string | null {
  if (typeof v === "string") return /^\d{1,30}$/.test(v) ? v : null;
  if (typeof v === "number" && Number.isSafeInteger(v) && v > 0) return String(v);
  return null;
}

export interface ParsedRefundWebhook { ok: boolean; reason: string | null; orderId: string | null; refundId: string | null; payload: Any }

export function parseRefundWebhook(rawBody: string): ParsedRefundWebhook {
  let body: Any;
  try { body = unmarkBigInts(losslessParse(rawBody)); } catch { return { ok: false, reason: "json_invalido", orderId: null, refundId: null, payload: null }; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, reason: "json_invalido", orderId: null, refundId: null, payload: null };
  const orderId = idText(body.order_id);
  const refundId = idText(body.id);
  if (!orderId) return { ok: false, reason: "order_id_ausente", orderId: null, refundId, payload: body };
  return { ok: true, reason: null, orderId, refundId, payload: body };
}

export function nextAttemptAt(attemptsDone: number, now: Date): string | null {
  if (attemptsDone >= MAX_ATTEMPTS) return null;
  const mins = BACKOFF_MINUTES[Math.max(0, Math.min(attemptsDone, BACKOFF_MINUTES.length) - 1)];
  return new Date(now.getTime() + mins * 60_000).toISOString();
}

export interface WorkerDeps {
  findOrder(sourceOrderId: string): Promise<{ id: string } | null>;
  fetchFinancials(sourceOrderId: string): Promise<{ found: boolean; complete: boolean; order: Any; issues: string[]; fetched_at: string }>;
  compute(order: Any, complete: boolean, fetchedAt: string): Any;
  buildPayload(order: Any, computed: Any): { ok: boolean; reason: string | null; refunds: Any[]; summary: Any };
  apply(orderId: string, refunds: Any[], summary: Any): Promise<{ error: string | null }>;
  mark(id: string, patch: Record<string, Any>): Promise<void>;
  now(): Date;
}

export type ItemOutcome = "done" | "skipped" | "retry" | "failed";

/**
 * Processa 1 item já reivindicado (attempts já incrementado pelo claim).
 * Grava só via apply (atômico). Qualquer falha antes do apply => nada gravado no financeiro.
 */
export async function processInboxItem(item: Any, deps: WorkerDeps): Promise<{ outcome: ItemOutcome; reason: string | null }> {
  const fail = async (reason: string): Promise<{ outcome: ItemOutcome; reason: string }> => {
    const next = nextAttemptAt(Number(item.attempts) || 0, deps.now());
    if (!next) { await deps.mark(item.id, { status: "failed", last_error: reason }); return { outcome: "failed", reason }; }
    await deps.mark(item.id, { status: "pending", next_attempt_at: next, last_error: reason });
    return { outcome: "retry", reason };
  };
  try {
    const sid = String(item.shopify_order_id || "");
    if (!/^\d{1,30}$/.test(sid)) {
      await deps.mark(item.id, { status: "skipped", last_error: "shopify_order_id inválido" });
      return { outcome: "skipped", reason: "shopify_order_id inválido" };
    }
    const ord = await deps.findOrder(sid);
    if (!ord) {
      await deps.mark(item.id, { status: "skipped", last_error: "pedido local inexistente; nenhum pedido criado" });
      return { outcome: "skipped", reason: "pedido local inexistente" };
    }
    const f = await deps.fetchFinancials(sid);
    if (!f.found) return await fail("pedido não retornado pela Shopify");
    if (!f.complete) return await fail(`consulta incompleta:${f.issues.join(",")}`);
    const computed = deps.compute(f.order, f.complete, f.fetched_at);
    const payload = deps.buildPayload(f.order, computed);
    if (!payload.ok) return await fail(`inconsistente:${payload.reason}`);
    const { error } = await deps.apply(ord.id, payload.refunds, payload.summary);
    if (error) return await fail(`apply:${error}`);
    await deps.mark(item.id, { status: "done", last_error: null });
    return { outcome: "done", reason: null };
  } catch (e) {
    return await fail(`erro:${(e as Error).message}`.slice(0, 500));
  }
}
