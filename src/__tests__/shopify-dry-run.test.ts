import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { classifyOrder, compareLineItems } from '../../supabase/functions/_shared/shopify_admin';

const G = (n: number) => `gid://shopify/LineItem/${n}`;

describe('dry_run — classificação', () => {
  it('só pending local + PAID + itens ok é elegível', () => {
    expect(classifyOrder({ found: true, complete: true, financial: 'PAID', items: 'ok' })).toEqual({ cls: 'paid', eligible: true, reason: null });
    expect(classifyOrder({ found: true, complete: true, financial: 'PAID', items: 'divergente' }).cls).toBe('divergencia_itens');
  });
  it('status', () => {
    const c = (financial: string, cancelledAt: string | null = null) => classifyOrder({ found: true, complete: true, financial, cancelledAt, items: 'ok' });
    expect(c('PENDING').cls).toBe('pending');
    expect(c('REFUNDED').cls).toBe('refunded');
    expect(c('PARTIALLY_REFUNDED').cls).toBe('partially_refunded');
    expect(c('VOIDED').cls).toBe('outro');
    expect(c('PAID', '2026-09-01').cls).toBe('cancelled');
    for (const s of ['PENDING', 'REFUNDED', 'VOIDED']) expect(c(s).eligible).toBe(false);
  });
  it('incompleta, não encontrado, erro', () => {
    expect(classifyOrder({ found: true, complete: false, financial: 'PAID' }).cls).toBe('consulta_incompleta');
    expect(classifyOrder({ found: true, complete: true, financial: 'PAID', items: 'base_sem_gid' }).cls).toBe('consulta_incompleta');
    expect(classifyOrder({ found: false, complete: true }).cls).toBe('nao_encontrado');
    expect(classifyOrder({ found: false, complete: false, error: 'graphql_http_500' }).cls).toBe('erro');
  });
});

describe('dry_run — comparação por GID exato', () => {
  it('iguais independente da ordem', () => {
    expect(compareLineItems([{ admin_graphql_api_id: G(1) }, { admin_graphql_api_id: G(2) }], [G(2), G(1)])).toBe('ok');
  });
  it('divergente por GID ou quantidade de itens', () => {
    expect(compareLineItems([{ admin_graphql_api_id: G(1) }], [G(3)])).toBe('divergente');
    expect(compareLineItems([{ admin_graphql_api_id: G(1) }], [G(1), G(2)])).toBe('divergente');
  });
  it('não usa id numérico: sem GID = consulta incompleta', () => {
    expect(compareLineItems([{ id: 16000000000000000 }], [G(16000000000000000)])).toBe('base_sem_gid');
  });
});

describe('dry_run — sem escrita e sem segredos', () => {
  const src = readFileSync('supabase/functions/shopify-reconcile-pending/index.ts', 'utf8');
  it('dry_run não contém escrita; única escrita do arquivo é o evento do piloto', () => {
    const dry = src.slice(src.indexOf('if (body.mode === "dry_run") {'), src.indexOf('try {\n    const r = await fetchOrderWithAllItems'));
    expect(dry).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(src.match(/\.(insert|update|upsert|delete)\(/g)).toEqual(['.insert(']);
    expect(src).toMatch(/from\("shopify_events"\)\.insert\(\{\s*topic: "orders\/reconciled", send_status: "reconciled"/);
    expect(src).not.toMatch(/from\("(orders|order_items|send_queue|tracking_send_locks|messages)"\)\.(insert|update|upsert)/);
  });
  it('não registra nem retorna segredo/token', () => {
    expect(src).not.toMatch(/console\.(log|error|warn)/);
    expect(src).not.toMatch(/jsonResponse\([^)]*\b(token|clientSecret|clientId)\b\s*[,}]/);
  });
});
