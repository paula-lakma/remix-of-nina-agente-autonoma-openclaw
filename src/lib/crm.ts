// Regras puras do CRM V1 (sem acesso ao banco) — testáveis.

export const INTEREST_KEYS = [
  'manchas', 'acne', 'peeling', 'rejuvenescimento', 'limpeza_de_pele', 'corporal', 'outro',
] as const;
export type InterestKey = typeof INTEREST_KEYS[number];

export const INTEREST_LABEL: Record<InterestKey, string> = {
  manchas: 'Manchas',
  acne: 'Acne',
  peeling: 'Peeling',
  rejuvenescimento: 'Rejuvenescimento',
  limpeza_de_pele: 'Limpeza de pele',
  corporal: 'Corporal',
  outro: 'Outro',
};

export const CONTACT_TYPES = [
  'profissional_estetica', 'cliente_final', 'distribuidor', 'influenciador', 'outro',
] as const;
export type ContactType = typeof CONTACT_TYPES[number];

export const CONTACT_TYPE_LABEL: Record<ContactType, string> = {
  profissional_estetica: 'Profissional de estética',
  cliente_final: 'Cliente final',
  distribuidor: 'Distribuidor',
  influenciador: 'Influenciador',
  outro: 'Outro',
};

export type FollowupStatus = 'open' | 'done' | 'canceled';
export type FollowupBucket = 'overdue' | 'today' | 'week' | 'later' | 'done' | 'canceled';

export const FOLLOWUP_BUCKET_LABEL: Record<FollowupBucket, string> = {
  overdue: 'Vencidos',
  today: 'Hoje',
  week: 'Próximos 7 dias',
  later: 'Mais adiante',
  done: 'Concluídos',
  canceled: 'Cancelados',
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Classifica um follow-up. Sem horário: vence no fim do dia marcado. */
export function followupBucket(
  f: { status: FollowupStatus; due_at: string; has_time: boolean },
  now: Date = new Date(),
): FollowupBucket {
  if (f.status === 'done') return 'done';
  if (f.status === 'canceled') return 'canceled';
  const due = new Date(f.due_at);
  const today0 = startOfDay(now);
  const tomorrow0 = new Date(today0.getTime() + 86400000);
  const week0 = new Date(today0.getTime() + 8 * 86400000);
  const overdue = f.has_time ? due < now : due < today0;
  if (overdue) return 'overdue';
  if (due < tomorrow0) return 'today';
  if (due < week0) return 'week';
  return 'later';
}

/**
 * Sugestões da Nina: somente leitura da memória (client_memory).
 * Nunca grava nada — o interesse só vira confirmado por clique humano.
 */
export function ninaSuggestions(memory: any): { interests: string[]; products: string[]; nextAction: string | null; summary: string | null } {
  const lp = memory?.lead_profile ?? {};
  const si = memory?.sales_intelligence ?? {};
  const clean = (arr: unknown) =>
    Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && x.trim()).map((x: string) => x.trim()) : [];
  const na = typeof si.next_best_action === 'string' && si.next_best_action.trim() && si.next_best_action !== 'qualify'
    ? si.next_best_action.trim() : null;
  const reason = memory?.interaction_summary?.last_contact_reason;
  return {
    interests: clean(lp.interests),
    products: clean(lp.products_discussed),
    nextAction: na,
    summary: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
  };
}

/** Tenta casar uma sugestão textual com uma chave da lista (para o botão "confirmar"). */
export function matchInterestKey(text: string): InterestKey | null {
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/mancha|melasma|hiperpigment/.test(t)) return 'manchas';
  if (/acne|espinha/.test(t)) return 'acne';
  if (/peeling/.test(t)) return 'peeling';
  if (/rejuven|ruga|anti.?idade|envelhec/.test(t)) return 'rejuvenescimento';
  if (/limpeza/.test(t)) return 'limpeza_de_pele';
  if (/corpor|celulite|estria|gordura/.test(t)) return 'corporal';
  return null;
}

// ---------- Linha do tempo (montada só com fontes que têm data confiável) ----------

export interface TimelineItem {
  at: string;
  kind: 'contact_created' | 'handoff' | 'finished' | 'reactivated' | 'reopened' | 'assumed' | 'note' | 'followup_created' | 'followup_done' | 'followup_canceled';
  title: string;
  detail?: string | null;
}

const HANDOFF_LABEL: Record<string, string> = {
  handoff_financeiro: 'Encaminhado para logística/financeiro',
  handoff_expedicao_manual: 'Encaminhado para expedição',
  handoff_dermoconsultant: 'Encaminhado para dermoconsultora',
  handoff_parcerias: 'Encaminhado para parcerias',
  handoff_comercial: 'Encaminhado para comercial',
};

export function buildTimeline(input: {
  contactCreatedAt: string;
  events: { event_type: string; created_at: string; handoff_reason?: string | null }[];
  notes: { created_at: string; content: string; deleted_at: string | null; authorName?: string }[];
  followups: { created_at: string; reason: string; status: FollowupStatus; completed_at: string | null; canceled_at: string | null }[];
}): TimelineItem[] {
  const out: TimelineItem[] = [{ at: input.contactCreatedAt, kind: 'contact_created', title: 'Contato criado' }];
  for (const e of input.events) {
    if (e.event_type.startsWith('handoff_')) {
      out.push({ at: e.created_at, kind: 'handoff', title: HANDOFF_LABEL[e.event_type] ?? 'Encaminhado para humano', detail: e.handoff_reason ?? null });
    } else if (e.event_type === 'attendance_finished') {
      out.push({ at: e.created_at, kind: 'finished', title: 'Atendimento finalizado' });
    } else if (e.event_type === 'nina_reactivated') {
      out.push({ at: e.created_at, kind: 'reactivated', title: 'Nina reativada' });
    } else if (e.event_type === 'reopened_by_message') {
      out.push({ at: e.created_at, kind: 'reopened', title: 'Reaberto por nova mensagem' });
    } else if (e.event_type === 'assumed') {
      out.push({ at: e.created_at, kind: 'assumed', title: 'Atendimento assumido' });
    }
  }
  for (const n of input.notes) {
    if (n.deleted_at) continue;
    out.push({ at: n.created_at, kind: 'note', title: `Nota${n.authorName ? ` de ${n.authorName}` : ''}`, detail: n.content.slice(0, 140) });
  }
  for (const f of input.followups) {
    out.push({ at: f.created_at, kind: 'followup_created', title: 'Follow-up criado', detail: f.reason });
    if (f.status === 'done' && f.completed_at) out.push({ at: f.completed_at, kind: 'followup_done', title: 'Follow-up concluído', detail: f.reason });
    if (f.status === 'canceled' && f.canceled_at) out.push({ at: f.canceled_at, kind: 'followup_canceled', title: 'Follow-up cancelado', detail: f.reason });
  }
  return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

/** Monta o filtro de busca global (nome, apelido, e-mail, telefone). */
export function buildSearchOr(term: string): string | null {
  const t = term.trim().replace(/[,()*%]/g, ' ').trim();
  if (!t) return null;
  const parts = [`name.ilike.*${t}*`, `call_name.ilike.*${t}*`, `email.ilike.*${t}*`];
  const digits = t.replace(/\D/g, '');
  if (digits.length >= 3) parts.push(`phone_number.ilike.*${digits}*`);
  return parts.join(',');
}
