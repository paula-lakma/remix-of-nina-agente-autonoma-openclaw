import { describe, it, expect } from 'vitest';

/**
 * Simulação da regra de public.pick_next_dermoconsultora() / pick_dermo_assignee():
 *  - elegíveis = dermoconsultoras com status active (Duda, Barbara, Talia, Laura);
 *  - sem peso: carga ativa ASC, último handoff ASC NULLS FIRST, id ASC;
 *  - motivo sensível → Laura direto; Laura inativa → balanceamento normal.
 */

type Name = 'Duda' | 'Barbara' | 'Talia' | 'Laura' | 'Mylena' | 'Cris';
const ACTIVE: Record<Name, boolean> = {
  Duda: true, Barbara: true, Talia: true, Laura: true, Mylena: false, Cris: false,
};
const ALL = Object.keys(ACTIVE) as Name[];

interface State { load: Record<Name, number>; last: Record<Name, number | null>; active: Record<Name, boolean> }

function fresh(): State {
  return {
    load: Object.fromEntries(ALL.map((n) => [n, 0])) as Record<Name, number>,
    last: Object.fromEntries(ALL.map((n) => [n, null])) as Record<Name, number | null>,
    active: { ...ACTIVE },
  };
}

function pickNormal(s: State): Name {
  return ALL.filter((n) => s.active[n]).sort(
    (a, b) => s.load[a] - s.load[b] || (s.last[a] ?? -1) - (s.last[b] ?? -1) || a.localeCompare(b),
  )[0];
}

function pickAssignee(s: State, sensitive: boolean): { who: Name; mode: string } {
  if (sensitive) {
    if (s.active.Laura) return { who: 'Laura', mode: 'sensitive_direct' };
    return { who: pickNormal(s), mode: 'sensitive_fallback' };
  }
  return { who: pickNormal(s), mode: 'balanced' };
}

function run(rounds: number) {
  const s = fresh();
  const count = Object.fromEntries(ALL.map((n) => [n, 0])) as Record<Name, number>;
  for (let t = 1; t <= rounds; t++) {
    const p = pickNormal(s);
    count[p]++;
    s.last[p] = t;
  }
  return count;
}

describe('equipe dermo: Duda, Barbara, Talia e Laura em igualdade', () => {
  it('Mylena e Cris nunca recebem atendimento novo', () => {
    const c = run(40);
    expect(c.Mylena).toBe(0);
    expect(c.Cris).toBe(0);
  });

  it('as quatro ativas recebem a mesma quantidade (Talia sem peso reduzido, Laura no normal)', () => {
    const c = run(40);
    expect(c.Duda).toBe(10);
    expect(c.Barbara).toBe(10);
    expect(c.Talia).toBe(10);
    expect(c.Laura).toBe(10);
  });

  it('quem tem menos carga ativa ganha', () => {
    const s = fresh();
    s.load.Barbara = 1; s.load.Duda = 1; s.load.Laura = 1;
    expect(pickNormal(s)).toBe('Talia');
  });

  it('caso sensível vai direto para a Laura', () => {
    const s = fresh();
    s.load.Laura = 3;
    expect(pickAssignee(s, true)).toEqual({ who: 'Laura', mode: 'sensitive_direct' });
  });

  it('Laura indisponível em caso sensível usa uma das demais ativas', () => {
    const s = fresh();
    s.active.Laura = false;
    const r = pickAssignee(s, true);
    expect(r.mode).toBe('sensitive_fallback');
    expect(['Duda', 'Barbara', 'Talia']).toContain(r.who);
  });
});
