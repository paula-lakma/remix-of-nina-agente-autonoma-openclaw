import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("drizzle/migrations/0014_vendas_v2_inbox_stale_recovery.sql", "utf8");

describe("Vendas V2 – recuperação de processing stale na inbox", () => {
  it("recupera stale (<5 tentativas) para pending sem incrementar attempts", () => {
    const block = sql.split("-- 2)")[0];
    expect(block).toMatch(/SET status = 'pending', claimed_at = NULL, next_attempt_at = pg_catalog\.now\(\)/);
    expect(block).toMatch(/claimed_at < pg_catalog\.now\(\) - interval '15 minutes'/);
    expect(block).toMatch(/q\.attempts < 5/);
    expect(block).not.toMatch(/attempts = i\.attempts \+ 1/);
  });
  it("stale com >=5 tentativas vira failed", () => {
    const block = sql.split("-- 2)")[1].split("-- 3)")[0];
    expect(block).toMatch(/SET status = 'failed', claimed_at = NULL/);
    expect(block).toMatch(/q\.attempts >= 5/);
  });
  it("todas as seleções usam FOR UPDATE SKIP LOCKED", () => {
    expect(sql.match(/FOR UPDATE SKIP LOCKED/g)?.length).toBe(3);
  });
  it("mantém segurança: SECURITY DEFINER, search_path fixo, só service_role", () => {
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = pg_catalog, public/);
    for (const r of ["PUBLIC", "anon", "authenticated"]) {
      expect(sql).toContain(`claim_shopify_financial_inbox(integer) FROM ${r};`);
    }
    expect(sql).toContain("claim_shopify_financial_inbox(integer) TO service_role;");
  });
  it("não toca outras tabelas/funções", () => {
    expect(sql).not.toMatch(/order_refunds|apply_order_financials|public\.orders\b/);
  });
});
