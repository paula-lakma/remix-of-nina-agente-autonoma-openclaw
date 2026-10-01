import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  computeOrderFinancials, buildFinancialsApplyPayload, FINANCIALS_PILOT_ALLOWLIST,
} from '../../supabase/functions/_shared/shopify_admin';

const sql = readFileSync('drizzle/migrations/0013_vendas_v2_fase2_inbox_and_apply.sql', 'utf8');
const fn = readFileSync('supabase/functions/shopify-reconcile-pending/index.ts', 'utf8');
const applyFn = sql.slice(sql.indexOf('FUNCTION public.apply_order_financials'));

const m = (a: string) => ({ shopMoney: { amount: a, currencyCode: 'BRL' } });
const page = (nodes: unknown[]) => ({ nodes, pageInfo: { hasNextPage: false, endCursor: null } });
const tx = (id: string, kind: string, status: string, amount: string, at = '2026-08-27T21:04:59Z') =>
  ({ id, kind, status, gateway: 'x', processedAt: at, amountSet: m(amount), parentTransaction: null });
const base = (o: Record<string, unknown>) => ({
  id: 'gid://shopify/Order/7042665873546', name: '#2009', createdAt: 'a', processedAt: 'a', updatedAt: 'a', cancelledAt: null, test: false,
  displayFinancialStatus: 'PAID', totalReceivedSet: m('659.48'), totalRefundedSet: m('0.0'), totalRefundedShippingSet: m('0.0'), netPaymentSet: m('659.48'),
  transactions: [tx('gid://shopify/OrderTransaction/8218403078282', 'SALE', 'SUCCESS', '659.48')], refunds: [], ...o,
});
const refund = (txs: unknown[], lines: unknown[] = [], total = '659.48') => ({
  id: 'gid://shopify/Refund/922826670218', createdAt: '2026-08-28T19:14:30Z', processedAt: '2026-08-28T19:14:30Z', updatedAt: '2026-08-28T19:14:33Z',
  note: '', totalRefundedSet: m(total), refundLineItems: page(lines), refundShippingLines: page([]), transactions: page(txs),
});
const NOW = '2026-10-01T20:00:00Z';
const build = (o: ReturnType<typeof base>) => buildFinancialsApplyPayload(o, computeOrderFinancials(o, true, NOW));

describe('Fase 2 Passo 3 — migration da inbox', () => {
  it('schema, checks, índices e trigger', () => {
    expect(sql).toMatch(/webhook_id text NOT NULL UNIQUE/);
    expect(sql).toMatch(/status IN \('pending','processing','done','failed','skipped'\)/);
    expect(sql).toMatch(/attempts >= 0/);
    expect(sql).toMatch(/\(status, next_attempt_at\)/);
    expect(sql).toMatch(/\(shopify_order_id\)/);
    expect(sql).toMatch(/EXECUTE FUNCTION public\.update_updated_at_column\(\)/);
  });
  it('RLS sem policies e sem acesso para PUBLIC/anon/authenticated', () => {
    expect(sql).toMatch(/shopify_financial_inbox ENABLE ROW LEVEL SECURITY/);
    expect(sql).not.toMatch(/CREATE POLICY/);
    for (const r of ['PUBLIC', 'anon', 'authenticated']) expect(sql).toContain(`REVOKE ALL ON public.shopify_financial_inbox FROM ${r};`);
  });
  it('claim usa SKIP LOCKED com limite e SECURITY DEFINER', () => {
    const c = sql.slice(sql.indexOf('claim_shopify_financial_inbox'), sql.indexOf('apply_order_financials'));
    expect(c).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(c).toMatch(/LEAST\(GREATEST/);
    expect(c).toMatch(/q\.status = 'pending' AND q\.next_attempt_at <= pg_catalog\.now\(\)/);
  });
  it('funções SECURITY DEFINER: search_path fixo, revokes e grant só service_role', () => {
    for (const f of ['claim_shopify_financial_inbox(integer)', 'apply_order_financials(uuid, jsonb, jsonb)']) {
      for (const r of ['PUBLIC', 'anon', 'authenticated']) expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${f} FROM ${r};`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${f} TO service_role;`);
    }
    expect(sql.match(/SECURITY DEFINER/g)).toHaveLength(2);
    expect(sql.match(/SET search_path = pg_catalog, public/g)).toHaveLength(2);
  });
});

