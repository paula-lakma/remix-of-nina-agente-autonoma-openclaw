import { describe, it, expect } from 'vitest';

// Espelho da decisão do dropdown "Responsável" no Chat ao Vivo
// (ChatInterface.tsx). A autorização real é validada no backend
// (admin_assign_expedicao / admin_clear_expedicao_assignment).
type Action = 'expedicao_handoff' | 'confirm_unassign' | 'clear_and_assign' | 'plain_assign';

const decide = (
  current: string | null,
  next: string | null,
  logisticIds: string[]
): Action => {
  const currentIsLogistic = !!current && logisticIds.includes(current);
  const nextIsLogistic = !!next && logisticIds.includes(next);
  if (nextIsLogistic) return 'expedicao_handoff';
  if (currentIsLogistic && !next) return 'confirm_unassign';
  if (currentIsLogistic) return 'clear_and_assign';
  return 'plain_assign';
};

const LETICIA = 'tm-leticia';
const OUTRA = 'tm-mylena';
const IDS = [LETICIA];

describe('roteamento do dropdown Responsável', () => {
  it('Nina -> Leticia executa o handoff logístico completo', () => {
    expect(decide(null, LETICIA, IDS)).toBe('expedicao_handoff');
  });

  it('selecionar Leticia novamente continua indo pelo fluxo idempotente do backend', () => {
    expect(decide(LETICIA, LETICIA, IDS)).toBe('expedicao_handoff');
  });

  it('Leticia -> outra pessoa limpa o estado logístico antes de atribuir', () => {
    expect(decide(LETICIA, OUTRA, IDS)).toBe('clear_and_assign');
  });

  it('Leticia -> Não atribuído pede confirmação explícita', () => {
    expect(decide(LETICIA, null, IDS)).toBe('confirm_unassign');
  });

  it('membros comuns mantêm o comportamento atual', () => {
    expect(decide(null, OUTRA, IDS)).toBe('plain_assign');
    expect(decide(OUTRA, null, IDS)).toBe('plain_assign');
    expect(decide(OUTRA, OUTRA, IDS)).toBe('plain_assign');
  });

  it('sem membros logísticos configurados nada muda', () => {
    expect(decide(null, LETICIA, [])).toBe('plain_assign');
    expect(decide(LETICIA, null, [])).toBe('plain_assign');
  });
});
