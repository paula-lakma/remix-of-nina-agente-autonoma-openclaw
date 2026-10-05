// Pure decision for WhatsApp statuses[] — single source of the precedence rule. No I/O.
import { extractWhatsAppFailure, mergeFailureMetadata } from "./failure.ts";

export type NormalStatus = "sent" | "delivered" | "read";
const LEVEL: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

export interface CurrentState {
  status: string;
  delivered_at: string | null;
  read_at: string | null;
  metadata: Record<string, unknown> | null;
}

export interface WhatsAppStatusMeta {
  last_status?: string;
  last_ts?: string;
  failed_ts?: string;
  failed_ignored?: { ts: string | null; received_at: string; reason: string };
  ignored_after_failed?: { status: string; ts: string | null; received_at: string };
}

export interface Decision {
  update: boolean;
  patch: { status?: string; delivered_at?: string; read_at?: string; metadata?: Record<string, unknown> };
  reason: string;
}

/** Meta sends `timestamp` as Unix seconds (string). Returns ISO or null — never invents. */
export function metaTimestampToIso(ts: unknown): string | null {
  const n = typeof ts === "string" && ts.trim() !== "" ? Number(ts) : typeof ts === "number" ? ts : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n * 1000);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Strongest proven delivery level, including historical rows (status=sent + read_at → read). */
export function effectiveLevel(cur: CurrentState): number {
  let lvl = LEVEL[cur.status] ?? 0;
  if (cur.delivered_at) lvl = Math.max(lvl, 2);
  if (cur.read_at) lvl = Math.max(lvl, 3);
  return lvl;
}

const maxIso = (a?: string | null, b?: string | null) => (!a ? b ?? undefined : !b ? a : a > b ? a : b);

// deno-lint-ignore no-explicit-any
export function decideStatusUpdate(cur: CurrentState, incoming: any, receivedAt: string): Decision {
  const meta = (cur.metadata && typeof cur.metadata === "object" ? cur.metadata : {}) as Record<string, unknown>;
  const ws = (meta.whatsapp_status ?? {}) as WhatsAppStatusMeta;
  const ts = metaTimestampToIso(incoming?.timestamp);
  const st = incoming?.status;
  const noop = (reason: string): Decision => ({ update: false, patch: {}, reason });
  const withWs = (next: WhatsAppStatusMeta, base: Record<string, unknown> = meta) => ({ ...base, whatsapp_status: next });

  if (st in LEVEL) {
    const L = LEVEL[st];
    if (cur.status === "failed") {
      if (ts && ws.failed_ts && ts > ws.failed_ts) {
        const patch: Decision["patch"] = { status: st };
        if (L >= 2 && !cur.delivered_at && L === 2) patch.delivered_at = ts;
        if (L === 3 && !cur.read_at) patch.read_at = ts;
        patch.metadata = withWs({ ...ws, last_status: st, last_ts: maxIso(ws.last_ts, ts) });
        return { update: true, patch, reason: "corrects_failed_with_newer_ts" };
      }
      const prev = ws.ignored_after_failed;
      if (prev && prev.status === st && prev.ts === ts) return noop("duplicate_ignored_after_failed");
      return {
        update: true,
        patch: { metadata: withWs({ ...ws, ignored_after_failed: { status: st, ts, received_at: receivedAt } }) },
        reason: "kept_failed_no_safe_evidence",
      };
    }
    if (L <= effectiveLevel(cur)) return noop("not_an_upgrade");
    // Upgrade along sent<delivered<read is always safe, even with an older ts (stronger proof).
    const when = ts ?? receivedAt;
    const patch: Decision["patch"] = { status: st };
    if (L === 2 && !cur.delivered_at) patch.delivered_at = when;
    if (L === 3 && !cur.read_at) patch.read_at = when;
    patch.metadata = withWs({ ...ws, last_status: st, last_ts: maxIso(ws.last_ts, ts) });
    return { update: true, patch, reason: "upgrade" };
  }

  if (st === "failed") {
    const failure = extractWhatsAppFailure(incoming, receivedAt);
    const baseWithFailure = failure ? mergeFailureMetadata(meta, failure) : meta;
    const failureChanged = baseWithFailure.whatsapp_failure !== meta.whatsapp_failure;

    if (effectiveLevel(cur) >= 2) {
      const prev = ws.failed_ignored;
      const sameIgnored = prev && prev.ts === ts;
      if (sameIgnored && !failureChanged) return noop("duplicate_failed_after_delivery");
      return {
        update: true,
        patch: {
          metadata: withWs(
            sameIgnored ? ws : { ...ws, failed_ignored: { ts, received_at: receivedAt, reason: "already_delivered" } },
            baseWithFailure,
          ),
        },
        reason: "failed_ignored_already_delivered",
      };
    }
    if (cur.status === "failed") {
      const needTs = !ws.failed_ts && ts;
      if (!failureChanged && !needTs) return noop("duplicate_failed");
      const nextWs = needTs ? { ...ws, failed_ts: ts!, last_status: "failed", last_ts: maxIso(ws.last_ts, ts) } : ws;
      return { update: true, patch: { metadata: withWs(nextWs, baseWithFailure) }, reason: "failed_enriched" };
    }
    // sent / processing → failed
    const nextWs: WhatsAppStatusMeta = { ...ws, last_status: "failed", last_ts: maxIso(ws.last_ts, ts) };
    if (ts) nextWs.failed_ts = ts;
    return { update: true, patch: { status: "failed", metadata: withWs(nextWs, baseWithFailure) }, reason: "failed" };
  }

  return noop("unknown_status");
}

// ---- Optimistic concurrency (store injected so it is testable) ----
export interface StatusRow extends CurrentState { id: string }
export interface StatusStore {
  read(whatsappMessageId: string): Promise<StatusRow | null>;
  /** Updates only if status/delivered_at/read_at still equal `expected`. Returns true if a row changed. */
  conditionalUpdate(expected: StatusRow, patch: Decision["patch"]): Promise<boolean>;
}

export async function applyStatusWithRetry(
  store: StatusStore,
  // deno-lint-ignore no-explicit-any
  incoming: any,
  now: () => string,
): Promise<{ outcome: "applied" | "noop" | "not_found" | "conflict"; reason: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const row = await store.read(incoming.id);
    if (!row) return { outcome: "not_found", reason: "message_not_found" };
    const d = decideStatusUpdate(row, incoming, now());
    if (!d.update) return { outcome: "noop", reason: d.reason };
    if (await store.conditionalUpdate(row, d.patch)) return { outcome: "applied", reason: d.reason };
  }
  return { outcome: "conflict", reason: "concurrent_update_retry_exhausted" };
}
