// Formatação temporal única do Chat. Sempre America/Sao_Paulo, nunca o fuso
// do navegador. Todas as funções recebem o timestamp REAL (sent_at /
// last_message_at); `now` só serve para decidir "hoje/ontem".
export const CHAT_TZ = 'America/Sao_Paulo';

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: CHAT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: CHAT_TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const dateFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: CHAT_TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const toDate = (v: string | number | Date) => (v instanceof Date ? v : new Date(v));
const valid = (d: Date) => !Number.isNaN(d.getTime());

/** Chave do dia local em São Paulo: "YYYY-MM-DD". */
export function chatDayKey(v: string | number | Date): string {
  const d = toDate(v);
  return valid(d) ? dayFmt.format(d) : '';
}

/** Diferença em dias de calendário (São Paulo) entre `now` e `v`. */
function dayDiff(v: Date, now: Date): number {
  const a = Date.parse(`${chatDayKey(v)}T00:00:00Z`);
  const b = Date.parse(`${chatDayKey(now)}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/** Bolha: hoje "14:32"; outro dia "04/10/2026 14:32". */
export function formatBubbleTime(v: string | null | undefined, now: Date = new Date()): string {
  if (!v) return '';
  const d = toDate(v);
  if (!valid(d)) return '';
  const t = timeFmt.format(d);
  return chatDayKey(d) === chatDayKey(now) ? t : `${dateFmt.format(d)} ${t}`;
}

/** Separador: "Hoje", "Ontem" ou "03/10/2026". */
export function formatDayLabel(v: string | null | undefined, now: Date = new Date()): string {
  if (!v) return '';
  const d = toDate(v);
  if (!valid(d)) return '';
  const diff = dayDiff(d, now);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  return dateFmt.format(d);
}

/** Lista lateral: hoje "09:42"; ontem "Ontem"; até 6 dias "seg"; senão "DD/MM/AAAA". */
export function formatSidebarTime(v: string | null | undefined, now: Date = new Date()): string {
  if (!v) return '';
  const d = toDate(v);
  if (!valid(d)) return '';
  const diff = dayDiff(d, now);
  if (diff <= 0) return timeFmt.format(d);
  if (diff === 1) return 'Ontem';
  if (diff <= 6) return WEEKDAYS[new Date(`${chatDayKey(d)}T12:00:00Z`).getUTCDay()];
  return dateFmt.format(d);
}

/** Índices das mensagens (em ordem) que abrem um novo dia — onde vai o separador. */
export function daySeparatorIndexes(timestamps: (string | null | undefined)[]): Set<number> {
  const out = new Set<number>();
  let prev = '';
  timestamps.forEach((ts, i) => {
    const key = ts ? chatDayKey(ts) : '';
    if (key && key !== prev) { out.add(i); prev = key; }
  });
  return out;
}

/** O mais recente entre vários timestamps (ignora vazios). */
export function latestTimestamp(...vals: (string | null | undefined)[]): string | undefined {
  let best: string | undefined;
  let bt = -Infinity;
  for (const v of vals) {
    if (!v) continue;
    const t = Date.parse(v);
    if (!Number.isNaN(t) && t > bt) { bt = t; best = v; }
  }
  return best;
}
