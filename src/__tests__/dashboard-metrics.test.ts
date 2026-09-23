import { describe, it, expect } from 'vitest';
import {
  isActiveHumanAttendance,
  staleBucket,
  normalizeCarrierLabel,
  formatStaleTime,
  HANDOFF_EVENT_TYPES,
  FINISHED_EVENT_TYPE,
} from '@/services/dashboardMetrics';

const base = {
  is_active: true,
  assigned_user_id: 'tm-1',
  attendance_finished: false,
  ai_paused: false,
  human_takeover_required: false,
  handoff_type: null as string | null,
};

describe('atendimento humano realmente ativo', () => {
  it('conta handoff real (Leticia/financeiro)', () => {
    expect(isActiveHumanAttendance({ ...base, ai_paused: true, handoff_type: 'financeiro' })).toBe(true);
  });

  it('conta dermoconsultora com takeover humano', () => {
    expect(isActiveHumanAttendance({ ...base, human_takeover_required: true })).toBe(true);
  });

  it('NÃO conta atribuição residual (caso da Duda)', () => {
    expect(isActiveHumanAttendance(base)).toBe(false);
  });

  it('NÃO conta sem responsável', () => {
    expect(isActiveHumanAttendance({ ...base, assigned_user_id: null, ai_paused: true })).toBe(false);
  });

  it('NÃO conta atendimento finalizado', () => {
    expect(isActiveHumanAttendance({ ...base, ai_paused: true, attendance_finished: true })).toBe(false);
  });

  it('NÃO conta conversa inativa', () => {
    expect(isActiveHumanAttendance({ ...base, ai_paused: true, is_active: false })).toBe(false);
  });
});

describe('faixas de tempo parado', () => {
  it('classifica corretamente', () => {
    expect(staleBucket(5)).toBe('lt30m');
    expect(staleBucket(45)).toBe('lt1h');
    expect(staleBucket(120)).toBe('lt4h');
    expect(staleBucket(600)).toBe('lt24h');
    expect(staleBucket(2000)).toBe('gt24h');
  });

  it('formata o tempo', () => {
    expect(formatStaleTime(10)).toBe('10 min');
    expect(formatStaleTime(90)).toContain('1h');
    expect(formatStaleTime(3000)).toContain('d');
  });
});

describe('normalização de transportadora', () => {
  it('reconhece Correios e Jadlog em qualquer caixa', () => {
    expect(normalizeCarrierLabel('Correios')).toBe('Correios');
    expect(normalizeCarrierLabel('correios')).toBe('Correios');
    expect(normalizeCarrierLabel('jadlog')).toBe('Jadlog');
  });

  it('histórico antigo vira Outros', () => {
    expect(normalizeCarrierLabel('Frenet')).toBe('Outros');
    expect(normalizeCarrierLabel('Other')).toBe('Outros');
    expect(normalizeCarrierLabel(null)).toBe('Outros');
  });
});

describe('eventos contados', () => {
  it('reativação, resposta e reabertura não são encaminhamento', () => {
    for (const t of ['nina_reactivated', 'expedicao_reply', 'reopened_by_message', 'dermo_reply']) {
      expect((HANDOFF_EVENT_TYPES as readonly string[]).includes(t)).toBe(false);
    }
  });

  it('finalização usa o evento real', () => {
    expect(FINISHED_EVENT_TYPE).toBe('attendance_finished');
  });
});
