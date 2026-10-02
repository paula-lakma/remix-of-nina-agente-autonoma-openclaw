// Vendas V2 Passo 6: reconciliação financeira (Etapa A = somente dry_run).
// Lógica pura com dependências injetadas. Este módulo NÃO recebe nenhuma dependência de escrita.
import { SHOPIFY_API_VERSION, losslessParse, type FetchFn } from "./shopify_admin.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

export const RECONCILE_JOB = "financials_reconcile";
export const WINDOW_HOURS = 72;
export const PAGE_SIZE = 50;
export const MAX_PAGES = 20;
export const MAX_DETAILS = 100;
export const MIN_AVAILABLE_COST = 300;
export const MAX_THROTTLE_WAIT_MS = 10_000;

export const ORDERS_WINDOW_QUERY = `query ReconcileWindow($q: String!, $cursor: String) {
  orders(first: ${PAGE_SIZE}, after: $cursor, query: $q, sortKey: UPDATED_AT) {
    nodes { id name updatedAt displayFinancialStatus }
    pageInfo { hasNextPage endCursor }
  }
}`;

const isoSec = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

/** Janela congelada no início da execução: [fim - 72h, fim]. */
export function fixedWindow(now: Date, hours = WINDOW_HOURS): { window_start: string; window_end: string; query: string } {
  const end = new Date(Math.floor(now.getTime() / 1000) * 1000);
  const start = new Date(end.getTime() - hours * 3600_000);
  const window_start = isoSec(start), window_end = isoSec(end);
  return { window_start, window_end, query: `updated_at:>='${window_start}' AND updated_at:<='${window_end}'` };
}

export class ThrottledError extends Error { constructor() { super("THROTTLED"); } }

