import { supabase } from '@/integrations/supabase/client';

/* ------------------------------------------------------------------ *
 * Regras puras (testáveis)
 * ------------------------------------------------------------------ */

/** Eventos que representam um encaminhamento real para atendimento humano. */
export const HANDOFF_EVENT_TYPES = [
  'handoff_financeiro',
  'handoff_expedicao_manual',
  'handoff_dermoconsultant',
  'handoff_parcerias',
  'handoff_comercial',
] as const;

/** Evento que representa finalização de atendimento. */
export const FINISHED_EVENT_TYPE = 'attendance_finished';

export interface HumanAttendanceFields {
  is_active: boolean;
  assigned_user_id: string | null;
  attendance_finished: boolean;
  ai_paused: boolean;
  human_takeover_required: boolean;
  handoff_type: string | null;
}

/**
 * Atendimento humano REALMENTE ativo.
 * Exclui atribuição residual (responsável preenchido, mas conversa segue com a Nina).
 */
export function isActiveHumanAttendance(c: HumanAttendanceFields): boolean {
  if (!c.is_active) return false;
  if (!c.assigned_user_id) return false;
  if (c.attendance_finished) return false;
  return Boolean(c.ai_paused || c.human_takeover_required || c.handoff_type);
}

export type StaleBucket = 'lt30m' | 'lt1h' | 'lt4h' | 'lt24h' | 'gt24h';

export function staleBucket(minutes: number): StaleBucket {
  if (minutes < 30) return 'lt30m';
  if (minutes < 60) return 'lt1h';
  if (minutes < 240) return 'lt4h';
  if (minutes < 1440) return 'lt24h';
  return 'gt24h';
}

export const STALE_BUCKET_LABEL: Record<StaleBucket, string> = {
  lt30m: 'Até 30 min',
  lt1h: '30 min – 1h',
  lt4h: '1h – 4h',
  lt24h: '4h – 24h',
  gt24h: 'Mais de 24h',
};

export function formatStaleTime(minutes: number): string {
  if (minutes < 60) return `${Math.max(0, Math.round(minutes))} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h ${Math.round(minutes % 60)}min`;
  return `${Math.floor(hours / 24)}d ${Math.floor(hours % 24)}h`;
}

/** Normaliza a transportadora gravada (histórico tem Frenet/Other/maiúsculas). */
export function normalizeCarrierLabel(carrier: string | null): 'Correios' | 'Jadlog' | 'Outros' {
  const c = (carrier ?? '').trim().toLowerCase();
  if (c === 'correios') return 'Correios';
  if (c === 'jadlog') return 'Jadlog';
  return 'Outros';
}

function periodStart(days: number): string {
  const d = new Date();
  if (days <= 1) {
    d.setHours(0, 0, 0, 0);
  } else {
    d.setDate(d.getDate() - days);
  }
  return d.toISOString();
}

/* ------------------------------------------------------------------ *
 * Consultas
 * ------------------------------------------------------------------ */

const HUMAN_CONV_FIELDS =
  'id, is_active, assigned_user_id, attendance_finished, ai_paused, human_takeover_required, handoff_type, handoff_reason, human_status, status, last_message_at, contact_id';

async function fetchActiveHumanConversations() {
  const { data } = await supabase
    .from('conversations')
    .select(HUMAN_CONV_FIELDS)
    .eq('is_active', true)
    .not('assigned_user_id', 'is', null)
    .eq('attendance_finished', false)
    .order('last_message_at', { ascending: true })
    .limit(1000);
  return (data ?? []).filter((c) => isActiveHumanAttendance(c as HumanAttendanceFields));
}

export interface OverviewMetrics {
  received: number;
  withNina: number;
  humanActive: number;
  handoffs: number;
  finished: number;
  newLeads: number;
}

