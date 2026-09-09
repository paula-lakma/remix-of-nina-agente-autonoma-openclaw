import { describe, it, expect } from 'vitest';

/**
 * Simulação isolada da regra de distribuição de atendimentos comuns de
 * dermoconsultora implementada em public.pick_next_dermoconsultora().
 *
 * Regra:
 *  - pool = todas as dermos ativas;
 *  - profissional com weight > 1 só entra no pool quando houver `weight`
 *    atendimentos COMUNS (dermo_mode = 'balanced', não sintéticos) desde o
 *    último dela;
 *  - ela volta ao pool se todas as de weight = 1 tiverem carga ativa >= 2,
 *    ou se o pool ficar vazio;
 *  - ordenação dentro do pool: carga ativa ASC, último handoff dermo ASC
 *    NULLS FIRST, id ASC.
 */

type Name = 'Mylena' | 'Cris' | 'Barbara' | 'Laura' | 'Talia';
const NAMES: Name[] = ['Mylena', 'Cris', 'Barbara', 'Laura', 'Talia'];
const WEIGHT: Record<Name, number> = { Mylena: 1, Cris: 1, Barbara: 1, Laura: 1, Talia: 8 };

interface State {
  load: Record<Name, number>;
  lastAny: Record<Name, number | null>;
  lastCommon: Record<Name, number | null>;
  commonEvents: number[]; // timestamps de handoffs comuns
}

function pick(s: State): Name {
  const minNormal = Math.min(...NAMES.filter((n) => WEIGHT[n] <= 1).map((n) => s.load[n]));
  const eligible = NAMES.filter((n) => {
    if (WEIGHT[n] <= 1) return true;
    const since = s.commonEvents.filter((t) => s.lastCommon[n] === null || t > (s.lastCommon[n] as number)).length;
    return since >= WEIGHT[n] || minNormal >= 2;
  });
  const pool = eligible.length ? eligible : [...NAMES];
  const min = Math.min(...pool.map((n) => s.load[n]));
  return pool
    .filter((n) => s.load[n] === min)
    .sort((a, b) => (s.lastAny[a] ?? -1) - (s.lastAny[b] ?? -1) || a.localeCompare(b))[0];
}

function freshState(historicoComum = 8, load?: Partial<Record<Name, number>>): State {
  return {
    load: Object.fromEntries(NAMES.map((n) => [n, load?.[n] ?? 0])) as Record<Name, number>,
    lastAny: Object.fromEntries(NAMES.map((n) => [n, null])) as Record<Name, number | null>,
    lastCommon: Object.fromEntries(NAMES.map((n) => [n, null])) as Record<Name, number | null>,
    commonEvents: Array.from({ length: historicoComum }, (_, i) => -i),
  };
}

function runRounds(rounds: number, state = freshState()): Record<Name, number> {
  const count = Object.fromEntries(NAMES.map((n) => [n, 0])) as Record<Name, number>;
  for (let t = 1; t <= rounds; t++) {
    const p = pick(state);
    count[p] += 1;
    state.lastAny[p] = t;
    state.lastCommon[p] = t;
    state.commonEvents.push(t);
    // atendimentos são finalizados entre um lead e outro
    NAMES.forEach((n) => (state.load[n] = 0));
  }
  return count;
}

describe('distribuição de atendimentos comuns entre dermoconsultoras', () => {
  it('reduz a participação da profissional com weight = 8 sem zerá-la', () => {
    const c = runRounds(20);
    expect(c.Talia).toBeGreaterThan(0);
    expect(c.Talia).toBeLessThanOrEqual(3);
    NAMES.filter((n) => n !== 'Talia').forEach((n) => {
      expect(c[n]).toBeGreaterThanOrEqual(4);
    });
    expect(Object.values(c).reduce((a, b) => a + b, 0)).toBe(20);
  });

  it('mantém rotação entre as quatro prioritárias (ninguém vence todos os empates)', () => {
    const c = runRounds(20);
    NAMES.filter((n) => n !== 'Talia').forEach((n) => expect(c[n]).toBeLessThanOrEqual(6));
  });

  it('least-loaded continua acima da cota: quem tem carga 0 ganha de quem tem 1', () => {
    const s = freshState(8, { Barbara: 1 });
    expect(pick(s)).not.toBe('Barbara');
  });

  it('não escolhe a profissional reduzida só porque ela está com carga 0', () => {
    const s = freshState(0, { Mylena: 1, Cris: 1, Barbara: 1, Laura: 1, Talia: 0 });
    expect(pick(s)).not.toBe('Talia');
  });

  it('devolve a profissional reduzida ao pool quando todas as demais têm carga >= 2', () => {
    const s = freshState(0, { Mylena: 2, Cris: 2, Barbara: 2, Laura: 2, Talia: 0 });
    expect(pick(s)).toBe('Talia');
  });

  it('sem histórico de comuns, a profissional reduzida só entra após 8 atendimentos comuns', () => {
    const s = freshState(0);
    const first: Name[] = [];
    for (let t = 1; t <= 8; t++) {
      const p = pick(s);
      first.push(p);
      s.lastAny[p] = t;
      s.lastCommon[p] = t;
      s.commonEvents.push(t);
      NAMES.forEach((n) => (s.load[n] = 0));
    }
    expect(first).not.toContain('Talia');
    expect(pick(s)).toBe('Talia');
  });
});
