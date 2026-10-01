import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  FINANCIALS_QUERY, FINANCIALS_PAGE_QUERIES, fetchOrderFinancials, computeOrderFinancials, refundStatus, toCents,
} from '../../supabase/functions/_shared/shopify_admin';

const m = (a: string) => ({ shopMoney: { amount: a, currencyCode: 'BRL' } });
const page = (nodes: unknown[], next = false) => ({ nodes, pageInfo: { hasNextPage: next, endCursor: next ? 'c1' : null } });
const tx = (id: string, kind: string, status: string, amount: string, at = '2026-09-01T10:00:00Z', parent: string | null = null) =>
  ({ id, kind, status, gateway: 'pix', processedAt: at, amountSet: m(amount), parentTransaction: parent ? { id: parent } : null });
const refund = (id: string, total: string, txs: unknown[], lines: unknown[] = [], ships: unknown[] = [], at = '2026-09-02T10:00:00Z') => ({
  id, createdAt: at, processedAt: at, updatedAt: at, note: null, totalRefundedSet: m(total),
  refundLineItems: page(lines), refundShippingLines: page(ships), transactions: page(txs),
});
const order = (o: Record<string, unknown> = {}) => ({
  id: 'gid://shopify/Order/6982499336330123', name: '#1', createdAt: '2026-09-01T09:00:00Z', processedAt: '2026-09-01T09:00:00Z',
  updatedAt: 'x', cancelledAt: null, test: false, displayFinancialStatus: 'PAID',
  totalReceivedSet: m('100.00'), totalRefundedSet: m('0.00'), totalRefundedShippingSet: m('0.00'), netPaymentSet: m('100.00'),
  transactions: [tx('gid://shopify/OrderTransaction/1', 'SALE', 'SUCCESS', '100.00')], refunds: [], ...o,
});
const line = (v: string) => ({ id: 'gid://shopify/RefundLineItem/1', quantity: 1, lineItem: { id: 'L' }, subtotalSet: m(v) });
const ship = (v: string) => ({ id: 'gid://shopify/RefundShippingLine/1', subtotalAmountSet: m(v) });
const resp = (t: string) => new Response(t, { status: 200 });
const NOW = '2026-10-01T00:00:00Z';

