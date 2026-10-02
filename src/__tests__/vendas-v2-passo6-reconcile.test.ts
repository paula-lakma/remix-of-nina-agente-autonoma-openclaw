import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  fixedWindow, listWindow, buildCandidates, shouldSkip, runDryRun, costWaitMs, ThrottledError, MAX_PAGES, MAX_DETAILS,
  type LocalOrder,
} from "../../supabase/functions/_shared/financial_reconcile";

const mig = readFileSync("drizzle/migrations/0015_vendas_v2_financial_reconcile_structure.sql", "utf8");
const fn = readFileSync("supabase/functions/shopify-financials-reconcile/index.ts", "utf8").replace(/\/\*\*[^]*?\*\//, "");
const lib = readFileSync("supabase/functions/_shared/financial_reconcile.ts", "utf8").replace(/^\/\/.*$/gm, "");
const NOW = new Date("2026-10-02T18:00:00.500Z");
const gid = (n: number) => `gid://shopify/Order/${n}`;
const L = (id: string, sid: string, ver: string | null = null): LocalOrder => ({ id, order_number: id, source_order_id: sid, financial_status: "paid", financials_verified_at: ver });

function page(ids: number[], next: string | null, ext: unknown = null) {
  return { data: { orders: { nodes: ids.map((i) => ({ id: gid(i), name: `#${i}`, updatedAt: "2026-10-02T10:00:00Z", displayFinancialStatus: "PAID" })),
    pageInfo: { hasNextPage: !!next, endCursor: next } } }, extensions: ext };
}
const noSleep = { sleep: async () => {} };

describe("migration 0015 – estrutura e segurança", () => {
  it("tabelas com RLS, sem policies, só service_role, sem linhas iniciais", () => {
    for (const t of ["financial_job_runs", "financial_job_state"]) {
      expect(mig).toContain(`CREATE TABLE public.${t}`);
      expect(mig).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
      expect(mig).toContain(`REVOKE ALL ON public.${t} FROM PUBLIC, anon, authenticated`);
      expect(mig).toContain(`GRANT ALL ON public.${t} TO service_role`);
    }
    expect(mig).not.toMatch(/CREATE POLICY/);
    expect(mig).not.toMatch(/INSERT INTO public\.financial_job_runs/);
    expect(mig.match(/INSERT INTO public\.financial_job_state/g)?.length).toBe(1); // só dentro do acquire
    expect(mig).toMatch(/job_name text PRIMARY KEY/);
    for (const c of ["window_start", "window_end", "cursor", "last_completed_window_end", "locked_by", "locked_at", "locked_until"]) expect(mig).toContain(c);
  });
  it("funções SECURITY DEFINER, search_path fixo, só service_role, sem advisory lock nem cron", () => {
    const fns = ["acquire_financial_job_lease", "renew_financial_job_lease", "release_financial_job_lease", "trigger_financials_worker", "trigger_financials_reconcile"];
    expect(mig.match(/SECURITY DEFINER SET search_path = pg_catalog, public/g)?.length).toBe(5);
    for (const f of fns) {
      expect(mig).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${f}\\([^)]*\\) FROM PUBLIC, anon, authenticated`));
      expect(mig).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${f}\\([^)]*\\) TO service_role`));
    }
    expect(mig).not.toMatch(/advisory|cron\.schedule/i);
    expect(mig).toMatch(/WHERE s\.locked_until IS NULL OR s\.locked_until < pg_catalog\.now\(\)/);
    expect(mig).toMatch(/s\.locked_by = p_run_id/);
    expect(mig).toMatch(/get_secret\('PANEL_TOKEN'\)/);
    expect(mig).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
  });
});

