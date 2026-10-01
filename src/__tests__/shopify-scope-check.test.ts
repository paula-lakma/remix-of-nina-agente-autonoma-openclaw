import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { ACCESS_SCOPES_QUERY, fetchAccessScopes } from '../../supabase/functions/_shared/shopify_admin';

const resp = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const SHOP = 'lakma-wig.myshopify.com';

describe('Fase 2 Passo 1 — scope_check', () => {
  it('consulta somente leitura (query, sem mutation)', () => {
    expect(ACCESS_SCOPES_QUERY).toContain('currentAppInstallation { accessScopes { handle } }');
    expect(ACCESS_SCOPES_QUERY).not.toMatch(/mutation/i);
  });

  it('retorna a lista de escopos concedidos, ordenada', async () => {
    let method = '';
    const s = await fetchAccessScopes(SHOP, 't', async (_u, init) => {
      method = String(init?.method);
      return resp({ data: { currentAppInstallation: { accessScopes: [{ handle: 'read_orders' }, { handle: 'read_all_orders' }] } } });
    });
    expect(method).toBe('POST');
    expect(s).toEqual(['read_all_orders', 'read_orders']);
  });

  it('erro controlado se a Shopify falhar', async () => {
    await expect(fetchAccessScopes(SHOP, 't', async () => resp({}, 500))).rejects.toThrow(/^graphql_http_500$/);
    await expect(fetchAccessScopes(SHOP, 't', async () => resp({ errors: [{ extensions: { code: 'ACCESS_DENIED' } }] })))
      .rejects.toThrow(/ACCESS_DENIED/);
    await expect(fetchAccessScopes(SHOP, 't', async () => resp({ data: {} }))).rejects.toThrow(/scopes_missing/);
  });

  it('modo scope_check não grava nada e para sem read_all_orders', () => {
    const src = readFileSync('supabase/functions/shopify-reconcile-pending/index.ts', 'utf8');
    const start = src.indexOf('if (body.mode === "scope_check")');
    const block = src.slice(start, src.indexOf('if (body.mode === "refund_audit")'));
    expect(start).toBeGreaterThan(0);
    expect(block).not.toMatch(/\.(insert|update|upsert|delete)\(|\.rpc\(/);
    expect(block).toMatch(/if \(!has\.read_all_orders\)/);
    expect(block.indexOf('!has.read_all_orders')).toBeLessThan(block.indexOf('fetchOrderWithAllItems'));
  });
});