/** POST GraphQL com parse lossless; devolve data + extensions. THROTTLED => ThrottledError. */
export async function gqlWithCost(shop: string, token: string, query: string, variables: Any, fetchFn: FetchFn = fetch): Promise<{ data: Any; extensions: Any }> {
  const res = await fetchFn(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  if (res.status === 429) throw new ThrottledError();
  if (!res.ok) throw new Error(`graphql_http_${res.status}`);
  const json: Any = losslessParse(text);
  if (json.errors?.length) {
    const codes = json.errors.map((e: Any) => e?.extensions?.code || e?.message);
    if (codes.includes("THROTTLED")) throw new ThrottledError();
    throw new Error(`graphql_errors:${codes.join(",")}`);
  }
  return { data: json.data, extensions: json.extensions ?? null };
}

/** Espera recomendada pelo saldo de custo (0 se saldo suficiente). Máx 10 s. */
export function costWaitMs(extensions: Any): number {
  const t = extensions?.cost?.throttleStatus;
  const avail = Number(t?.currentlyAvailable), rate = Number(t?.restoreRate);
  if (!Number.isFinite(avail) || avail >= MIN_AVAILABLE_COST) return 0;
  if (!Number.isFinite(rate) || rate <= 0) return MAX_THROTTLE_WAIT_MS;
  return Math.min(MAX_THROTTLE_WAIT_MS, Math.ceil(((MIN_AVAILABLE_COST - avail) / rate) * 1000));
}

export interface ListDeps {
  gql(query: string, variables: Any): Promise<{ data: Any; extensions: Any }>;
  sleep(ms: number): Promise<void>;
}

export interface ListResult {
  orders: { gid: string; source_order_id: string; name: string; updatedAt: string; displayFinancialStatus: string }[];
  pages: number; truncated: boolean; last_cursor: string | null; throttled: number; throttle_stop: boolean;
  error: string | null; stop_reason: string | null;
}

/** Lista a janela com paginação protegida. Nunca grava cursor. */
export async function listWindow(query: string, deps: ListDeps, maxPages = MAX_PAGES): Promise<ListResult> {
  const out: ListResult = { orders: [], pages: 0, truncated: false, last_cursor: null, throttled: 0, throttle_stop: false, error: null, stop_reason: null };
  const seen = new Set<string>();
  let cursor: string | null = null;
  while (true) {
    if (out.pages >= maxPages) { out.truncated = true; out.stop_reason = "max_pages"; break; }
    let r: { data: Any; extensions: Any };
    try {
      r = await callWithThrottleRetry(() => deps.gql(ORDERS_WINDOW_QUERY, { q: query, cursor }), deps, out);
    } catch (e) {
      if (e instanceof ThrottledError) { out.throttle_stop = true; out.stop_reason = "throttled"; out.truncated = true; break; }
      out.error = (e as Error).message; out.stop_reason = "error"; break;
    }
    out.pages++;
    const conn = r.data?.orders;
    if (!conn || !Array.isArray(conn.nodes)) { out.error = "resposta_sem_orders"; out.stop_reason = "error"; break; }
    for (const n of conn.nodes) {
      const gid = String(n.id);
      const m = /^gid:\/\/shopify\/Order\/(\d+)$/.exec(gid);
      if (!m) continue;
      out.orders.push({ gid, source_order_id: m[1], name: n.name, updatedAt: n.updatedAt, displayFinancialStatus: n.displayFinancialStatus });
    }
    const pi = conn.pageInfo;
    if (!pi?.hasNextPage) { out.stop_reason = "complete"; break; }
    const next = pi.endCursor ? String(pi.endCursor) : "";
    if (!next) { out.error = "cursor_vazio_com_proxima_pagina"; out.stop_reason = "error"; out.truncated = true; break; }
    if (seen.has(next) || next === cursor) { out.error = "cursor_repetido"; out.stop_reason = "error"; out.truncated = true; break; }
    seen.add(next);
    cursor = next;
    out.last_cursor = next;
    const w = costWaitMs(r.extensions);
    if (w > 0) await deps.sleep(w);
  }
  return out;
}

/** Uma tentativa extra após THROTTLED (espera máx 10 s). Segundo THROTTLED => propaga. */
export async function callWithThrottleRetry<T>(fn: () => Promise<T>, deps: { sleep(ms: number): Promise<void> }, stats: { throttled: number }): Promise<T> {
  try { return await fn(); } catch (e) {
    if (!(e instanceof ThrottledError) && !/THROTTLED/.test((e as Error).message)) throw e;
    stats.throttled++;
    await deps.sleep(MAX_THROTTLE_WAIT_MS);
    try { return await fn(); } catch (e2) {
      if (e2 instanceof ThrottledError || /THROTTLED/.test((e2 as Error).message)) { stats.throttled++; throw new ThrottledError(); }
      throw e2;
    }
  }
}

export interface LocalOrder { id: string; order_number: string | null; source_order_id: string; financial_status: string | null; financials_verified_at: string | null }

export interface Candidate {
  local: LocalOrder; sources: ("AB" | "C" | "D")[]; shopify_updated_at: string | null; has_pending_mixed: boolean;
}

/** União sem duplicados (chave = id local). */
export function buildCandidates(
  shopifyOrders: ListResult["orders"], localBySource: Map<string, LocalOrder>, pendingMixed: LocalOrder[], unverifiedRecent: LocalOrder[],
): { candidates: Candidate[]; missing_local: string[]; ab: number; c: number; d: number } {
  const map = new Map<string, Candidate>();
  const pmIds = new Set(pendingMixed.map((o) => o.id));
  const add = (o: LocalOrder, src: "AB" | "C" | "D", upd: string | null) => {
    const cur = map.get(o.id);
    if (cur) { if (!cur.sources.includes(src)) cur.sources.push(src); if (upd && !cur.shopify_updated_at) cur.shopify_updated_at = upd; return; }
    map.set(o.id, { local: o, sources: [src], shopify_updated_at: upd, has_pending_mixed: pmIds.has(o.id) });
  };
  const missing: string[] = [];
  let ab = 0;
  const seenShop = new Set<string>();
  for (const s of shopifyOrders) {
    if (seenShop.has(s.source_order_id)) continue;
    seenShop.add(s.source_order_id);
    const l = localBySource.get(s.source_order_id);
    if (!l) { missing.push(s.name || s.source_order_id); continue; }
    ab++; add(l, "AB", s.updatedAt);
  }
  for (const o of pendingMixed) add(o, "C", null);
  for (const o of unverifiedRecent) add(o, "D", null);
  return { candidates: [...map.values()], missing_local: missing, ab, c: pendingMixed.length, d: unverifiedRecent.length };
}

/** Pula SOMENTE se: verificado >= updatedAt da Shopify, sem refund pending/mixed e não veio só por D. */
export function shouldSkip(c: Candidate): boolean {
  if (c.has_pending_mixed) return false;
  if (c.sources.length === 1 && c.sources[0] === "D") return false;
  if (!c.shopify_updated_at || !c.local.financials_verified_at) return false;
  return new Date(c.local.financials_verified_at).getTime() >= new Date(c.shopify_updated_at).getTime();
}

export interface DryRunDeps extends ListDeps {
  now(): Date;
  loadLocalBySource(ids: string[]): Promise<LocalOrder[]>;
  loadPendingMixed(): Promise<LocalOrder[]>;
  loadUnverifiedRecent(sinceIso: string): Promise<LocalOrder[]>;
  fetchFinancials(sourceOrderId: string): Promise<{ found: boolean; complete: boolean; order: Any; issues: string[]; fetched_at: string }>;
  compute(order: Any, complete: boolean, fetchedAt: string): Any;
  buildPayload(order: Any, computed: Any): { ok: boolean; reason: string | null; refunds: Any[]; summary: Any };
}

/** Dry-run: só leitura. Retorna relatório; não há dependência de escrita disponível. */
export async function runDryRun(deps: DryRunDeps, opts: { maxPages?: number; maxDetails?: number } = {}): Promise<Any> {
  const started = deps.now();
  const win = fixedWindow(started);
  const list = await listWindow(win.query, deps, opts.maxPages ?? MAX_PAGES);
  const errors: string[] = list.error ? [`listagem:${list.error}`] : [];

  const ids = [...new Set(list.orders.map((o) => o.source_order_id))];
  const local = ids.length ? await deps.loadLocalBySource(ids) : [];
  const localBySource = new Map(local.map((o) => [String(o.source_order_id), o]));
  const pm = await deps.loadPendingMixed();
  const unv = await deps.loadUnverifiedRecent(win.window_start);
  const cand = buildCandidates(list.orders, localBySource, pm, unv);

  const toAnalyze = cand.candidates.filter((c) => !shouldSkip(c));
  const skipped = cand.candidates.length - toAnalyze.length;
  const maxDetails = opts.maxDetails ?? MAX_DETAILS;
  const refundStatus: Record<string, number> = { success: 0, pending: 0, mixed: 0, failed: 0, no_transactions: 0 };
  const divergences: Any[] = [];
  const results: Any[] = [];
  const stats = { throttled: list.throttled };
  let analyzed = 0, throttleStop = list.throttle_stop;

  for (const c of toAnalyze) {
    if (analyzed >= maxDetails || throttleStop) break;
    analyzed++;
    const base = { order_number: c.local.order_number, source_order_id: c.local.source_order_id, sources: c.sources };
    try {
      const f = await callWithThrottleRetry(() => deps.fetchFinancials(c.local.source_order_id), deps, stats);
      if (!f.found) { results.push({ ...base, outcome: "nao_retornado_pela_shopify" }); continue; }
      const computed = deps.compute(f.order, f.complete, f.fetched_at);
      for (const r of computed.refunds || []) refundStatus[r.status] = (refundStatus[r.status] ?? 0) + 1;
      const p = deps.buildPayload(f.order, computed);
      if (!p.ok) {
        divergences.push({ ...base, reason: p.reason, issues: computed?.consistency?.issues ?? f.issues });
        results.push({ ...base, outcome: "nao_aplicaria", reason: p.reason });
        continue;
      }
      results.push({ ...base, outcome: "aplicaria", display_financial_status: computed.displayFinancialStatus,
        would_apply: { summary: p.summary, refunds: p.refunds.map((r: Any) => ({ id: r.shopify_refund_id, status: r.financial_status, total: r.total_amount,
          product: r.refunded_product_amount, shipping: r.shipping_amount, unallocated: r.unallocated_amount })) } });
    } catch (e) {
      if (e instanceof ThrottledError) { throttleStop = true; analyzed--; break; }
      errors.push(`${c.local.order_number ?? c.local.source_order_id}:${(e as Error).message}`.slice(0, 300));
      results.push({ ...base, outcome: "erro" });
    }
  }

  return {
    ok: true, mode: "dry_run", writes: 0, api_version: SHOPIFY_API_VERSION,
    window_start: win.window_start, window_end: win.window_end,
    pages: list.pages, truncated: list.truncated, last_cursor: list.last_cursor, list_stop_reason: list.stop_reason,
    shopify_orders: list.orders.length, local_matches: cand.ab, missing_local: cand.missing_local.length, missing_local_names: cand.missing_local.slice(0, 50),
    candidates_ab: cand.ab, candidates_c: cand.c, candidates_d: cand.d, candidates_unique: cand.candidates.length,
    skipped, analyzed, not_analyzed_limit: toAnalyze.length - analyzed,
    refunds_by_status: refundStatus, divergences, errors, throttled: stats.throttled, throttle_stop: throttleStop,
    would_apply_count: results.filter((r) => r.outcome === "aplicaria").length,
    results, duration_ms: deps.now().getTime() - started.getTime(),
  };
}
