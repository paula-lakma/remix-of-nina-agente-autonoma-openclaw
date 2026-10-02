import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  verifyShopifyHmac, signShopifyHmac, parseRefundWebhook, nextAttemptAt, processInboxItem, MAX_ATTEMPTS, BACKOFF_MINUTES, REFUNDS_TOPIC,
} from '../../supabase/functions/_shared/shopify_financial_inbox';

const webhookSrc = readFileSync('supabase/functions/shopify-refunds-webhook/index.ts', 'utf8').replace(/\/\*\*[^]*?\*\//, '');
const workerSrc = readFileSync('supabase/functions/shopify-financials-worker/index.ts', 'utf8');
const sharedSrc = readFileSync('supabase/functions/_shared/shopify_financial_inbox.ts', 'utf8');
const NOW = new Date('2026-10-02T12:00:00Z');

function deps(over: Record<string, unknown> = {}) {
  const marks: Array<[string, Record<string, unknown>]> = [];
  const applied: unknown[] = [];
  const d = {
    findOrder: async () => ({ id: 'local-1' }),
    fetchFinancials: async () => ({ found: true, complete: true, order: { refunds: [] }, issues: [], fetched_at: 'x' }),
    compute: () => ({ consistency: { valid: true }, summary: {}, refunds: [] }),
    buildPayload: () => ({ ok: true, reason: null, refunds: [], summary: { a: 1 } }),
    apply: async (...a: unknown[]) => { applied.push(a); return { error: null }; },
    mark: async (id: string, p: Record<string, unknown>) => { marks.push([id, p]); },
    now: () => NOW,
    ...over,
  };
  return { d, marks, applied };
}

describe('HMAC do refunds/create', () => {
  it('válido, inválido e ausente', async () => {
    const body = '{"id":1,"order_id":2}';
    const sig = await signShopifyHmac('segredo', body);
    expect(await verifyShopifyHmac('segredo', body, sig)).toBe(true);
    expect(await verifyShopifyHmac('segredo', body + ' ', sig)).toBe(false);
    expect(await verifyShopifyHmac('outro', body, sig)).toBe(false);
    expect(await verifyShopifyHmac('segredo', body, null)).toBe(false);
    expect(await verifyShopifyHmac('', body, sig)).toBe(false);
  });
});

describe('parse do payload', () => {
  it('IDs longos preservados como texto', () => {
    const p = parseRefundWebhook('{"id":17999999999999999871,"order_id":7042665873546,"x":{"y":12345678901234567890}}');
    expect(p).toMatchObject({ ok: true, refundId: '17999999999999999871', orderId: '7042665873546' });
    expect(p.payload.x.y).toBe('12345678901234567890');
  });
  it('sem order_id ou JSON inválido => recusa', () => {
    expect(parseRefundWebhook('{"id":1}').ok).toBe(false);
    expect(parseRefundWebhook('nope').ok).toBe(false);
    expect(parseRefundWebhook('[1]').ok).toBe(false);
  });
});

describe('endpoint shopify-refunds-webhook', () => {
  it('HMAC antes de tudo; 401 sem escrita', () => {
    const iHmac = webhookSrc.indexOf('verifyShopifyHmac(');
    expect(iHmac).toBeGreaterThan(0);
    expect(iHmac).toBeLessThan(webhookSrc.indexOf('adminClient()'));
    expect(webhookSrc).toMatch(/invalid_hmac" \}, 401/);
  });
  it('só refunds/create; outros topics ignorados sem gravar', () => {
    expect(REFUNDS_TOPIC).toBe('refunds/create');
    expect(webhookSrc.indexOf('topic_nao_suportado')).toBeLessThan(webhookSrc.indexOf('adminClient()'));
  });
  it('dedupe por webhook_id e sem GraphQL / orders / order_refunds', () => {
    expect(webhookSrc).toMatch(/onConflict: "webhook_id", ignoreDuplicates: true/);
    expect(webhookSrc).not.toMatch(/graphql|from\("orders"\)|order_refunds|apply_order_financials|shopify_events|send_queue|whatsapp/i);
  });
  it('waitUntil só acorda o worker (melhor esforço)', () => {
    expect(webhookSrc).toMatch(/EdgeRuntime\?\.waitUntil/);
    expect(webhookSrc).toMatch(/shopify-financials-worker/);
  });
});

describe('worker', () => {
  it('segurança: chave de serviço ou admin; usa claim e apply', () => {
    expect(workerSrc).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(workerSrc).toMatch(/_role: "admin"/);
    expect(workerSrc).toMatch(/Somente admin", 403/);
    expect(workerSrc).toMatch(/rpc\("claim_shopify_financial_inbox"/);
    expect(workerSrc).toMatch(/rpc\("apply_order_financials"/);
    expect(workerSrc).not.toMatch(/\.from\("orders"\)\.(insert|update|upsert|delete)|order_refunds|shopify_events|send_queue/);
    expect(sharedSrc + workerSrc).not.toMatch(/cron/i);
  });
  it('pedido local inexistente => skipped, sem consultar Shopify nem gravar', async () => {
    let fetched = false;
    const { d, marks, applied } = deps({ findOrder: async () => null, fetchFinancials: async () => { fetched = true; return {} as never; } });
    const r = await processInboxItem({ id: 'i1', shopify_order_id: '999000000000002', attempts: 1 }, d);
    expect(r.outcome).toBe('skipped');
    expect(fetched).toBe(false);
    expect(applied).toHaveLength(0);
    expect(marks[0][1]).toMatchObject({ status: 'skipped' });
  });
  it('sucesso => apply 1x e done', async () => {
    const { d, marks, applied } = deps();
    const r = await processInboxItem({ id: 'i1', shopify_order_id: '7042665873546', attempts: 1 }, d);
    expect(r.outcome).toBe('done');
    expect(applied).toHaveLength(1);
    expect(marks.at(-1)![1]).toMatchObject({ status: 'done' });
  });
  it('erro transitório => volta para pending com backoff; sem apply parcial', async () => {
    const { d, marks, applied } = deps({ fetchFinancials: async () => { throw new Error('graphql_http_503'); } });
    const r = await processInboxItem({ id: 'i1', shopify_order_id: '1', attempts: 2 }, d);
    expect(r.outcome).toBe('retry');
    expect(applied).toHaveLength(0);
    expect(marks[0][1]).toMatchObject({ status: 'pending', next_attempt_at: '2026-10-02T12:15:00.000Z' });
  });
  it('consulta incompleta ou inconsistente => não aplica', async () => {
    const a = deps({ fetchFinancials: async () => ({ found: true, complete: false, order: {}, issues: ['p'], fetched_at: 'x' }) });
    expect((await processInboxItem({ id: 'i', shopify_order_id: '1', attempts: 1 }, a.d)).outcome).toBe('retry');
    const b = deps({ buildPayload: () => ({ ok: false, reason: 'div', refunds: [], summary: null }) });
    expect((await processInboxItem({ id: 'i', shopify_order_id: '1', attempts: 1 }, b.d)).outcome).toBe('retry');
    expect(a.applied.length + b.applied.length).toBe(0);
  });
  it('backoff determinístico e 5 tentativas => failed', async () => {
    expect([...BACKOFF_MINUTES]).toEqual([5, 15, 30, 60]);
    expect(MAX_ATTEMPTS).toBe(5);
    expect(nextAttemptAt(1, NOW)).toBe('2026-10-02T12:05:00.000Z');
    expect(nextAttemptAt(4, NOW)).toBe('2026-10-02T13:00:00.000Z');
    expect(nextAttemptAt(5, NOW)).toBeNull();
    const { d, marks } = deps({ apply: async () => ({ error: 'boom' }) });
    const r = await processInboxItem({ id: 'i1', shopify_order_id: '1', attempts: 5 }, d);
    expect(r.outcome).toBe('failed');
    expect(marks[0][1]).toMatchObject({ status: 'failed' });
  });
});
