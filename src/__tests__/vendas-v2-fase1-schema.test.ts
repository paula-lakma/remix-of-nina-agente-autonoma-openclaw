import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const m1 = readFileSync('drizzle/migrations/0011_vendas_v2_fase1_order_refunds.sql', 'utf8');
const m2 = readFileSync('drizzle/migrations/0012_vendas_v2_fase1_order_refunds_tighten_grants.sql', 'utf8');

describe('Vendas V2 — Fase 1 (somente estrutura)', () => {
  it('sem UPDATE/INSERT/backfill e sem tocar em funções existentes', () => {
    for (const s of [m1, m2]) {
      expect(s).not.toMatch(/\bUPDATE\s+public\.orders\b/i);
      expect(s).not.toMatch(/\bINSERT\s+INTO\b/i);
      expect(s).not.toMatch(/sync_shopify_order_payload|ecom_/);
    }
  });
  it('não cria gross_product_revenue; colunas novas sem default', () => {
    expect(m1).not.toMatch(/gross_product_revenue/);
    const orders = m1.slice(m1.indexOf('ALTER TABLE public.orders'));
    expect(orders).not.toMatch(/DEFAULT/i);
    expect(orders).toMatch(/ADD COLUMN is_paid boolean,/);
    expect(orders).toMatch(/ADD COLUMN net_payment numeric,/); // sem CHECK
  });
  it('checks de não-negatividade e status fechado', () => {
    for (const c of ['total_amount', 'shipping_amount', 'refunded_product_amount', 'unallocated_amount', 'total_received', 'total_refunded', 'refunded_shipping', 'refund_count', 'unallocated_refund_amount']) {
      expect(m1).toMatch(new RegExp(`${c} IS NULL OR ${c} >= 0`));
    }
    expect(m1).toMatch(/financial_status IN \('success','pending','failed','mixed'\)/);
    expect(m1).toMatch(/UNIQUE \(source, shopify_refund_id\)/);
  });
  it('RLS: leitura só admin/manager; sem escrita para usuários; sem anon', () => {
    expect(m1).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(m1).toMatch(/FOR SELECT TO authenticated\s+USING \(public\.is_admin_or_manager\(auth\.uid\(\)\)\)/);
    expect(m1).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/);
    expect(m2).toMatch(/REVOKE ALL ON public\.order_refunds FROM anon/);
    expect(m2).toMatch(/REVOKE INSERT, UPDATE, DELETE/);
  });
});
