// Serviço do CRM V1. Apenas LÊ Chat/Nina/Pipeline e GRAVA somente nas tabelas crm_*.
import { supabase } from '@/integrations/supabase/client';
import { isActiveHumanAttendance } from '@/services/dashboardMetrics';
import { buildSearchOr, type ContactType, type FollowupStatus, type InterestKey } from '@/lib/crm';

const db = supabase as any;
export const CRM_PAGE_SIZE = 50;

export type NextActionFilter = '' | 'overdue' | 'today' | 'week' | 'any';

export interface CrmListFilters {
  page: number;
  search: string;
  contactType: '' | ContactType;
  assignedTeamMemberId: string;
  stageId: string;
  nextAction: NextActionFilter;
}

export interface CrmListRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  lastActivity: string;
  contactType: ContactType | null;
  responsibleName: string | null;
  humanActive: boolean;
  stageTitle: string | null;
  stageColor: string | null;
  nextFollowup: { due_at: string; has_time: boolean; reason: string } | null;
  conversationId: string | null;
}

export interface StaffUser { user_id: string; display_name: string; role: string | null }

export async function listStaff(): Promise<StaffUser[]> {
  const { data, error } = await db.rpc('crm_list_staff');
  if (error) throw error;
  return (data ?? []).sort((a: StaffUser, b: StaffUser) => a.display_name.localeCompare(b.display_name));
}

export async function userNames(ids: string[]): Promise<Record<string, string>> {
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (!uniq.length) return {};
  const { data } = await db.rpc('crm_user_names', { _ids: uniq });
  const map: Record<string, string> = {};
  for (const r of data ?? []) map[r.user_id] = r.display_name;
  return map;
}

export async function listTeamMembers(): Promise<{ id: string; name: string }[]> {
  const { data } = await db.from('team_members').select('id,name').eq('status', 'active').order('name');
  return data ?? [];
}

export async function listStages(): Promise<{ id: string; title: string; color: string }[]> {
  const { data } = await db.from('pipeline_stages').select('id,title,color,position').eq('is_active', true).order('position');
  return data ?? [];
}

function dayBounds() {
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const t1 = new Date(t0.getTime() + 86400000);
  const w = new Date(t0.getTime() + 8 * 86400000);
  return { t0: t0.toISOString(), t1: t1.toISOString(), w: w.toISOString() };
}