describe("janela fixa e paginação", () => {
  it("janela congelada de 72h", () => {
    const w = fixedWindow(NOW);
    expect(w).toEqual({ window_start: "2026-09-29T18:00:00Z", window_end: "2026-10-02T18:00:00Z",
      query: "updated_at:>='2026-09-29T18:00:00Z' AND updated_at:<='2026-10-02T18:00:00Z'" });
  });
  it("segue cursor até o fim", async () => {
    const pages = [page([1, 2], "c1"), page([3], null)];
    const seen: unknown[] = [];
    const r = await listWindow("q", { ...noSleep, gql: async (_q, v) => { seen.push(v.cursor); return pages.shift()!; } });
    expect(r.orders.map((o) => o.source_order_id)).toEqual(["1", "2", "3"]);
    expect(seen).toEqual([null, "c1"]);
    expect(r).toMatchObject({ pages: 2, truncated: false, stop_reason: "complete" });
  });
  it("limite de 20 páginas => truncated com último cursor", async () => {
    let i = 0;
    const r = await listWindow("q", { ...noSleep, gql: async () => page([++i], `c${i}`) });
    expect(MAX_PAGES).toBe(20);
    expect(r).toMatchObject({ pages: 20, truncated: true, last_cursor: "c20", stop_reason: "max_pages" });
  });
  it("cursor repetido e cursor vazio param", async () => {
    const a = [page([1], "c1"), page([2], "c1")];
    expect((await listWindow("q", { ...noSleep, gql: async () => a.shift()! })).error).toBe("cursor_repetido");
    expect((await listWindow("q", { ...noSleep, gql: async () => { const p = page([1], null); p.data.orders.pageInfo = { hasNextPage: true, endCursor: "" } as never; return p; } })).error).toBe("cursor_vazio_com_proxima_pagina");
  });
  it("throttling: espera e repete 1x; 2º throttled encerra limpo", async () => {
    let n = 0;
    const ok = await listWindow("q", { ...noSleep, gql: async () => { if (n++ === 0) throw new ThrottledError(); return page([1], null); } });
    expect(ok).toMatchObject({ throttled: 1, throttle_stop: false, pages: 1 });
    const bad = await listWindow("q", { ...noSleep, gql: async () => { throw new ThrottledError(); } });
    expect(bad).toMatchObject({ throttle_stop: true, stop_reason: "throttled" });
    expect(costWaitMs({ cost: { throttleStatus: { currentlyAvailable: 100, restoreRate: 100 } } })).toBe(2000);
    expect(costWaitMs({ cost: { throttleStatus: { currentlyAvailable: 0, restoreRate: 1 } } })).toBe(10000);
    expect(costWaitMs({ cost: { throttleStatus: { currentlyAvailable: 1000, restoreRate: 100 } } })).toBe(0);
  });
  it("erro GraphQL na listagem encerra sem quebrar", async () => {
    const r = await listWindow("q", { ...noSleep, gql: async () => { throw new Error("graphql_http_503"); } });
    expect(r).toMatchObject({ error: "graphql_http_503", stop_reason: "error" });
  });
});

describe("candidatos e skip", () => {
  const shop = [{ gid: gid(1), source_order_id: "1", name: "#1", updatedAt: "2026-10-02T10:00:00Z", displayFinancialStatus: "PAID" },
    { gid: gid(9), source_order_id: "9", name: "#9", updatedAt: "2026-10-02T10:00:00Z", displayFinancialStatus: "PAID" }];
  it("união sem duplicados, pending/mixed antigo, missing_local", () => {
    const local = new Map([["1", L("a", "1")]]);
    const r = buildCandidates(shop, local, [L("a", "1"), L("old", "5")], [L("a", "1"), L("d", "7")]);
    expect(r.candidates.map((c) => c.local.id).sort()).toEqual(["a", "d", "old"]);
    expect(r.candidates.find((c) => c.local.id === "a")!.sources).toEqual(["AB", "C", "D"]);
    expect(r.missing_local).toEqual(["#9"]);
  });
  it("regra de skip", () => {
    const base = { local: L("a", "1", "2026-10-02T11:00:00Z"), sources: ["AB" as const], shopify_updated_at: "2026-10-02T10:00:00Z", has_pending_mixed: false };
    expect(shouldSkip(base)).toBe(true);
    expect(shouldSkip({ ...base, shopify_updated_at: "2026-10-02T12:00:00Z" })).toBe(false);
    expect(shouldSkip({ ...base, has_pending_mixed: true })).toBe(false);
    expect(shouldSkip({ ...base, sources: ["D"] })).toBe(false);
    expect(shouldSkip({ ...base, local: L("a", "1", null) })).toBe(false);
  });
});

