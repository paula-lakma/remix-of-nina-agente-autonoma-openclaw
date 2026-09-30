import { describe, it, expect } from 'vitest';
import { normalizeShopifyPayload } from '../../supabase/functions/_shared/shopify';

const order = (fin: string, updated_at: string, extra: Record<string, unknown> = {}) => ({
  id: 7101253353610,
  admin_graphql_api_id: 'gid://shopify/Order/7101253353610',
  name: '#2272',
  financial_status: fin,
  updated_at,
  phone: '+5511999998888',
  ...extra,
});

describe('orders/updated — idempotência por X-Shopify-Webhook-Id', () => {
  const pending = order('pending', '2026-09-25T19:08:14-04:00');
  const paid = order('paid', '2026-09-29T13:09:31-04:00');

  it('pending e paid com Webhook IDs diferentes geram chaves diferentes (ambos aceitos)', () => {
    const a = normalizeShopifyPayload('orders/updated', pending, 'wid-1').event_id;
    const b = normalizeShopifyPayload('orders/updated', paid, 'wid-2').event_id;
    expect(a).toBe('orders/updated:wid-1');
    expect(b).toBe('orders/updated:wid-2');
    expect(a).not.toBe(b);
  });

  it('retry do mesmo pending (mesmo Webhook ID) gera a mesma chave (descartado)', () => {
    expect(normalizeShopifyPayload('orders/updated', pending, 'wid-1').event_id)
      .toBe(normalizeShopifyPayload('orders/updated', pending, 'wid-1').event_id);
  });

  it('retry do mesmo paid (mesmo Webhook ID) gera a mesma chave (descartado)', () => {
    expect(normalizeShopifyPayload('orders/updated', paid, 'wid-2').event_id)
      .toBe(normalizeShopifyPayload('orders/updated', paid, 'wid-2').event_id);
  });

  it('sem header (ausente ou vazio) usa fallback pedido + updated_at', () => {
    const a = normalizeShopifyPayload('orders/updated', pending).event_id;
    const b = normalizeShopifyPayload('orders/updated', paid, '  ').event_id;
    expect(a).toBe('orders/updated:gid://shopify/Order/7101253353610:2026-09-25T19:08:14-04:00');
    expect(b).toBe('orders/updated:gid://shopify/Order/7101253353610:2026-09-29T13:09:31-04:00');
    expect(normalizeShopifyPayload('orders/updated', pending, null).event_id).toBe(a);
  });

  it('rastreio não entra na chave de orders/updated', () => {
    const withTracking = order('paid', '2026-09-29T13:09:31-04:00', { fulfillments: [{ tracking_number: 'AP555161045BR' }] });
    expect(normalizeShopifyPayload('orders/updated', withTracking, 'wid-3').event_id).toBe('orders/updated:wid-3');
    expect(normalizeShopifyPayload('orders/updated', withTracking).event_id).not.toContain('AP555161045BR');
  });

  it('orders/updated continua sem disparar envio (event_kind unknown)', () => {
    expect(normalizeShopifyPayload('orders/updated', paid, 'wid-2').event_kind).toBe('unknown');
  });
});

describe('fulfillments — chave idêntica à lógica anterior', () => {
  const ful = {
    id: 6238386421898,
    admin_graphql_api_id: 'gid://shopify/Fulfillment/6238386421898',
    order_id: 7098173620362,
    tracking_number: '623911015',
  };
  for (const t of ['fulfillments/create', 'fulfillments/update']) {
    it(`${t} mantém <topic>:<id>:<rastreio> e ignora o Webhook ID`, () => {
      const expected = `${t}:gid://shopify/Fulfillment/6238386421898:623911015`;
      expect(normalizeShopifyPayload(t, ful).event_id).toBe(expected);
      expect(normalizeShopifyPayload(t, ful, 'wid-x').event_id).toBe(expected);
      expect(normalizeShopifyPayload(t, ful, 'wid-y').event_id).toBe(expected);
      expect(normalizeShopifyPayload(t, ful).event_kind).toBe('order_shipped');
    });
  }
  it('fulfillment sem rastreio mantém <topic>:<id>', () => {
    const { tracking_number: _t, ...noTrack } = ful;
    expect(normalizeShopifyPayload('fulfillments/create', noTrack, 'wid').event_id)
      .toBe('fulfillments/create:gid://shopify/Fulfillment/6238386421898');
  });
  it('outros tópicos sem id continuam com event_id null', () => {
    expect(normalizeShopifyPayload('orders/create', {}, 'wid').event_id).toBeNull();
  });
});
