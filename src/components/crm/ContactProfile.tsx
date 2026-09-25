import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Loader2, ExternalLink, Check, Ban, Trash2, Pencil, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../Button';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import {
  loadProfile, loadMessages, listStaff, setContactType, addInterest, removeInterest,
  addNote, editNote, softDeleteNote, createFollowup, completeFollowup, cancelFollowup, type StaffUser,
} from '@/services/crm';
import {
  CONTACT_TYPES, CONTACT_TYPE_LABEL, INTEREST_KEYS, INTEREST_LABEL, buildTimeline, followupBucket,
  FOLLOWUP_BUCKET_LABEL, matchInterestKey, ninaSuggestions, type ContactType, type InterestKey,
} from '@/lib/crm';

type Tab = 'resumo' | 'conversas' | 'comercial' | 'historico' | 'notas';
const TABS: { key: Tab; label: string }[] = [
  { key: 'resumo', label: 'Resumo' }, { key: 'conversas', label: 'Conversas' }, { key: 'comercial', label: 'Comercial' },
  { key: 'historico', label: 'Histórico' }, { key: 'notas', label: 'Notas' },
];

const fmt = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const box = 'rounded-xl border border-slate-800 bg-slate-900/50 p-4';
const input = 'w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50';

const ContactProfile: React.FC<{ contactId: string; onClose: () => void; onChanged: () => void }> = ({ contactId, onClose, onChanged }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { role } = useUserRole();
  const isAdminOrManager = role === 'admin' || role === 'manager';
  const [tab, setTab] = useState<Tab>('resumo');
  const [data, setData] = useState<Awaited<ReturnType<typeof loadProfile>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[] | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [fu, setFu] = useState({ assigned: '', date: '', time: '', reason: '', notes: '' });

  const reload = useCallback(async () => {
    try {
      setData(await loadProfile(contactId));
    } catch (e) {
      console.error('[CRM] profile', e);
      setError('Não foi possível abrir a ficha.');
    }
  }, [contactId]);

  useEffect(() => { reload(); listStaff().then(setStaff).catch(() => {}); }, [reload]);
  useEffect(() => { if (user && !fu.assigned) setFu((f) => ({ ...f, assigned: user.id })); }, [user, fu.assigned]);
  useEffect(() => {
    if (tab === 'conversas' && data?.conversation && messages === null) {
      loadMessages(data.conversation.id).then(setMessages).catch(() => setMessages([]));
    }
  }, [tab, data, messages]);

  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      await reload();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  };

  const c = data?.contact;
  const sugg = ninaSuggestions(c?.client_memory);
  const confirmed = new Set((data?.interests ?? []).map((i) => i.interest_key));
  const openFups = (data?.followups ?? []).filter((f) => f.status === 'open');
  const nextFu = openFups[0];

  const submitFollowup = () => {
    if (!fu.date || !fu.reason.trim() || !fu.assigned) { toast.error('Informe responsável, data e motivo.'); return; }
    const due = fu.time ? new Date(`${fu.date}T${fu.time}`) : new Date(`${fu.date}T12:00`);
    run(async () => {
      await createFollowup({ contactId, assignedUserId: fu.assigned, dueAt: due.toISOString(), hasTime: !!fu.time, reason: fu.reason, notes: fu.notes });
      setFu((f) => ({ ...f, date: '', time: '', reason: '', notes: '' }));
    }, 'Follow-up criado');
  };

  const Interests = (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs uppercase tracking-wider text-slate-400 mb-2">Interesses confirmados</h4>
        <div className="flex flex-wrap gap-2">
          {INTEREST_KEYS.map((k) => {
            const row = data?.interests.find((i) => i.interest_key === k);
            return (
              <button key={k} disabled={busy}
                onClick={() => run(() => (row ? removeInterest(row.id) : addInterest(contactId, k as InterestKey)))}
                className={`px-3 py-1 rounded-full text-xs border ${row ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300' : 'border-slate-700 text-slate-500 hover:text-slate-300'}`}>
                {row ? '✓ ' : ''}{INTEREST_LABEL[k]}
              </button>
            );
          })}
        </div>
      </div>
      <div className="rounded-lg border border-dashed border-violet-500/30 bg-violet-500/5 p-3">
        <h4 className="text-xs uppercase tracking-wider text-violet-300 mb-2 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Sugestões da Nina (não confirmadas)</h4>
        {sugg.interests.length === 0 && sugg.products.length === 0 ? (
          <p className="text-xs text-slate-500">A Nina ainda não registrou interesses para este contato.</p>
        ) : (
          <div className="space-y-2 text-sm">
            {sugg.interests.map((s) => {
              const key = matchInterestKey(s);
              return (
                <div key={s} className="flex items-center justify-between gap-2">
                  <span className="text-slate-300">{s}</span>
                  {key && !confirmed.has(key) && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => addInterest(contactId, key), 'Interesse confirmado')}>
                      Confirmar como {INTEREST_LABEL[key]}
                    </Button>
                  )}
                </div>
              );
            })}
            {sugg.products.length > 0 && <p className="text-xs text-slate-400">Produtos conversados: {sugg.products.join(', ')}</p>}
          </div>
        )}
      </div>
    </div>
  );

  const Followups = (
    <div className="space-y-3">
      <h4 className="text-xs uppercase tracking-wider text-slate-400">Follow-ups</h4>
      {(data?.followups ?? []).length === 0 && <p className="text-sm text-slate-500">Nenhum follow-up.</p>}
      {(data?.followups ?? []).map((f) => {
        const b = followupBucket(f);
        return (
          <div key={f.id} className="flex items-start justify-between gap-3 border-b border-slate-800/60 pb-2">
            <div>
              <div className="text-sm text-slate-200">{f.reason}</div>
              <div className={`text-xs ${b === 'overdue' ? 'text-red-400' : b === 'today' ? 'text-amber-400' : 'text-slate-500'}`}>
                {f.has_time ? fmt(f.due_at) : new Date(f.due_at).toLocaleDateString('pt-BR')} · {FOLLOWUP_BUCKET_LABEL[b]} · {data?.names[f.assigned_user_id] ?? '—'}
              </div>
              {f.notes && <div className="text-xs text-slate-400 mt-1">{f.notes}</div>}
            </div>
            {f.status === 'open' && (
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="outline" disabled={busy} title="Concluir" onClick={() => run(() => completeFollowup(f.id), 'Follow-up concluído')}><Check className="w-4 h-4" /></Button>
                <Button size="sm" variant="ghost" disabled={busy} title="Cancelar" onClick={() => run(() => cancelFollowup(f.id), 'Follow-up cancelado')}><Ban className="w-4 h-4" /></Button>
              </div>
            )}
          </div>
        );
      })}
      <div className="grid grid-cols-2 gap-2 pt-2">
        <select className={input} value={fu.assigned} onChange={(e) => setFu({ ...fu, assigned: e.target.value })} aria-label="Responsável do follow-up">
          {staff.map((s) => <option key={s.user_id} value={s.user_id}>{s.display_name}</option>)}
        </select>
        <div className="flex gap-2">
          <input type="date" className={input} value={fu.date} onChange={(e) => setFu({ ...fu, date: e.target.value })} aria-label="Data" />
          <input type="time" className={input} value={fu.time} onChange={(e) => setFu({ ...fu, time: e.target.value })} aria-label="Horário (opcional)" />
        </div>
        <input className={`${input} col-span-2`} placeholder="Motivo (ex.: retornar sobre Kit Ácidos)" maxLength={300} value={fu.reason} onChange={(e) => setFu({ ...fu, reason: e.target.value })} />
        <input className={`${input} col-span-2`} placeholder="Observação (opcional)" maxLength={2000} value={fu.notes} onChange={(e) => setFu({ ...fu, notes: e.target.value })} />
        <Button className="col-span-2" size="sm" disabled={busy} onClick={submitFollowup}><Plus className="w-4 h-4 mr-1" /> Criar follow-up</Button>
      </div>
      <p className="text-[11px] text-slate-500">Follow-up é só organização interna: não envia mensagem, não pausa a Nina e não mexe no atendimento.</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div className="w-full max-w-3xl h-full bg-slate-950 border-l border-slate-800 overflow-y-auto" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Ficha do contato">
        {!data && !error && <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-cyan-500" /></div>}
        {error && <div className="p-8 text-red-400">{error}</div>}
        {data && c && (
          <>
            <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white">{c.name || c.call_name || c.phone_number}</h2>
                  <p className="text-sm text-slate-400">{c.phone_number}{c.email ? ` · ${c.email}` : ''}</p>
                </div>
                <div className="flex gap-2">
                  {data.conversation && (
                    <Button size="sm" variant="outline" onClick={() => navigate(`/chat?conversation=${data.conversation.id}`)}>
                      <ExternalLink className="w-4 h-4 mr-1" /> Abrir no Chat Ao Vivo
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={onClose} aria-label="Fechar"><X className="w-4 h-4" /></Button>
                </div>
              </div>
              <div className="flex gap-1 mt-4">
                {TABS.map((t) => (
                  <button key={t.key} onClick={() => setTab(t.key)}
                    className={`px-3 py-1.5 rounded-lg text-sm ${tab === t.key ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{t.label}</button>
                ))}
              </div>
            </div>

            <div className="p-5 space-y-4">
              {tab === 'resumo' && (
                <>
                  <div className={`${box} grid grid-cols-2 gap-4 text-sm`}>
                    <div>
                      <div className="text-xs text-slate-500">Tipo de contato</div>
                      <select className={`${input} mt-1`} disabled={busy} value={data.contactType ?? ''}
                        onChange={(e) => run(() => setContactType(contactId, (e.target.value || null) as ContactType | null), 'Tipo atualizado')}>
                        <option value="">Não informado</option>
                        {CONTACT_TYPES.map((t) => <option key={t} value={t}>{CONTACT_TYPE_LABEL[t]}</option>)}
                      </select>
                    </div>
                    <div><div className="text-xs text-slate-500">Cidade</div><div className="text-slate-200 mt-2">{c.city || '—'}</div></div>
                    <div><div className="text-xs text-slate-500">Responsável</div><div className="text-slate-200">{data.responsibleName ?? 'Nenhum (Nina)'}</div></div>
                    <div><div className="text-xs text-slate-500">Situação</div><div className="text-slate-200">{data.humanActive ? 'Atendimento humano ativo' : data.conversation?.attendance_finished ? 'Atendimento finalizado' : 'Com a Nina'}</div></div>
                    <div><div className="text-xs text-slate-500">Etapa no Pipeline</div><div className="text-slate-200">{data.stage?.title ?? '—'}</div></div>
                    <div><div className="text-xs text-slate-500">Última mensagem</div><div className="text-slate-200">{data.conversation ? fmt(data.conversation.last_message_at) : '—'}</div></div>
                    <div><div className="text-xs text-slate-500">Último encaminhamento</div><div className="text-slate-200">{data.conversation?.handoff_reason || '—'}</div></div>
                    <div><div className="text-xs text-slate-500">Próximo follow-up</div><div className="text-slate-200">{nextFu ? `${new Date(nextFu.due_at).toLocaleDateString('pt-BR')} · ${nextFu.reason}` : '—'}</div></div>
                    <div className="col-span-2"><div className="text-xs text-slate-500">Tags</div><div className="text-slate-200">{(c.tags ?? []).join(', ') || '—'}</div></div>
                  </div>
                  <div className={box}>{Interests}</div>
                  {(sugg.summary || sugg.nextAction) && (
                    <div className="rounded-xl border border-dashed border-violet-500/30 bg-violet-500/5 p-4 text-sm">
                      <div className="text-xs uppercase tracking-wider text-violet-300 mb-1">Resumo da Nina (sugestão)</div>
                      {sugg.summary && <p className="text-slate-300">{sugg.summary}</p>}
                      {sugg.nextAction && <p className="text-slate-400 mt-1">Próxima ação sugerida: {sugg.nextAction}</p>}
                    </div>
                  )}
                </>
              )}

              {tab === 'conversas' && (
                <div className={box}>
                  <p className="text-xs text-slate-500 mb-3">Somente leitura. Para responder, use "Abrir no Chat Ao Vivo".</p>
                  {!data.conversation ? <p className="text-sm text-slate-500">Sem conversa.</p>
                    : messages === null ? <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
                    : messages.length === 0 ? <p className="text-sm text-slate-500">Sem mensagens.</p>
                    : (
                      <div className="space-y-2">
                        {messages.map((m) => (
                          <div key={m.id} className={`flex ${m.from_type === 'user' ? 'justify-start' : 'justify-end'}`}>
                            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.from_type === 'user' ? 'bg-slate-800 text-slate-200' : m.from_type === 'nina' ? 'bg-cyan-900/40 text-cyan-100' : 'bg-emerald-900/40 text-emerald-100'}`}>
                              <div className="text-[10px] opacity-60 mb-0.5">{m.from_type === 'user' ? 'Cliente' : m.from_type === 'nina' ? 'Nina' : 'Equipe'} · {fmt(m.sent_at)}</div>
                              {m.content || <span className="italic opacity-70">[{m.type}]</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              )}

              {tab === 'comercial' && (
                <>
                  <div className={`${box} text-sm`}>
                    <div className="text-xs text-slate-500">Card atual no Pipeline</div>
                    {data.deal ? (
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-slate-200">{data.deal.title} · <b>{data.stage?.title ?? '—'}</b></span>
                        <Button size="sm" variant="ghost" onClick={() => navigate('/pipeline')}>Ver Pipeline</Button>
                      </div>
                    ) : <div className="text-slate-500 mt-1">Sem card ativo.</div>}
                  </div>
                  <div className={box}>{Interests}</div>
                  <div className={box}>{Followups}</div>
                </>
              )}

              {tab === 'historico' && (
                <div className={box}>
                  <ol className="space-y-3">
                    {buildTimeline({
                      contactCreatedAt: c.created_at,
                      events: data.events,
                      notes: data.notes.map((n) => ({ ...n, authorName: data.names[n.author_user_id] })),
                      followups: data.followups,
                    }).map((t, i) => (
                      <li key={i} className="border-l-2 border-slate-700 pl-3">
                        <div className="text-sm text-slate-200">{t.title}</div>
                        <div className="text-xs text-slate-500">{fmt(t.at)}</div>
                        {t.detail && <div className="text-xs text-slate-400 mt-0.5">{t.detail}</div>}
                      </li>
                    ))}
                  </ol>
                  <p className="text-[11px] text-slate-500 mt-4">Trocas manuais de responsável ou de etapa ainda não são registradas pelo sistema.</p>
                </div>
              )}

              {tab === 'notas' && (
                <div className={`${box} space-y-3`}>
                  <p className="text-xs text-slate-500">Notas internas da equipe. Nunca são enviadas ao cliente nem aparecem no Chat.</p>
                  <textarea className={`${input} min-h-[80px]`} maxLength={5000} placeholder="Escreva uma nota interna..." value={noteText} onChange={(e) => setNoteText(e.target.value)} />
                  <Button size="sm" disabled={busy || !noteText.trim()} onClick={() => run(async () => { await addNote(contactId, noteText); setNoteText(''); }, 'Nota salva')}>Salvar nota</Button>
                  {data.notes.length === 0 && <p className="text-sm text-slate-500">Nenhuma nota.</p>}
                  {data.notes.map((n) => {
                    const canEdit = n.author_user_id === user?.id || isAdminOrManager;
                    return (
                      <div key={n.id} className="border-t border-slate-800 pt-3">
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>{data.names[n.author_user_id] ?? 'Usuário'} · {fmt(n.created_at)}{n.updated_at !== n.created_at ? ' (editada)' : ''}</span>
                          {canEdit && (
                            <span className="flex gap-2">
                              <button aria-label="Editar nota" onClick={() => setEditing({ id: n.id, text: n.content })}><Pencil className="w-3.5 h-3.5" /></button>
                              <button aria-label="Apagar nota" onClick={() => { if (confirm('Apagar esta nota?')) run(() => softDeleteNote(n.id), 'Nota apagada'); }}><Trash2 className="w-3.5 h-3.5" /></button>
                            </span>
                          )}
                        </div>
                        {editing?.id === n.id ? (
                          <div className="mt-2 space-y-2">
                            <textarea className={`${input} min-h-[60px]`} maxLength={5000} value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
                            <div className="flex gap-2">
                              <Button size="sm" disabled={busy || !editing.text.trim()} onClick={() => run(async () => { await editNote(n.id, editing.text); setEditing(null); }, 'Nota atualizada')}>Salvar</Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                            </div>
                          </div>
                        ) : <p className="text-sm text-slate-200 whitespace-pre-wrap mt-1">{n.content}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ContactProfile;
