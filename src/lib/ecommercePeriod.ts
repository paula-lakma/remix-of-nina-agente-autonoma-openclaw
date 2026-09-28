// Períodos do Dashboard E-commerce (fuso comercial America/Sao_Paulo, UTC-3 fixo).
export type PeriodKind = 'today' | '7days' | '30days' | '90days' | 'custom';
export type Bucket = 'hour' | 'day' | 'week';

export const SALES_TZ = 'America/Sao_Paulo';
export const HISTORY_FALLBACK_START = '2026-07-28';

export interface ResolvedPeriod {
  fromDay: string; // inclusivo (YYYY-MM-DD, SP)
  toDayExclusive: string;
  from: string; // ISO com offset
  to: string;
  prevFrom: string;
  prevTo: string;
  days: number;
  bucket: Bucket;
  clampedToHistory: boolean;
}

export const spDayStartIso = (day: string) => `${day}T00:00:00-03:00`;

export function todaySP(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SALES_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function toSPDay(iso: string): string {
  return todaySP(new Date(iso));
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86400000);
}

export function bucketFor(days: number): Bucket {
  if (days <= 1) return 'hour';
  if (days <= 60) return 'day';
  return 'week';
}

const KIND_DAYS: Record<Exclude<PeriodKind, 'custom'>, number> = { today: 1, '7days': 7, '30days': 30, '90days': 90 };

export function resolvePeriod(
  kind: PeriodKind,
  opts: { now?: Date; historyStart?: string; custom?: { from: string; to: string } } = {},
): ResolvedPeriod {
  const today = todaySP(opts.now);
  const historyStart = opts.historyStart || HISTORY_FALLBACK_START;
  let fromDay: string;
  let toDayExclusive: string;
  if (kind === 'custom' && opts.custom) {
    const [a, b] = opts.custom.from <= opts.custom.to ? [opts.custom.from, opts.custom.to] : [opts.custom.to, opts.custom.from];
    fromDay = a;
    toDayExclusive = addDays(b, 1);
  } else {
    const n = KIND_DAYS[kind as Exclude<PeriodKind, 'custom'>] ?? 1;
    toDayExclusive = addDays(today, 1);
    fromDay = addDays(toDayExclusive, -n);
  }
  let clampedToHistory = false;
  if (fromDay < historyStart) {
    fromDay = historyStart;
    clampedToHistory = true;
    if (toDayExclusive <= fromDay) toDayExclusive = addDays(fromDay, 1);
  }
  const days = diffDays(fromDay, toDayExclusive);
  const prevFromDay = addDays(fromDay, -days);
  return {
    fromDay,
    toDayExclusive,
    from: spDayStartIso(fromDay),
    to: spDayStartIso(toDayExclusive),
    prevFrom: spDayStartIso(prevFromDay),
    prevTo: spDayStartIso(fromDay),
    days,
    bucket: bucketFor(days),
    clampedToHistory,
  };
}

// Comparação só quando o período anterior está inteiro dentro do histórico e tem pedidos.
export function canCompare(prevFromIso: string, firstOrderAt: string | null | undefined, prevOrders: number): boolean {
  if (!firstOrderAt || prevOrders <= 0) return false;
  const historyStartIso = spDayStartIso(toSPDay(firstOrderAt));
  return new Date(prevFromIso).getTime() >= new Date(historyStartIso).getTime();
}

export function pctChange(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

export function formatDayBR(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}