export async function fetchOverviewMetrics(days: number): Promise<OverviewMetrics> {
  const since = periodStart(days);

  const [msgs, ninaConvs, humanConvs, handoffs, finished, leads] = await Promise.all([
    supabase
      .from('messages')
      .select('conversation_id')
      .eq('from_type', 'user')
      .gte('sent_at', since)
      .limit(5000),
    supabase
      .from('conversations')
      .select('id, is_active, assigned_user_id, attendance_finished, ai_paused, human_takeover_required, handoff_type')
      .eq('is_active', true)
      .eq('ai_paused', false)
      .limit(2000),
    fetchActiveHumanConversations(),
    supabase
      .from('conversation_handoff_events')
      .select('*', { count: 'exact', head: true })
      .in('event_type', HANDOFF_EVENT_TYPES as unknown as string[])
      .gte('created_at', since),
    supabase
      .from('conversation_handoff_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', FINISHED_EVENT_TYPE)
      .gte('created_at', since),
    supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since),
  ]);

  const received = new Set((msgs.data ?? []).map((m) => m.conversation_id)).size;
  const withNina = (ninaConvs.data ?? []).filter(
    (c) => !isActiveHumanAttendance(c as HumanAttendanceFields),
  ).length;

  return {
    received,
    withNina,
    humanActive: humanConvs.length,
    handoffs: handoffs.count ?? 0,
    finished: finished.count ?? 0,
    newLeads: leads.count ?? 0,
  };
}

export interface ResponsibleRow {
  teamMemberId: string;
  name: string;
  active: number;
  received: number;
  finished: number;
}

export async function fetchByResponsible(days: number): Promise<ResponsibleRow[]> {
  const since = periodStart(days);

  const [members, humanConvs, events] = await Promise.all([
    supabase.from('team_members').select('id, name, user_id, status').eq('status', 'active'),
    fetchActiveHumanConversations(),
    supabase
      .from('conversation_handoff_events')
      .select('event_type, actor_user_id, metadata, created_at')
      .in('event_type', [...HANDOFF_EVENT_TYPES, FINISHED_EVENT_TYPE])
      .gte('created_at', since)
      .limit(2000),
  ]);

  const rows = new Map<string, ResponsibleRow>();
  const byUserId = new Map<string, string>();
  for (const m of members.data ?? []) {
    rows.set(m.id, { teamMemberId: m.id, name: m.name, active: 0, received: 0, finished: 0 });
    if (m.user_id) byUserId.set(m.user_id, m.id);
  }

  for (const c of humanConvs) {
    const row = rows.get(c.assigned_user_id as string);
    if (row) row.active += 1;
  }

  for (const e of events.data ?? []) {
    if (e.event_type === FINISHED_EVENT_TYPE) {
      const id = e.actor_user_id ? byUserId.get(e.actor_user_id) : undefined;
      if (id) rows.get(id)!.finished += 1;
    } else {
      const meta = (e.metadata ?? {}) as Record<string, unknown>;
      const target = (meta.assigned_team_member_id ?? meta.team_member_id) as string | undefined;
      if (target && rows.has(target)) rows.get(target)!.received += 1;
    }
  }

  return [...rows.values()].sort(
    (a, b) => b.active - a.active || b.received - a.received || a.name.localeCompare(b.name),
  );
}

export interface QueueItem {
  conversationId: string;
  contactName: string;
  responsible: string;
  reason: string | null;
  lastActivity: string | null;
  staleMinutes: number;
  bucket: StaleBucket;
  status: string;
}

