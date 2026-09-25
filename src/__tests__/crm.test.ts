import { describe, it, expect } from 'vitest';
import { buildSearchOr, buildTimeline, followupBucket, matchInterestKey, ninaSuggestions, INTEREST_KEYS } from '@/lib/crm';

describe('CRM V1 — regras puras', () => {
  it('lista de interesses fixa', () => {
    expect(INTEREST_KEYS).toEqual(['manchas', 'acne', 'peeling', 'rejuvenescimento', 'limpeza_de_pele', 'corporal', 'outro']);
  });

  it('busca global inclui nome, apelido, e-mail e telefone', () => {
    const q = buildSearchOr('Denise 3799')!;
    expect(q).toContain('name.ilike.*Denise 3799*');
    expect(q).toContain('call_name.ilike');
    expect(q).toContain('email.ilike');
    expect(q).toContain('phone_number.ilike.*3799*');
    expect(buildSearchOr('   ')).toBeNull();
  });

  it('classifica follow-ups', () => {
    const now = new Date('2026-09-25T15:00:00');
    expect(followupBucket({ status: 'open', due_at: '2026-09-24T12:00:00', has_time: false }, now)).toBe('overdue');
    expect(followupBucket({ status: 'open', due_at: '2026-09-25T12:00:00', has_time: false }, now)).toBe('today');
    expect(followupBucket({ status: 'open', due_at: '2026-09-25T10:00:00', has_time: true }, now)).toBe('overdue');
    expect(followupBucket({ status: 'open', due_at: '2026-09-28T10:00:00', has_time: true }, now)).toBe('week');
    expect(followupBucket({ status: 'open', due_at: '2026-10-20T10:00:00', has_time: true }, now)).toBe('later');
    expect(followupBucket({ status: 'done', due_at: '2026-09-20T10:00:00', has_time: true }, now)).toBe('done');
  });

  it('sugestões da Nina só leem a memória', () => {
    const mem = { lead_profile: { interests: ['melasma', ''], products_discussed: ['Kit Ácidos'] }, sales_intelligence: { next_best_action: 'qualify' } };
    const s = ninaSuggestions(mem);
    expect(s.interests).toEqual(['melasma']);
    expect(s.products).toEqual(['Kit Ácidos']);
    expect(s.nextAction).toBeNull();
    expect(ninaSuggestions(null).interests).toEqual([]);
    expect(matchInterestKey('melasma')).toBe('manchas');
    expect(matchInterestKey('Limpeza de pele')).toBe('limpeza_de_pele');
    expect(matchInterestKey('frete')).toBeNull();
  });

  it('linha do tempo usa só eventos reais e ignora notas apagadas', () => {
    const t = buildTimeline({
      contactCreatedAt: '2026-09-01T10:00:00Z',
      events: [
        { event_type: 'handoff_comercial', created_at: '2026-09-02T10:00:00Z', handoff_reason: 'distribuição' },
        { event_type: 'attendance_finished', created_at: '2026-09-03T10:00:00Z' },
        { event_type: 'dermo_reply', created_at: '2026-09-02T11:00:00Z' },
      ],
      notes: [
        { created_at: '2026-09-04T10:00:00Z', content: 'ok', deleted_at: null },
        { created_at: '2026-09-05T10:00:00Z', content: 'x', deleted_at: '2026-09-05T11:00:00Z' },
      ],
      followups: [{ created_at: '2026-09-04T12:00:00Z', reason: 'retornar', status: 'done', completed_at: '2026-09-06T10:00:00Z', canceled_at: null }],
    });
    expect(t.map((x) => x.kind)).toEqual(['followup_done', 'followup_created', 'note', 'finished', 'handoff', 'contact_created']);
  });
});
