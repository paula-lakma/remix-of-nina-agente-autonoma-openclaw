import { describe, it, expect } from 'vitest';
import {
  RECONCILE_ORDER_QUERY, SHOPIFY_API_VERSION, fetchOrderWithAllItems, getAccessToken, isValidShopDomain, orderGid,
} from '../../supabase/functions/_shared/shopify_admin';

const resp = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('Shopify Admin — Etapa 0', () => {
  it('usa GraphQL 2026-07 e declara $cursor', () => {
    expect(SHOPIFY_API_VERSION).toBe('2026-07');
    expect(RECONCILE_ORDER_QUERY).toContain('$cursor: String');
    expect(RECONCILE_ORDER_QUERY).toContain('pageInfo { hasNextPage endCursor }');
  });

  it('monta GID do pedido e valida domínio', () => {
    expect(orderGid('7101253353610')).toBe('gid://shopify/Order/7101253353610');
    expect(() => orderGid('abc')).toThrow();
    expect(isValidShopDomain('lakma-wig.myshopify.com')).toBe(true);
    expect(isValidShopDomain('evil.com/x')).toBe(false);
  });

  it('client credentials: envia grant_type e não vaza o segredo no erro', async () => {
    let sent = '';
    const tok = await getAccessToken('lakma-wig.myshopify.com', 'cid', 'SECRET', async (_u, init) => {
      sent = String(init?.body); return resp({ access_token: 'tkn' });
    });
    expect(tok).toBe('tkn');
    expect(sent).toContain('grant_type=client_credentials');
    await expect(getAccessToken('lakma-wig.myshopify.com', 'cid', 'SECRET', async () => resp({ error: 'x' }, 401)))
      .rejects.toThrow(/^auth_failed:401$/);
  });

  it('paginação: cursor null na 1ª chamada e endCursor depois', async () => {
    const cursors: unknown[] = [];
    const page = (ids: string[], next: string | null) => resp({ data: { order: {
      name: '#1', displayFinancialStatus: 'PAID',
      lineItems: { nodes: ids.map((id) => ({ id, quantity: 1, currentQuantity: 1 })), pageInfo: { hasNextPage: !!next, endCursor: next } },
    } } });
    const r = await fetchOrderWithAllItems('lakma-wig.myshopify.com', 't', 'gid://shopify/Order/1', async (_u, init) => {
      const v = JSON.parse(String(init?.body)).variables; cursors.push(v.cursor);
      return v.cursor === null ? page(['a', 'b'], 'c1') : page(['c'], null);
    });
    expect(cursors).toEqual([null, 'c1']);
    expect(r.lineItems.map((l) => l.id)).toEqual(['a', 'b', 'c']);
    expect(r.complete).toBe(true);
    expect(r.pages).toBe(2);
  });

  it('pedido inexistente e ACCESS_DENIED', async () => {
    const nf = await fetchOrderWithAllItems('lakma-wig.myshopify.com', 't', 'gid://shopify/Order/1', async () => resp({ data: { order: null } }));
    expect(nf.found).toBe(false);
    await expect(fetchOrderWithAllItems('lakma-wig.myshopify.com', 't', 'gid://shopify/Order/1',
      async () => resp({ errors: [{ message: 'x', extensions: { code: 'ACCESS_DENIED' } }] })))
      .rejects.toThrow(/ACCESS_DENIED/);
  });
});