export async function fetchAttentionQueue(): Promise<QueueItem[]> {
  const convs = await fetchActiveHumanConversations();
  if (convs.length === 0) return [];

  const contactIds = [...new Set(convs.map((c) => c.contact_id))];
  const memberIds = [...new Set(convs.map((c) => c.assigned_user_id as string))];

  const [contacts, members] = await Promise.all([
    supabase.from('contacts').select('id, name, call_name').in('id', contactIds),
    supabase.from('team_members').select('id, name').in('id', memberIds),
  ]);

  const contactName = new Map((contacts.data ?? []).map((c) => [c.id, c.call_name || c.name || 'Cliente']));
  const memberName = new Map((members.data ?? []).map((m) => [m.id, m.name]));
  const now = Date.now();

  return convs
    .map((c) => {
      const last = c.last_message_at ? new Date(c.last_message_at).getTime() : now;
      const staleMinutes = Math.max(0, (now - last) / 60000);
      return {
        conversationId: c.id,
        contactName: contactName.get(c.contact_id) ?? 'Cliente',
        responsible: memberName.get(c.assigned_user_id as string) ?? 'Responsável',
        reason: c.handoff_reason ?? null,
        lastActivity: c.last_message_at ?? null,
        staleMinutes,
        bucket: staleBucket(staleMinutes),
        status: c.human_status ?? c.status ?? '—',
      };
    })
    .sort((a, b) => b.staleMinutes - a.staleMinutes);
}

export interface TrackingMetrics {
  sent: number;
  correios: number;
  jadlog: number;
  others: number;
  automatic: number;
  manual: number;
  duplicates: number;
  failures: number;
  undetermined: number;
  manualByUser: { label: string; count: number }[];
}

export async function fetchTrackingMetrics(days: number): Promise<TrackingMetrics> {
  const since = periodStart(days);

  const [locks, manualLogs, shopifyEvents] = await Promise.all([
    supabase
      .from('tracking_send_locks')
      .select('status, source, carrier, created_at')
      .gte('created_at', since)
      .limit(2000),
    supabase
      .from('manual_tracking_logs')
      .select('status, requested_by, requested_by_role, lock_id, created_at')
      .gte('created_at', since)
      .limit(2000),
    supabase
      .from('shopify_events')
      .select('send_status, created_at')
      .gte('created_at', since)
      .limit(3000),
  ]);

  const lockRows = locks.data ?? [];
  const sentRows = lockRows.filter((l) => l.status === 'sent');

  const manualRows = manualLogs.data ?? [];
  const events = shopifyEvents.data ?? [];

  const manualByUserMap = new Map<string, number>();
  for (const m of manualRows) {
    if (m.status !== 'sent' && m.status !== 'queued') continue;
    const key = m.requested_by_role || 'expedição';
    manualByUserMap.set(key, (manualByUserMap.get(key) ?? 0) + 1);
  }

  return {
    sent: sentRows.length,
    correios: sentRows.filter((l) => normalizeCarrierLabel(l.carrier) === 'Correios').length,
    jadlog: sentRows.filter((l) => normalizeCarrierLabel(l.carrier) === 'Jadlog').length,
    others: sentRows.filter((l) => normalizeCarrierLabel(l.carrier) === 'Outros').length,
    automatic: sentRows.filter((l) => (l.source ?? '').startsWith('shopify')).length,
    manual: sentRows.filter((l) => (l.source ?? '').startsWith('manual')).length,
    duplicates:
      manualRows.filter((m) => m.status === 'duplicate').length +
      events.filter((e) => e.send_status === 'skipped_duplicate').length,
    failures:
      lockRows.filter((l) => l.status === 'failed').length +
      manualRows.filter((m) => m.status === 'failed' && !m.lock_id).length,
    undetermined: events.filter((e) => e.send_status === 'no_tracking').length,
    manualByUser: [...manualByUserMap.entries()].map(([label, count]) => ({ label, count })),
  };
}

/** Volume diário de mensagens (gráfico). */
export async function fetchMessageVolume(days: number): Promise<{ name: string; chats: number }[]> {
  const since = periodStart(days <= 1 ? 7 : days);
  const { data } = await supabase
    .from('messages')
    .select('sent_at')
    .gte('sent_at', since)
    .limit(10000);

  const buckets = new Map<string, number>();
  const span = days <= 1 ? 7 : days;
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const m of data ?? []) {
    const key = String(m.sent_at).slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([key, chats]) => ({
    name: key.slice(8, 10) + '/' + key.slice(5, 7),
    chats,
  }));
}
