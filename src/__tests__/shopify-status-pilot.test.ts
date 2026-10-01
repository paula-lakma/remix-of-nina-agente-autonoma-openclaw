import { describe, it, expect } from 'vitest';
import {
  classifyStatusPilot, buildStatusPayload, reconciledStatusEventKey, lineItemSignature, losslessParse, losslessStringify,
} from '../../supabase/functions/_shared/shopify_admin';

const ok = { dbStatus: 'pending', found: true, complete: true, financial: 'EXPIRED', cancelledAt: null,
  items: 'ok' as const, shopifyUpdatedAt: '2026-08-20T10:00:00Z', baseUpdatedAt: '2026-08-16T10:00:00-03:00' };

const raw = '{"id":7020000000001,"financial_status":"pending","fulfillment_status":null,"total_price":"199.90","current_subtotal_price":"180.00","created_at":"2026-08-16T09:00:00-03:00","updated_at":"2026-08-16T10:00:00-03:00","discount_codes":[{"code":"X"}],"customer":{"id":8000000000001},"line_items":[{"id":17504335102090,"admin_graphql_api_id":"gid://shopify/LineItem/17504335102090","product_id":9333520760970,"variant_id":50313910845578,"quantity":2,"price":"90.00"}]}';

describe('status_pilot — EXPIRED', () => {
  it('pending local + EXPIRED Shopify = elegível', () => {
    expect(classifyStatusPilot(ok).eligible).toBe(true);
  });
  it('PAID, REFUNDED e outros não entram', () => {
    for (const f of ['PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'VOIDED', 'PENDING', 'AUTHORIZED', '']) {
      expect(classifyStatusPilot({ ...ok, financial: f }).eligible).toBe(false);
    }
  });
  it('falhas de validação bloqueiam (zero gravação)', () => {
    expect(classifyStatusPilot({ ...ok, dbStatus: 'expired' }).eligible).toBe(false); // idempotência: já não pending
    expect(classifyStatusPilot({ ...ok, cancelledAt: '2026-08-20T00:00:00Z' }).eligible).toBe(false);
    expect(classifyStatusPilot({ ...ok, complete: false }).eligible).toBe(false);
    expect(classifyStatusPilot({ ...ok, found: false }).eligible).toBe(false);
    expect(classifyStatusPilot({ ...ok, items: 'divergente' }).eligible).toBe(false);
    expect(classifyStatusPilot({ ...ok, items: 'base_sem_gid' }).eligible).toBe(false);
    expect(classifyStatusPilot({ ...ok, shopifyUpdatedAt: '2026-08-16T13:00:00Z' }).eligible).toBe(false);
  });
  it('chave estável', () => {
    expect(reconciledStatusEventKey('gid://shopify/Order/1', '2026-08-20T10:00:00Z'))
      .toBe('orders/reconciled_status:gid://shopify/Order/1:2026-08-20T10:00:00Z');
  });
  it('só muda status e updated_at; IDs, itens, valores preservados; valid_order seguiria false', () => {
    const base = losslessParse(raw);
    const p = buildStatusPayload(base, 'EXPIRED', '2026-08-20T10:00:00Z');
    expect(p.financial_status).toBe('expired');
    expect(p.updated_at).toBe('2026-08-20T10:00:00Z');
    expect(p.financial_status === 'paid').toBe(false);
    for (const k of ['total_price', 'current_subtotal_price', 'created_at', 'fulfillment_status', 'discount_codes', 'customer', 'line_items']) {
      expect(p[k]).toEqual(base[k]);
    }
    const out = losslessStringify({ raw_payload: p });
    expect(out).toContain('17504335102090');
    expect(out).toContain('"customer":{"id":8000000000001}');
    expect(lineItemSignature(out)).toBe(lineItemSignature(raw));
    expect(base.financial_status).toBe('pending');
  });
});