/** Lista paginada no servidor sobre TODOS os contatos. Filtros por junção interna. */
export async function listContacts(f: CrmListFilters): Promise<{ rows: CrmListRow[]; total: number }> {
  const embeds: string[] = [];
  if (f.contactType) embeds.push('crm_contact_profiles!inner(contact_type)');
  if (f.assignedTeamMemberId) embeds.push('conversations!inner(assigned_user_id)');
  if (f.stageId) embeds.push('deals!inner(stage_id,won_at,lost_at)');
  if (f.nextAction) embeds.push('crm_followups!inner(status,due_at)');
  const select = ['id,name,call_name,phone_number,email,last_activity', ...embeds].join(',');

  let q = db.from('contacts').select(select, { count: 'exact' });
  const or = buildSearchOr(f.search);
  if (or) q = q.or(or);
  if (f.contactType) q = q.eq('crm_contact_profiles.contact_type', f.contactType);
  if (f.assignedTeamMemberId) q = q.eq('conversations.assigned_user_id', f.assignedTeamMemberId);
  if (f.stageId) q = q.eq('deals.stage_id', f.stageId).is('deals.won_at', null).is('deals.lost_at', null);
  if (f.nextAction) {
    const { t0, t1, w } = dayBounds();
    q = q.eq('crm_followups.status', 'open');
    if (f.nextAction === 'overdue') q = q.lt('crm_followups.due_at', t0);
    if (f.nextAction === 'today') q = q.gte('crm_followups.due_at', t0).lt('crm_followups.due_at', t1);
    if (f.nextAction === 'week') q = q.gte('crm_followups.due_at', t0).lt('crm_followups.due_at', w);
  }
  const from = f.page * CRM_PAGE_SIZE;
  const { data, error, count } = await q.order('last_activity', { ascending: false }).range(from, from + CRM_PAGE_SIZE - 1);
  if (error) throw error;
  const contacts = data ?? [];
  const ids = contacts.map((c: any) => c.id);
  if (!ids.length) return { rows: [], total: count ?? 0 };

  // Enriquecimento em lote (uma consulta por fonte, nunca por linha)
  const [convs, deals, profiles, fups, team, stages] = await Promise.all([
    db.from('conversations').select('id,contact_id,is_active,assigned_user_id,attendance_finished,ai_paused,human_takeover_required,handoff_type,last_message_at').in('contact_id', ids),
    db.from('deals').select('contact_id,stage_id').in('contact_id', ids).is('won_at', null).is('lost_at', null),
    db.from('crm_contact_profiles').select('contact_id,contact_type').in('contact_id', ids),
    db.from('crm_followups').select('contact_id,due_at,has_time,reason').in('contact_id', ids).eq('status', 'open').order('due_at'),
    listTeamMembers(),
    listStages(),
  ]);
  const teamName = new Map(team.map((t) => [t.id, t.name]));
  const stageMap = new Map(stages.map((s) => [s.id, s]));
  const convBy = new Map<string, any>();
  for (const c of convs.data ?? []) {
    const prev = convBy.get(c.contact_id);
    if (!prev || new Date(c.last_message_at) > new Date(prev.last_message_at)) convBy.set(c.contact_id, c);
  }
  const dealBy = new Map((deals.data ?? []).map((d: any) => [d.contact_id, d]));
  const typeBy = new Map((profiles.data ?? []).map((p: any) => [p.contact_id, p.contact_type]));
  const fupBy = new Map<string, any>();
  for (const x of fups.data ?? []) if (!fupBy.has(x.contact_id)) fupBy.set(x.contact_id, x);

  const rows: CrmListRow[] = contacts.map((c: any) => {
    const conv = convBy.get(c.id);
    const deal: any = dealBy.get(c.id);
    const st = deal ? stageMap.get(deal.stage_id) : null;
    return {
      id: c.id,
      name: c.name || c.call_name || c.phone_number,
      phone: c.phone_number,
      email: c.email,
      lastActivity: c.last_activity,
      contactType: (typeBy.get(c.id) as ContactType) ?? null,
      responsibleName: conv?.assigned_user_id ? teamName.get(conv.assigned_user_id) ?? null : null,
      humanActive: conv ? isActiveHumanAttendance(conv) : false,
      stageTitle: st?.title ?? null,
      stageColor: st?.color ?? null,
      nextFollowup: fupBy.get(c.id) ?? null,
      conversationId: conv?.id ?? null,
    };
  });
  return { rows, total: count ?? rows.length };
}

// ---------------- Ficha ----------------

export interface CrmNote { id: string; content: string; author_user_id: string; created_at: string; updated_at: string; deleted_at: string | null }
export interface CrmFollowup {
  id: string; contact_id: string; assigned_user_id: string; due_at: string; has_time: boolean; reason: string;
  notes: string | null; status: FollowupStatus; created_by: string; created_at: string;
  completed_at: string | null; completed_by: string | null; canceled_at: string | null;
}

