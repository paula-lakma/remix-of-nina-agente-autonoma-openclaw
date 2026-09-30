import { describe, it, expect } from 'vitest';
import { losslessParse, losslessStringify, buildReconciledPayload } from '../../supabase/functions/_shared/shopify_admin';

const LI = '17999999999999999871', PR = '9007199254740993123', VA = '48123456789012345678';
const raw = `{"id": 7101253353610, "updated_at": "2026-09-25T10:00:00-03:00", "financial_status": "pending", "total": 540.63, "line_items": [{"id": ${LI}, "product_id": ${PR}, "variant_id": ${VA}, "quantity": 2, "admin_graphql_api_id": "gid://shopify/LineItem/${LI}", "title": "a \\"x\\" 12345678901234567"}]}`;

describe('JSON sem perda de precisão', () => {
  it('IDs > MAX_SAFE_INTEGER entram e saem idênticos', () => {
    expect(BigInt(LI) > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(Number(LI).toString()).not.toBe(LI); // prova que Number arredondaria
    const out = losslessStringify(losslessParse(raw));
    for (const id of [LI, PR, VA]) expect(out).toContain(`:${id}`);
    expect(out).toContain(`"gid://shopify/LineItem/${LI}"`);
    expect(out).toContain('12345678901234567"}'); // número dentro de string intocado
  });
  it('payload final da reconciliação mantém identificadores e quantidade de itens', () => {
    const base = losslessParse(raw);
    const p = buildReconciledPayload(base, { displayFinancialStatus: 'PAID', updatedAt: '2026-09-28T19:44:52Z', cancelledAt: null });
    const out = losslessStringify(p);
    const re = /"(id|product_id|variant_id)":(\d+)/g;
    const ids = (t: string) => [...t.matchAll(re)].map((m) => m[2]);
    expect(ids(out)).toEqual(['7101253353610', LI, PR, VA]);
    expect(losslessParse(out).line_items).toHaveLength(1);
    expect(out).toContain('"financial_status":"paid"');
  });
  it('números normais continuam números', () => {
    const v = losslessParse('{"a": 12, "b": -3.5, "c": 1e3}');
    expect(v).toEqual({ a: 12, b: -3.5, c: 1000 });
  });
});
