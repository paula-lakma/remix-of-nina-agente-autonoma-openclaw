/**
 * FASE 2B1 — testes isolados (lógica pura + simulação em memória).
 * Não chamam o webhook publicado, não tocam no banco, não enviam WhatsApp.
 */
import { describe, expect, it } from 'vitest';
import {
  buildTrackingKey,
  canClaim,
  nextStatus,
  sharedTrackingLockEnabled,
  type LockStatus,
} from '../../supabase/functions/_shared/tracking_lock';
import { homeRouteForRole } from '../hooks/useUserRole';

const env = (v?: string) => (_k: string) => v;

describe('interruptor SHOPIFY_SHARED_TRACKING_LOCK_ENABLED', () => {
  it('ausente => desligado (fluxo legado)', () => {
    expect(sharedTrackingLockEnabled(env(undefined))).toBe(false);
  });
  it('"false" => desligado', () => {
    expect(sharedTrackingLockEnabled(env('false'))).toBe(false);
  });
  it('valor arbitrário => desligado', () => {
    expect(sharedTrackingLockEnabled(env('1'))).toBe(false);
  });
  it('"true" => ligado', () => {
    expect(sharedTrackingLockEnabled(env('true'))).toBe(true);
  });
});

describe('chave compartilhada', () => {
  it('mesma origem lógica gera a mesma chave', () => {
    expect(buildTrackingKey('#1885', 'aa123456789br')).toBe(
      buildTrackingKey('1885', 'AA123456789BR'),
    );
  });
  it('rastreios diferentes geram chaves diferentes', () => {
    expect(buildTrackingKey('1885', 'A1')).not.toBe(buildTrackingKey('1885', 'A2'));
  });
});

describe('bloqueio e retomada', () => {
  it('sent e processing bloqueiam; queued bloqueia; failed retoma', () => {
    expect(canClaim('sent')).toBe(false);
    expect(canClaim('processing')).toBe(false);
    expect(canClaim('queued')).toBe(false);
    expect(canClaim('failed')).toBe(true);
    expect(canClaim('none')).toBe(true);
  });
  it('processing expirado (30 min) pode ser retomado', () => {
    expect(canClaim('processing', true)).toBe(true);
  });
});

describe('ciclo assíncrono', () => {
  it('processing -> queued -> sent', () => {
    let s: LockStatus = nextStatus('none', 'acquire');
    expect(s).toBe('processing');
    s = nextStatus(s, 'queued');
    expect(s).toBe('queued');
    s = nextStatus(s, 'sent');
    expect(s).toBe('sent');
  });
  it('queued -> failed permite nova tentativa', () => {
    const s = nextStatus(nextStatus(nextStatus('none', 'acquire'), 'queued'), 'failed');
    expect(s).toBe('failed');
    expect(canClaim(s)).toBe(true);
  });
  it('falha antes da fila compensa para failed (sem trava presa)', () => {
    const s = nextStatus(nextStatus('none', 'acquire'), 'failed');
    expect(s).toBe('failed');
    expect(canClaim(s)).toBe(true);
  });
  it('sent nunca regride para failed', () => {
    expect(nextStatus('sent', 'failed')).toBe('sent');
  });
});

/** Simulação em memória da RPC coordenada (mesma semântica do SQL preparado). */
function makeCoordinator() {
  const legacy = new Map<string, LockStatus>(); // fulfillment::tracking
  const shared = new Map<string, LockStatus>(); // tracking_key
  return {
    legacy,
    shared,
    acquire(fulfillment: string, order: string, tracking: string) {
      const lk = `${fulfillment}::${tracking}`;
      const sk = buildTrackingKey(order, tracking);
      const legacyPrev = legacy.get(lk) ?? 'none';
      if (!canClaim(legacyPrev)) return { acquired: false, reason: 'legacy_duplicate' as const };
      legacy.set(lk, 'processing');
      const sharedPrev = shared.get(sk) ?? 'none';
      if (!canClaim(sharedPrev)) {
        legacy.set(lk, legacyPrev); // compensação atômica
        if (legacyPrev === 'none') legacy.delete(lk);
        return { acquired: false, reason: 'shared_duplicate' as const };
      }
      shared.set(sk, 'processing');
      return { acquired: true, lk, sk };
    },
    release(lk: string, sk: string, result: 'queued' | 'sent' | 'failed') {
      shared.set(sk, nextStatus(shared.get(sk) ?? 'none', result));
      legacy.set(lk, result === 'queued' ? 'processing' : result);
    },
  };
}

describe('coordenação atômica das duas deduplicações', () => {
  it('duas origens simultâneas geram um único envio', () => {
    const c = makeCoordinator();
    const a = c.acquire('F1', '1885', 'AA1');
    const b = c.acquire('F1', '1885', 'AA1');
    expect(a.acquired).toBe(true);
    expect(b.acquired).toBe(false);
  });

  it('bloqueio compartilhado não deixa a linha legada em processing', () => {
    const c = makeCoordinator();
    // manual já enviou com a mesma tracking_key, fulfillment legado diferente
    c.shared.set(buildTrackingKey('1885', 'AA1'), 'sent');
    const r = c.acquire('F-NOVO', '1885', 'AA1');
    expect(r.acquired).toBe(false);
    expect(r.reason).toBe('shared_duplicate');
    expect(c.legacy.get('F-NOVO::AA1')).toBeUndefined();
  });

  it('bloqueio legado não deixa trava compartilhada em processing', () => {
    const c = makeCoordinator();
    c.legacy.set('F1::AA1', 'sent');
    const r = c.acquire('F1', '1885', 'AA1');
    expect(r.acquired).toBe(false);
    expect(c.shared.get(buildTrackingKey('1885', 'AA1'))).toBeUndefined();
  });

  it('falha antes da fila libera os dois lados para nova tentativa', () => {
    const c = makeCoordinator();
    const a = c.acquire('F1', '1885', 'AA1') as { acquired: true; lk: string; sk: string };
    c.release(a.lk, a.sk, 'failed');
    expect(c.acquire('F1', '1885', 'AA1').acquired).toBe(true);
  });

  it('queued -> sent bloqueia definitivamente; nenhuma trava fica presa', () => {
    const c = makeCoordinator();
    const a = c.acquire('F1', '1885', 'AA1') as { acquired: true; lk: string; sk: string };
    c.release(a.lk, a.sk, 'queued');
    expect(c.shared.get(a.sk)).toBe('queued');
    c.release(a.lk, a.sk, 'sent');
    expect(c.shared.get(a.sk)).toBe('sent');
    expect(c.legacy.get(a.lk)).toBe('sent');
    expect(c.acquire('F1', '1885', 'AA1').acquired).toBe(false);
  });
});

describe('rota inicial por papel', () => {
  it('expedicao vai para /tracking', () => {
    expect(homeRouteForRole('expedicao')).toBe('/tracking');
  });
  it('admin e manager mantêm o dashboard', () => {
    expect(homeRouteForRole('admin')).toBe('/dashboard');
    expect(homeRouteForRole('manager')).toBe('/dashboard');
  });
  it('sdr e user seguem no chat', () => {
    expect(homeRouteForRole('sdr')).toBe('/chat');
    expect(homeRouteForRole('user')).toBe('/chat');
  });
});
