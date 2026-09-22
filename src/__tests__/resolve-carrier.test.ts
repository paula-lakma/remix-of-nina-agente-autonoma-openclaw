import { describe, it, expect } from 'vitest';
import { resolveCarrier, buildTemplateMessage, normalizeShopifyPayload } from '../../supabase/functions/_shared/shopify';

describe('resolveCarrier — somente Correios/Jadlog', () => {
  it('Frenet com link Jadlog → jadlog', () => {
    expect(resolveCarrier('https://rastreio.frenet.com.br/JAD/622119559', '622119559', 'Frenet')).toBe('jadlog');
  });
  it('Other com link Jadlog → jadlog', () => {
    expect(resolveCarrier('https://rastreio.frenet.com.br/JAD/123456789', null, 'Other')).toBe('jadlog');
  });
  it('Other sem link com 9 dígitos → jadlog', () => {
    expect(resolveCarrier(null, '622119559', 'Other')).toBe('jadlog');
  });
  it('Correios pelo formato do código', () => {
    expect(resolveCarrier(null, 'AP434990101BR', 'Other')).toBe('correios');
  });
  it('Correios pelo link', () => {
    expect(resolveCarrier('https://www.correios.com.br/rastreamento?x=1', 'XYZ', null)).toBe('correios');
  });
  it('nome só decide se já for Correios/Jadlog', () => {
    expect(resolveCarrier(null, 'ABC', 'Jadlog')).toBe('jadlog');
    expect(resolveCarrier(null, 'ABC', 'Frenet')).toBe('indeterminado');
    expect(resolveCarrier(null, 'ABC', 'UPS')).toBe('indeterminado');
    expect(resolveCarrier(null, null, null)).toBe('indeterminado');
  });
});

describe('aviso automático usa modelo específico e nunca Frenet/Other', () => {
  const base = { id: 1, order_id: 10, name: '#1885.1', destination: { first_name: 'Ana', phone: '11999998888' } };
  it('Frenet → pedido_enviado_jadlog', () => {
    const n = normalizeShopifyPayload('fulfillments/create', {
      ...base, tracking_company: 'Frenet', tracking_number: '622119559',
      tracking_url: 'https://rastreio.frenet.com.br/JAD/622119559',
    });
    expect(n.tracking_company).toBe('jadlog');
    expect(n.tracking_company_raw).toBe('Frenet');
    const m = buildTemplateMessage(n)!;
    expect(m.template_name).toBe('pedido_enviado_jadlog');
    expect(m.variables).toHaveLength(3);
    expect(m.preview).not.toMatch(/frenet|other/i);
  });
  it('Correios → pedido_enviado_correios', () => {
    const n = normalizeShopifyPayload('fulfillments/create', { ...base, tracking_company: 'Correios', tracking_number: 'AP434990101BR' });
    expect(buildTemplateMessage(n)!.template_name).toBe('pedido_enviado_correios');
  });
  it('indeterminado → sem mensagem', () => {
    const n = normalizeShopifyPayload('fulfillments/create', { ...base, tracking_company: 'Other', tracking_number: 'XX12' });
    expect(n.tracking_company).toBe('indeterminado');
    expect(buildTemplateMessage(n)).toBeNull();
  });
});