export async function loadProfile(contactId: string) {
  const [contact, conv, deal, prof, interests, notes, fups, team, stages] = await Promise.all([
    db.from('contacts').select('*').eq('id', contactId).maybeSingle(),
    db.from('conversations').select('*').eq('contact_id', contactId).order('last_message_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('deals').select('id,title,stage_id,created_at,updated_at').eq('contact_id', contactId).is('won_at', null).is('lost_at', null).maybeSingle(),
    db.from('crm_contact_profiles').select('*').eq('contact_id', contactId).maybeSingle(),
    db.from('crm_contact_interests').select('*').eq('contact_id', contactId).order('created_at'),
    db.from('crm_notes').select('*').eq('contact_id', contactId).is('deleted_at', null).order('created_at', { ascending: false }),
    db.from('crm_followups').select('*').eq('contact_id', contactId).order('due_at'),
    listTeamMembers(),
    listStages(),
  ]);
  if (contact.error) throw contact.error;
  const conversation = conv.data ?? null;
  const events = conversation
    ? (await db.from('conversation_handoff_events').select('event_type,created_at,handoff_reason').eq('conversation_id', conversation.id).order('created_at')).data ?? []
    : [];
  const noteRows: CrmNote[] = notes.data ?? [];
  const fupRows: CrmFollowup[] = fups.data ?? [];
  const names = await userNames([
    ...noteRows.map((n) => n.author_user_id),
    ...fupRows.flatMap((f) => [f.assigned_user_id, f.created_by, f.completed_by ?? '']),
    ...(interests.data ?? []).map((i: any) => i.created_by),
  ]);
  const stage = deal.data ? stages.find((s) => s.id === deal.data.stage_id) ?? null : null;
  return {
    contact: contact.data,
    conversation,
    responsibleName: conversation?.assigned_user_id ? team.find((t) => t.id === conversation.assigned_user_id)?.name ?? null : null,
    humanActive: conversation ? isActiveHumanAttendance(conversation) : false,
    deal: deal.data ?? null,
    stage,
    contactType: (prof.data?.contact_type ?? null) as ContactType | null,
    interests: (interests.data ?? []) as { id: string; interest_key: InterestKey; created_by: string; created_at: string }[],
    notes: noteRows,
    followups: fupRows,
    events,
    names,
  };
}

/** Mensagens da conversa, somente leitura (fonte original: messages). */
export async function loadMessages(conversationId: string, limit = 100) {
  const { data, error } = await db.from('messages')
    .select('id,content,type,from_type,media_url,sent_at')
    .eq('conversation_id', conversationId)
    .order('sent_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).reverse();
}

async function me(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Sessão expirada');
  return data.user.id;
}

export async function setContactType(contactId: string, type: ContactType | null) {
  const uid = await me();
  const { error } = await db.from('crm_contact_profiles')
    .upsert({ contact_id: contactId, contact_type: type, updated_by: uid }, { onConflict: 'contact_id' });
  if (error) throw error;
}

export async function addInterest(contactId: string, key: InterestKey) {
  const uid = await me();
  const { error } = await db.from('crm_contact_interests').insert({ contact_id: contactId, interest_key: key, created_by: uid });
  if (error) {
    if (error.code === '23505') throw new Error('Esse interesse já está confirmado.');
    throw error;
  }
}

export async function removeInterest(id: string) {
  const { error } = await db.from('crm_contact_interests').delete().eq('id', id);
  if (error) throw error;
}

export async function addNote(contactId: string, content: string) {
  const uid = await me();
  const { error } = await db.from('crm_notes').insert({ contact_id: contactId, content: content.trim(), author_user_id: uid });
  if (error) throw error;
}

export async function editNote(id: string, content: string) {
  const { error } = await db.from('crm_notes').update({ content: content.trim() }).eq('id', id);
  if (error) throw error;
}

export async function softDeleteNote(id: string) {
  const uid = await me();
  const { error } = await db.from('crm_notes').update({ deleted_at: new Date().toISOString(), deleted_by: uid }).eq('id', id);
  if (error) throw error;
}

export async function createFollowup(input: { contactId: string; assignedUserId: string; dueAt: string; hasTime: boolean; reason: string; notes?: string }) {
  const uid = await me();
  const { error } = await db.from('crm_followups').insert({
    contact_id: input.contactId, assigned_user_id: input.assignedUserId, due_at: input.dueAt,
    has_time: input.hasTime, reason: input.reason.trim(), notes: input.notes?.trim() || null, created_by: uid,
  });
  if (error) throw error;
}

export async function completeFollowup(id: string) {
  const uid = await me();
  const { error } = await db.from('crm_followups').update({ status: 'done', completed_at: new Date().toISOString(), completed_by: uid, canceled_at: null }).eq('id', id);
  if (error) throw error;
}

export async function cancelFollowup(id: string) {
  const { error } = await db.from('crm_followups').update({ status: 'canceled', canceled_at: new Date().toISOString(), completed_at: null, completed_by: null }).eq('id', id);
  if (error) throw error;
}

/** Retornos (todos os follow-ups) com nome do contato — para a visão Retornos. */
export async function listReturns(): Promise<(CrmFollowup & { contactName: string })[]> {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [open, closed] = await Promise.all([
    db.from('crm_followups').select('*, contacts(name,call_name,phone_number)').eq('status', 'open').order('due_at').limit(500),
    db.from('crm_followups').select('*, contacts(name,call_name,phone_number)').eq('status', 'done').gte('completed_at', since).order('completed_at', { ascending: false }).limit(100),
  ]);
  if (open.error) throw open.error;
  return [...(open.data ?? []), ...(closed.data ?? [])].map((f: any) => ({
    ...f, contactName: f.contacts?.name || f.contacts?.call_name || f.contacts?.phone_number || 'Contato',
  }));
}
