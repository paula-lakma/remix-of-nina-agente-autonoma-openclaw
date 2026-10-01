import { describe, it, expect } from 'vitest';
import { classifyStatusPilot, validateFullRefund, buildStatusPayload, lineItemSignature, losslessParse, losslessStringify } from '../../supabase/functions/_shared/shopify_admin';

const base = { dbStatus: 'pending', found: true, complete: true, financial: 'REFUNDED', cancelledAt: null,
  items: 'ok' as const, shopifyUpdatedAt: '2026-09-10T14:10:41Z', baseUpdatedAt: '2026-09-10T08:07:08-04:00' };
const fin = () => ({ complete: true, financial: 'REFUNDED', cancelledAt: null, received: '522.96', refunded: '522.96', net_payment: '0.0',
  transactions: [
    { id: 'T1', kind: 'SALE', status: 'SUCCESS', parent: null },
    { id: 'T2', kind: 'REFUND', status: 'SUCCESS', parent: 'T1' },
  ] });

describe('status_pilot — REFUNDED total', () => {
  it('REFUNDED só entra com allowlist; EXPIRED segue; PAID nunca', () => {
    expect(classifyStatusPilot(base).eligible).toBe(false);
    expect(classifyStatusPilot(base, true).eligible).toBe(true);
    expect(classifyStatusPilot({ ...base, financial: 'EXPIRED' }).eligible).toBe(true);
    expect(classifyStatusPilot({ ...base, financial: 'PAID' }, true).eligible).toBe(false);
    expect(classifyStatusPilot({ ...base, financial: 'PARTIALLY_REFUNDED' }, true).eligible).toBe(false);
    expect(classifyStatusPilot({ ...base, dbStatus: 'refunded' }, true).eligible).toBe(false); // idempotência
  });
  it('reembolso total SUCCESS = elegível', () => {
    expect(validateFullRefund(fin()).ok).toBe(true);
  });
  it('bloqueios financeiros', () => {
    expect(validateFullRefund({ ...fin(), refunded: '500.00' }).ok).toBe(false);
    expect(validateFullRefund({ ...fin(), net_payment: '22.96' }).ok).toBe(false);
    expect(validateFullRefund({ ...fin(), received: '0.0', refunded: '0.0' }).ok).toBe(false);
    const f1 = fin(); f1.transactions[1].status = 'PENDING'; expect(validateFullRefund(f1).ok).toBe(false);
    const f2 = fin(); f2.transactions[0].status = 'FAILURE'; expect(validateFullRefund(f2).ok).toBe(false);
    const f3 = fin(); f3.transactions[1].parent = 'OUTRO'; expect(validateFullRefund(f3).ok).toBe(false);
    expect(validateFullRefund({ ...fin(), complete: false }).ok).toBe(false);
    expect(validateFullRefund(null).ok).toBe(false);
  });
  it('payload: só status/updated_at; valores e IDs preservados', () => {
    const raw = '{"id":7090000000001,"financial_status":"pending","total_price":"522.96","total_discounts":"427.86","line_items":[{"id":17400000000001,"admin_graphql_api_id":"gid://shopify/LineItem/17400000000001","product_id":9333520760970,"variant_id":50313910845578,"quantity":3}]}';
    const b = losslessParse(raw);
    const p = buildStatusPayload(b, 'REFUNDED', base.shopifyUpdatedAt);
    expect(p.financial_status).toBe('refunded');
    expect(p.total_price).toBe('522.96');
    expect(p.total_discounts).toBe('427.86');
    expect(lineItemSignature(losslessStringify({ raw_payload: p }))).toBe(lineItemSignature(raw));
  });
});