describe("runDryRun – zero escrita e reuso financeiro", () => {
  function deps(n = 3, over: Record<string, unknown> = {}) {
    const fetched: string[] = [];
    const d = {
      ...noSleep, now: () => NOW,
      gql: async () => page(Array.from({ length: n }, (_, i) => i + 1), null),
      loadLocalBySource: async (ids: string[]) => ids.map((s) => L(`l${s}`, s)),
      loadPendingMixed: async () => [], loadUnverifiedRecent: async () => [],
      fetchFinancials: async (sid: string) => { fetched.push(sid); return { found: true, complete: true, order: { refunds: [] }, issues: [], fetched_at: "x" }; },
      compute: () => ({ refunds: [{ status: "success" }], consistency: { valid: true }, displayFinancialStatus: "PAID" }),
      buildPayload: () => ({ ok: true, reason: null, refunds: [], summary: { total_received: "1.00" } }),
      ...over,
    };
    return { d, fetched };
  }
  it("relatório completo, writes=0", async () => {
    const { d } = deps();
    const r = await runDryRun(d);
    expect(r).toMatchObject({ writes: 0, mode: "dry_run", candidates_unique: 3, analyzed: 3, would_apply_count: 3, refunds_by_status: { success: 3 } });
  });
  it("limite de 100 consultas detalhadas", async () => {
    const { d, fetched } = deps(130);
    const r = await runDryRun(d, { maxPages: 1 });
    expect(MAX_DETAILS).toBe(100);
    expect(fetched).toHaveLength(100);
    expect(r.not_analyzed_limit).toBe(30);
  });
  it("divergência => não aplicaria; erro em um pedido não afeta os demais", async () => {
    let i = 0;
    const { d } = deps(3, {
      fetchFinancials: async () => { if (i++ === 0) throw new Error("graphql_http_500"); return { found: true, complete: true, order: {}, issues: [], fetched_at: "x" }; },
      buildPayload: () => ({ ok: false, reason: "inconsistente:divergencia", refunds: [], summary: null }),
    });
    const r = await runDryRun(d);
    expect(r.errors).toHaveLength(1);
    expect(r.divergences).toHaveLength(2);
    expect(r.analyzed).toBe(3);
  });
  it("throttled persistente nos detalhes encerra limpo", async () => {
    const { d } = deps(3, { fetchFinancials: async () => { throw new ThrottledError(); } });
    const r = await runDryRun(d);
    expect(r).toMatchObject({ throttle_stop: true, analyzed: 0, not_analyzed_limit: 3 });
  });
  it("sem dependências de escrita no módulo e na função", () => {
    expect(lib).not.toMatch(/apply_order_financials|\.insert\(|\.update\(|\.upsert\(|\.delete\(|rpc\(/);
    expect(fn).not.toMatch(/apply_order_financials|\.insert\(|\.update\(|\.upsert\(|\.delete\(|_financial_job_lease|financial_job_(runs|state)/);
    expect(fn).toMatch(/fetchOrderFinancials/);
    expect(fn).toMatch(/computeOrderFinancials/);
    expect(fn).toMatch(/buildFinancialsApplyPayload/);
  });
  it("só dry_run; auth por painel/chave interna/admin", () => {
    expect(fn).toMatch(/body\?\.mode !== "dry_run"/);
    expect(fn).toMatch(/validatePanelToken/);
    expect(fn).toMatch(/Somente admin", 403/);
    expect(fn).toMatch(/Não autorizado", 401/);
  });
  it("Vendas V1 não referenciada", () => {
    expect(lib + fn + mig).not.toMatch(/ecom_|valid_order|net_product_revenue|sync_shopify_order_payload/);
  });
});