describe('apply_order_financials', () => {
  it('upsert idempotente por (source, shopify_refund_id) e snapshot antigo não sobrescreve', () => {
    expect(applyFn).toMatch(/ON CONFLICT \(source, shopify_refund_id\) DO UPDATE/);
    expect(applyFn).toMatch(/::timestamptz < v_existing\.updated_at_source/);
    expect(applyFn).toMatch(/refund pertence a outro pedido/);
    expect(applyFn).toMatch(/webhook_payload, last_verified_at\)[^]*NULL, \(r->>'last_verified_at'\)/);
  });
  it('atômico: erros abortam tudo (RAISE) e orders bloqueado', () => {
    expect(applyFn).toMatch(/FOR UPDATE;\s+IF NOT FOUND THEN RAISE EXCEPTION/);
    expect(applyFn).not.toMatch(/EXCEPTION\s+WHEN/); // sem engolir erro => rollback da transação inteira
  });
  it('atualiza só as 12 colunas financeiras de orders', () => {
    const upd = applyFn.slice(applyFn.indexOf('UPDATE public.orders'), applyFn.indexOf('WHERE o.id = p_order_id;'));
    const cols = [...upd.matchAll(/^\s+(\w+) = /gm)].map((x) => x[1]);
    expect(cols).toEqual(['total_received', 'total_refunded', 'refunded_shipping', 'net_payment', 'paid_at', 'is_paid', 'refund_count',
      'first_refunded_at', 'last_refunded_at', 'refunded_product_amount', 'unallocated_refund_amount', 'financials_verified_at']);
    expect(sql).not.toMatch(/financial_status\s*=\s*\(p_summary|valid_order|net_product_revenue|sync_shopify_order_payload|ecom_/);
  });
});

describe('payload do piloto', () => {
  it('#2009: refund total sem itens => tudo não alocado', () => {
    const p = build(base({ displayFinancialStatus: 'REFUNDED', totalRefundedSet: m('659.48'), netPaymentSet: m('0.0'),
      refunds: [refund([tx('gid://shopify/OrderTransaction/8221004464266', 'REFUND', 'SUCCESS', '659.48', '2026-08-28T19:14:29Z')])] }));
    expect(p.ok).toBe(true);
    expect(p.refunds[0]).toMatchObject({ shopify_refund_id: 'gid://shopify/Refund/922826670218', financial_status: 'success',
      total_amount: '659.48', refunded_product_amount: '0.00', shipping_amount: '0.00', unallocated_amount: '659.48', line_items: [], currency: 'BRL' });
    expect(p.summary).toMatchObject({ total_refunded: '659.48', net_payment: '0.00', is_paid: true, refund_count: 1, unallocated_refund_amount: '659.48' });
  });
  it('pago sem refund', () => {
    const p = build(base({}));
    expect(p.refunds).toEqual([]);
    expect(p.summary).toMatchObject({ total_received: '659.48', total_refunded: '0.00', is_paid: true, refund_count: 0 });
  });
  it('não pago', () => {
    const p = build(base({ totalReceivedSet: m('0.0'), netPaymentSet: m('0.0'), transactions: [tx('t', 'SALE', 'FAILURE', '446.07')] }));
    expect(p.summary).toMatchObject({ is_paid: false, paid_at: null, total_received: '0.00' });
  });
  it('mixed: só SUCCESS, sem atribuir itens', () => {
    const p = build(base({ totalRefundedSet: m('100.00'), refunds: [refund([tx('a', 'REFUND', 'SUCCESS', '100.00'), tx('b', 'REFUND', 'FAILURE', '50.00')],
      [{ id: 'RL', quantity: 1, lineItem: { id: 'L' }, subtotalSet: m('150.00') }], '150.00')] }));
    expect(p.refunds[0]).toMatchObject({ financial_status: 'mixed', refunded_product_amount: '0.00', unallocated_amount: '100.00' });
  });
  it('divergência ou refund sem transações => não grava', () => {
    expect(build(base({ totalRefundedSet: m('1.00') })).ok).toBe(false);
    expect(build(base({ refunds: [refund([], [], '0.00')] })).ok).toBe(false);
  });
  it('allowlist fixa e modo restrito', () => {
    expect(FINANCIALS_PILOT_ALLOWLIST).toEqual({ '7042665873546': '2009', '7114950672522': '2336', '7115282907274': '2337' });
    const block = fn.slice(fn.indexOf('if (body.mode === "financials_pilot")'), fn.indexOf('if (body.mode === "financials_dry_run")'));
    expect(block).toMatch(/fora da allowlist/);
    expect(block.match(/\.rpc\(/g)).toHaveLength(1);
    expect(block).toMatch(/rpc\("apply_order_financials"/);
    expect(block).not.toMatch(/\.(insert|update|upsert|delete)\(|shopify_events|shopify_financial_inbox/);
  });
});
