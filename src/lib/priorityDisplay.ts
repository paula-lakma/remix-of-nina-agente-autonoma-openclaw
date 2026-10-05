// Exibição da prioridade já calculada no servidor (_shared/priority.ts).
// Aqui só se traduz o resultado e se ordena a lista; nada é reclassificado.

export type PriorityLevel = 'CRITICAL' | 'HIGH' | 'NORMAL';

export interface PriorityInfo {
  priority_level: PriorityLevel;
  priority_reasons: string[];
  waiting: boolean;
  waiting_since: string | null;
  waiting_minutes: number | null;
  contact_attempt_number: number | null;
}

const RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, NORMAL: 2 };

export const levelRank = (p?: PriorityInfo | null) => RANK[p?.priority_level ?? 'NORMAL'] ?? 2;

export const LEVEL_LABEL: Record<PriorityLevel, string> = { CRITICAL: 'CRÍTICO', HIGH: 'ALTO', NORMAL: 'NORMAL' };

/** Texto do tempo de espera; usa waiting_since com o relógio atual (só o texto muda). */
export function formatWaiting(p: PriorityInfo, now: number = Date.now()): string | null {
  let minutes: number | null = null;
  if (p.waiting_since) minutes = Math.max(0, Math.floor((now - new Date(p.waiting_since).getTime()) / 60000));
  else if (p.waiting_minutes != null) minutes = p.waiting_minutes;
  if (minutes == null) return null;
  if (minutes < 24 * 60) return `${Math.max(1, Math.floor(minutes / 60))} h aguardando`;
  const days = Math.floor(minutes / (24 * 60));
  return `${days} ${days === 1 ? 'dia' : 'dias'} aguardando`;
}

/** Traduz os motivos, na ordem vinda do servidor. */
export function reasonTexts(p: PriorityInfo, now: number = Date.now()): string[] {
  const out: string[] = [];
  for (const r of p.priority_reasons ?? []) {
    if (r === 'legal_escalation') out.push('Possível medida judicial');
    else if (r === 'angry_customer') out.push('Cliente irritado');
    else if (r === 'repeated_contact') {
      const n = p.contact_attempt_number;
      out.push(n && n >= 2 ? `${n}º contato` : 'Contato repetido');
    } else if (r === 'waiting_over_7_days') {
      out.push(formatWaiting(p, now) ?? 'Mais de 7 dias aguardando');
    }
  }
  return out;
}

/** Destaque forte só para CRITICAL/HIGH. */
export const isHighlighted = (p?: PriorityInfo | null) =>
  p?.priority_level === 'CRITICAL' || p?.priority_level === 'HIGH';

/** CRITICAL > HIGH > NORMAL; dentro do nível mantém a ordem original (estável). */
export function sortByPriority<T extends { priority?: PriorityInfo | null }>(list: T[]): T[] {
  return list
    .map((item, i) => ({ item, i }))
    .sort((a, b) => levelRank(a.item.priority) - levelRank(b.item.priority) || a.i - b.i)
    .map((x) => x.item);
}
