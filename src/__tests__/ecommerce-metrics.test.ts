import { describe, it, expect } from 'vitest';
import { addDays, bucketFor, canCompare, pctChange, resolvePeriod, todaySP } from '@/lib/ecommercePeriod';
import { ROLE_PERMISSIONS } from '@/hooks/useUserRole';

const now = new Date('2026-09-28T19:00:00Z'); // 16h em SP

describe('períodos de vendas', () => {
  it('Hoje compara com ontem (mesma duração)', () => {
    const p = resolvePeriod('today', { now });
    expect(p.from).toBe('2026-09-28T00:00:00-03:00');
    expect(p.to).toBe('2026-09-29T00:00:00-03:00');
    expect(p.prevFrom).toBe('2026-09-27T00:00:00-03:00');
    expect(p.bucket).toBe('hour');
  });

  it('7 e 30 dias usam os N dias anteriores e agrupam por dia', () => {
    const p7 = resolvePeriod('7days', { now });
    expect(p7.fromDay).toBe('2026-09-22');
    expect(p7.prevFrom).toBe('2026-09-15T00:00:00-03:00');
    expect(p7.bucket).toBe('day');
    expect(resolvePeriod('30days', { now }).days).toBe(30);
  });

  it('90 dias não passa de 28/07/2026 (63 dias, por semana)', () => {
    const p = resolvePeriod('90days', { now, historyStart: '2026-07-28' });
    expect(p.fromDay).toBe('2026-07-28');
    expect(p.clampedToHistory).toBe(true);
    expect(p.bucket).toBe('week');
  });

  it('personalizado usa intervalo anterior de mesma duração', () => {
    const p = resolvePeriod('custom', { now, custom: { from: '2026-09-01', to: '2026-09-30' } });
    expect(p.days).toBe(30);
    expect(p.prevFrom).toBe('2026-08-02T00:00:00-03:00');
    expect(p.prevTo).toBe('2026-09-01T00:00:00-03:00');
  });

  it('agrupamento automático', () => {
    expect(bucketFor(1)).toBe('hour');
    expect(bucketFor(30)).toBe('day');
    expect(bucketFor(90)).toBe('week');
  });

  it('virada do dia usa o fuso de São Paulo', () => {
    expect(todaySP(new Date('2026-09-29T02:30:00Z'))).toBe('2026-09-28');
    expect(todaySP(new Date('2026-09-29T03:00:00Z'))).toBe('2026-09-29');
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  });
});

describe('comparação com período anterior', () => {
  const first = '2026-07-28T18:17:19+00:00';
  it('omite quando o período anterior começa antes do histórico', () => {
    expect(canCompare('2026-06-29T00:00:00-03:00', first, 10)).toBe(false);
  });
  it('omite quando não há pedidos no período anterior', () => {
    expect(canCompare('2026-08-02T00:00:00-03:00', first, 0)).toBe(false);
  });
  it('mostra quando há base completa', () => {
    expect(canCompare('2026-08-02T00:00:00-03:00', first, 147)).toBe(true);
  });
  it('não inventa variação com base zero', () => {
    expect(pctChange(100, 0)).toBeNull();
    expect(pctChange(112.5, 100)).toBeCloseTo(12.5);
  });
});

describe('acesso à área Vendas no app (V1)', () => {
  it('admin e manager veem', () => {
    expect(ROLE_PERMISSIONS.admin).toContain('ecommerce');
    expect(ROLE_PERMISSIONS.manager).toContain('ecommerce');
  });
  it('sdr e demais papéis não veem na V1', () => {
    for (const r of ['sdr', 'dermo', 'expedicao', 'parcerias', 'rastreio', 'user', 'moderator', 'minimal'] as const) {
      expect(ROLE_PERMISSIONS[r]).not.toContain('ecommerce');
    }
  });
});
