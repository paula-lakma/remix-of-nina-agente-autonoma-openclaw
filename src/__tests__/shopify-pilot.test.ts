import { describe, it, expect } from 'vitest';
import { buildReconciledPayload, reconciledEventKey } from '../../supabase/functions/_shared/shopify_admin';

const base = { id: 7101253353610, financial_status: 'pending', fulfillment_status: null, updated_at: '2026-09-25T10:00:00-03:00',
  line_items: [{ admin_graphql_api_id: 'gid://shopify/LineItem/1' }], current_subtotal_price: '540.63', discount_codes: [{ code: 'X' }] };
const o = { displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'IN_PROGRESS', cancelledAt: null, cancelReason: null,
  updatedAt: '2026-09-28T19:44:52Z', currentSubtotalPriceSet: { shopMoney: { amount: '540.63' } }, currentTotalPriceSet: { shopMoney: { amount: '570.00' } } };

describe('piloto — orders/reconciled', () => {
  it('chave estável (idempotente)', () => {
    const k = reconciledEventKey('gid://shopify/Order/7101253353610', o.updatedAt);
    expect(k).toBe('orders/reconciled:gid://shopify/Order/7101253353610:2026-09-28T19:44:52Z');
    expect(reconciledEventKey('gid://shopify/Order/7101253353610', o.updatedAt)).toBe(k);
  });
  it('só sobrescreve campos aprovados; preserva fulfillment_status e itens', () => {
    const p = buildReconciledPayload(base, o);
    expect(p.financial_status).toBe('paid');
    expect(p.updated_at).toBe(o.updatedAt);
    expect(p.fulfillment_status).toBeNull();
    expect(p.line_items).toBe(base.line_items);
    expect(p.discount_codes).toBe(base.discount_codes);
    expect(p.current_total_price).toBe('570.00');
    expect(p.id).toBe(base.id);
    expect(base.financial_status).toBe('pending');
  });
});
