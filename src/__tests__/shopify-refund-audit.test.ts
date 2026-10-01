import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  REFUND_AUDIT_QUERY, REFUND_AUDIT_ALLOWLIST, fetchRefundAudit, summarizeRefundAudit,
} from '../../supabase/functions/_shared/shopify_admin';

const m = (a: string) => ({ shopMoney: { amount: a, currencyCode: 'BRL' } });
const resp = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
const order = (hasNext: boolean) => ({
  id: 'gid://shopify/Order/1', name: '#2009', createdAt: 'x', updatedAt: 'y', displayFinancialStatus: 'REFUNDED', cancelledAt: null,
  totalPriceSet: m('100.00'), subtotalPriceSet: m('100.00'), totalDiscountsSet: m('0.00'), totalShippingPriceSet: m('0.00'),
  totalReceivedSet: m('100.00'), totalRefundedSet: m('100.00'), totalRefundedShippingSet: m('0.00'), netPaymentSet: m('0.00'),
  transactions: [{ id: 't1', kind: 'SALE', status: 'SUCCESS', gateway: 'pix', processedAt: 'a', amountSet: m('100.00'), parentTransaction: null }],
  refunds: [{ id: 'gid://shopify/Refund/9', createdAt: 'b', processedAt: 'b', updatedAt: 'b', note: null, totalRefundedSet: m('100.00'),
    refundLineItems: { nodes: [{ quantity: 1, lineItem: { id: 'L1' }, subtotalSet: m('60.00') }], pageInfo: { hasNextPage: hasNext, endCursor: 'c1' } },
    refundShippingLines: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    transactions: { nodes: [{ id: 't2', kind: 'REFUND', status: 'SUCCESS', gateway: 'pix', processedAt: 'b', amountSet: m('100.00'), parentTransaction: { id: 't1' } }], pageInfo: { hasNextPage: false, endCursor: null } } }],
});

describe('refund_audit — somente leitura', () => {
  it('query sem mutation, com MoneyBag completos; allowlist fixa', () => {
    expect(REFUND_AUDIT_QUERY).not.toMatch(/mutation/);
    expect(REFUND_AUDIT_QUERY).toMatch(/totalReceivedSet \{ shopMoney \{ amount currencyCode \} \}/);
    expect(REFUND_AUDIT_QUERY).toMatch(/transactions \{ id kind/); // Order.transactions é lista
    expect([...REFUND_AUDIT_ALLOWLIST]).toEqual(['2009', '2036', '2107']);
  });
  it('pagina connections do Refund', async () => {
    let calls = 0;
    const a = await fetchRefundAudit('lakma-wig.myshopify.com', 't', 'gid://shopify/Order/1', async () => {
      calls++;
      return calls === 1 ? resp({ data: { order: order(true) } })
        : resp({ data: { node: { refundLineItems: { nodes: [{ quantity: 2, lineItem: { id: 'L2' }, subtotalSet: m('40.00') }], pageInfo: { hasNextPage: false, endCursor: null } } } } });
    });
    expect(a.complete).toBe(true);
    const s = summarizeRefundAudit(a.order, a.complete);
    expect(s.refunds[0].line_items).toHaveLength(2);
    expect(s.refund_type).toBe('total');
    expect(s.received).toBe('100.00');
  });
  it('falha de paginação => auditoria incompleta, sem inferir', async () => {
    let calls = 0;
    const a = await fetchRefundAudit('lakma-wig.myshopify.com', 't', 'gid://shopify/Order/1', async () =>
      ++calls === 1 ? resp({ data: { order: order(true) } }) : new Response('x', { status: 500 }));
    expect(a.complete).toBe(false);
    expect(summarizeRefundAudit(a.order, a.complete).refund_type).toBe('auditoria_incompleta');
  });
  it('modo refund_audit não grava', () => {
    const src = readFileSync('supabase/functions/shopify-reconcile-pending/index.ts', 'utf8');
    const block = src.slice(src.indexOf('if (body.mode === "refund_audit")'), src.indexOf('if (body.mode === "status_pilot")'));
    expect(block).not.toMatch(/method: "POST"|\.(insert|update|upsert|delete)\(|shopify_events/);
  });
});