describe('Vendas V2 — consulta financeira (somente leitura)', () => {
  it('query válida: sem mutation, Order.transactions/refunds sem first, connections paginadas no Refund', () => {
    expect(FINANCIALS_QUERY).not.toMatch(/mutation/);
    expect(FINANCIALS_QUERY).toMatch(/\n    transactions \{ id kind/);
    expect(FINANCIALS_QUERY).toMatch(/\n    refunds \{/);
    for (const f of ['processedAt', 'test', 'totalReceivedSet', 'totalRefundedShippingSet', 'netPaymentSet', 'displayFinancialStatus'])
      expect(FINANCIALS_QUERY).toContain(f);
    expect(FINANCIALS_QUERY).toMatch(/refundLineItems\(first: 50\)[^]*pageInfo/);
    expect(Object.keys(FINANCIALS_PAGE_QUERIES)).toEqual(['refundLineItems', 'refundShippingLines', 'transactions']);
    Object.values(FINANCIALS_PAGE_QUERIES).forEach((q) => expect(q).toMatch(/after: \$c/));
  });

  it('IDs longos preservados como texto', async () => {
    const raw = JSON.stringify({ data: { order: order() } }).replace('"gid://shopify/Order/6982499336330123"', '"gid://shopify/Order/6982499336330123"');
    const f = await fetchOrderFinancials('s.myshopify.com', 't', 'g', async () => resp(raw));
    expect(f.order.id).toBe('gid://shopify/Order/6982499336330123');
  });

  it('status dos refunds', () => {
    expect(refundStatus([{ status: 'SUCCESS' }])).toBe('success');
    expect(refundStatus([{ status: 'PENDING' }])).toBe('pending');
    expect(refundStatus([{ status: 'FAILURE' }, { status: 'ERROR' }])).toBe('failed');
    expect(refundStatus([{ status: 'SUCCESS' }, { status: 'FAILURE' }])).toBe('mixed');
    expect(refundStatus([])).toBe('no_transactions');
  });

  it('refund SUCCESS total com itens e frete; paid_at e is_paid', () => {
    const o = order({ displayFinancialStatus: 'REFUNDED', totalRefundedSet: m('100.00'), netPaymentSet: m('0.00'), totalRefundedShippingSet: m('10.00'),
      refunds: [refund('R1', '100.00', [tx('T2', 'REFUND', 'SUCCESS', '100.00')], [line('90.00')], [ship('10.00')])] });
    const r = computeOrderFinancials(o, true, NOW);
    expect(r.summary).toMatchObject({ total_received: '100.00', total_refunded: '100.00', refunded_product_amount: '90.00', refunded_shipping: '10.00',
      unallocated_refund_amount: '0.00', net_payment: '0.00', is_paid: true, paid_at: '2026-09-01T10:00:00Z', refund_count: 1,
      first_refunded_at: '2026-09-02T10:00:00Z', financials_verified_at: NOW });
  });

  it('parcial sem itens => unallocated', () => {
    const o = order({ displayFinancialStatus: 'PARTIALLY_REFUNDED', totalRefundedSet: m('30.00'), netPaymentSet: m('70.00'),
      refunds: [refund('R1', '30.00', [tx('T2', 'REFUND', 'SUCCESS', '30.00')])] });
    const r = computeOrderFinancials(o, true, NOW);
    expect(r.summary).toMatchObject({ total_refunded: '30.00', refunded_product_amount: '0.00', unallocated_refund_amount: '30.00' });
  });

  it('PENDING e FAILURE não entram como devolvido', () => {
    const o = order({ refunds: [refund('R1', '50.00', [tx('T2', 'REFUND', 'PENDING', '50.00')], [line('50.00')]),
      refund('R2', '20.00', [tx('T3', 'REFUND', 'FAILURE', '20.00')])] });
    const r = computeOrderFinancials(o, true, NOW);
    expect(r.summary).toMatchObject({ total_refunded: '0.00', refund_count: 0, refunded_product_amount: '0.00' });
    expect(r.refunds.map((x: { status: string }) => x.status)).toEqual(['pending', 'failed']);
  });

  it('MIXED: só SUCCESS conta, sem atribuir item/frete, valor fica não alocado', () => {
    const o = order({ totalRefundedSet: m('40.00'), refunds: [refund('R1', '100.00',
      [tx('T2', 'REFUND', 'SUCCESS', '40.00'), tx('T3', 'REFUND', 'FAILURE', '60.00')], [line('90.00')], [ship('10.00')])] });
    const r = computeOrderFinancials(o, true, NOW);
    expect(r.refunds[0]).toMatchObject({ status: 'mixed', refunded_product_amount: '0.00', refunded_shipping: '0.00', unallocated: '40.00' });
    expect(r.summary).toMatchObject({ total_refunded: '40.00', refunded_product_amount: '0.00', refunded_shipping: '0.00', unallocated_refund_amount: '40.00', refund_count: 1 });
  });

  it('sem pagamento SUCCESS => is_paid false', () => {
    const r = computeOrderFinancials(order({ transactions: [tx('T1', 'SALE', 'PENDING', '100.00')] }), true, NOW);
    expect(r.summary).toMatchObject({ is_paid: false, paid_at: null });
  });

  it('divergência com totalRefundedSet => inválido, sem resumo', () => {
    const o = order({ totalRefundedSet: m('100.01'), refunds: [refund('R1', '100.00', [tx('T2', 'REFUND', 'SUCCESS', '100.00')])] });
    const r = computeOrderFinancials(o, true, NOW);
    expect(r.consistency.valid).toBe(false);
    expect(r.consistency.difference).toBe('-0.01');
    expect(r.consistency.issues[0]).toMatch(/centavos/);
    expect(r.summary).toBeNull();
  });

  it('paginação das connections do Refund', async () => {
    const first = order({ totalRefundedSet: m('100.00'), refunds: [{ ...refund('R1', '100.00', [tx('T2', 'REFUND', 'SUCCESS', '100.00')]),
      refundLineItems: page([line('60.00')], true) }] });
    let calls = 0;
    const f = await fetchOrderFinancials('s.myshopify.com', 't', 'g', async () => ++calls === 1
      ? resp(JSON.stringify({ data: { order: first } }))
      : resp(JSON.stringify({ data: { node: { refundLineItems: page([line('40.00')]) } } })));
    expect(f.complete).toBe(true);
    expect(computeOrderFinancials(f.order, f.complete, NOW).summary.refunded_product_amount).toBe('100.00');
  });

  it('consulta incompleta => não válido', async () => {
    const first = order({ refunds: [{ ...refund('R1', '0.00', []), transactions: page([], true) }] });
    let calls = 0;
    const f = await fetchOrderFinancials('s.myshopify.com', 't', 'g', async () => ++calls === 1
      ? resp(JSON.stringify({ data: { order: first } })) : new Response('x', { status: 500 }));
    expect(f.complete).toBe(false);
    const r = computeOrderFinancials(f.order, f.complete, NOW);
    expect(r.consistency.valid).toBe(false);
    expect(r.summary).toBeNull();
  });

  it('centavos sem float', () => {
    expect(toCents('659.48')).toBe(65948);
    expect(toCents('0.1')).toBe(10);
    expect(toCents(null)).toBeNull();
  });

  it('modo financials_dry_run não grava', () => {
    const src = readFileSync('supabase/functions/shopify-reconcile-pending/index.ts', 'utf8');
    const block = src.slice(src.indexOf('if (body.mode === "financials_dry_run")'), src.indexOf('if (body.mode === "scope_check")'));
    expect(block.length).toBeGreaterThan(100);
    expect(block).not.toMatch(/\.(insert|update|upsert|delete)\(|\.rpc\(|shopify_events|order_refunds/);
  });
});
