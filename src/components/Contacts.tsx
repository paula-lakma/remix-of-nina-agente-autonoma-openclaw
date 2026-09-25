import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, UserPlus, Loader2, Users, Upload, ChevronLeft, ChevronRight, CalendarClock, Contact as ContactIcon } from 'lucide-react';
import { Button } from './Button';
import ImportContactsModal from './ImportContactsModal';
import ContactProfile from './crm/ContactProfile';
import CrmReturns from './crm/CrmReturns';
import {
  CRM_PAGE_SIZE, listContacts, listStages, listTeamMembers,
  type CrmListFilters, type CrmListRow, type NextActionFilter,
} from '@/services/crm';
import { CONTACT_TYPES, CONTACT_TYPE_LABEL, followupBucket, FOLLOWUP_BUCKET_LABEL, type ContactType } from '@/lib/crm';

const selectCls = 'px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50';

const Contacts: React.FC = () => {
  const [view, setView] = useState<'contacts' | 'returns'>('contacts');
  const [rows, setRows] = useState<CrmListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<CrmListFilters>({
    page: 0, search: '', contactType: '', assignedTeamMemberId: '', stageId: '', nextAction: '',
  });
  const [team, setTeam] = useState<{ id: string; name: string }[]>([]);
  const [stages, setStages] = useState<{ id: string; title: string }[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    listTeamMembers().then(setTeam).catch(() => {});
    listStages().then(setStages).catch(() => {});
  }, []);

  // Busca com espera de 400ms, sempre no servidor
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.search === searchInput ? f : { ...f, search: searchInput, page: 0 })), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const reqId = useRef(0);
  const load = useCallback(async () => {
    const my = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const r = await listContacts(filters);
      if (my !== reqId.current) return; // resposta antiga: ignora
      setRows(r.rows);
      setTotal(r.total);
    } catch (e: any) {
      if (my !== reqId.current) return;
      setError('Não foi possível carregar os contatos.');
      console.error('[CRM] listContacts', e);
    } finally {
      if (my === reqId.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const setF = (patch: Partial<CrmListFilters>) => setFilters((f) => ({ ...f, ...patch, page: 0 }));
  const pages = Math.max(1, Math.ceil(total / CRM_PAGE_SIZE));

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-950 text-slate-50">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Contatos</h2>
          <p className="text-sm text-slate-400 mt-1">Ficha de relacionamento de cada pessoa, notas internas e retornos.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="w-4 h-4 mr-2" /> Importar CSV
          </Button>
          <Button className="opacity-50 cursor-not-allowed" disabled title="Em breve: Adicionar contato">
            <UserPlus className="w-4 h-4 mr-2" /> Novo Contato
          </Button>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <Button variant={view === 'contacts' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('contacts')}>
          <ContactIcon className="w-4 h-4 mr-2" /> Contatos
        </Button>
        <Button variant={view === 'returns' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('returns')}>
          <CalendarClock className="w-4 h-4 mr-2" /> Retornos
        </Button>
      </div>

      <ImportContactsModal isOpen={showImport} onClose={() => setShowImport(false)} onImported={load} />

      {view === 'returns' ? (
        <CrmReturns onOpenContact={setOpenId} />
      ) : (
        <>
          <div className="flex flex-col lg:flex-row gap-3 mb-6 bg-slate-900/50 p-2 rounded-xl border border-slate-800">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar por nome, apelido, e-mail ou telefone (todos os contatos)"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder:text-slate-600"
              />
            </div>
            <select aria-label="Tipo" className={selectCls} value={filters.contactType} onChange={(e) => setF({ contactType: e.target.value as '' | ContactType })}>
              <option value="">Todos os tipos</option>
              {CONTACT_TYPES.map((t) => <option key={t} value={t}>{CONTACT_TYPE_LABEL[t]}</option>)}
            </select>
            <select aria-label="Responsável" className={selectCls} value={filters.assignedTeamMemberId} onChange={(e) => setF({ assignedTeamMemberId: e.target.value })}>
              <option value="">Responsável registrado (ativo ou encerrado)</option>
              {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select aria-label="Etapa" className={selectCls} value={filters.stageId} onChange={(e) => setF({ stageId: e.target.value })}>
              <option value="">Todas as etapas</option>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
            <select aria-label="Próxima ação" className={selectCls} value={filters.nextAction} onChange={(e) => setF({ nextAction: e.target.value as NextActionFilter })}>
              <option value="">Qualquer próxima ação</option>
              <option value="any">Com retorno em aberto</option>
              <option value="overdue">Retorno vencido</option>
              <option value="today">Retorno hoje</option>
              <option value="week">Retorno em 7 dias</option>
            </select>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 shadow-xl overflow-hidden min-h-[400px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-80">
                <Loader2 className="h-10 w-10 animate-spin text-cyan-500 mb-3" />
                <span className="text-sm text-slate-400">Carregando contatos...</span>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-80 text-red-400 text-sm">{error}</div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-80 text-slate-400">
                <Users className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-lg font-medium">Nenhum contato encontrado</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-3">Nome / Telefone</th>
                      <th className="px-5 py-3">Tipo</th>
                      <th className="px-5 py-3">Responsável</th>
                      <th className="px-5 py-3">Etapa</th>
                      <th className="px-5 py-3">Última interação</th>
                      <th className="px-5 py-3">Próxima ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {rows.map((c) => {
                      const bucket = c.nextFollowup ? followupBucket({ status: 'open', ...c.nextFollowup }) : null;
                      return (
                        <tr key={c.id} onClick={() => setOpenId(c.id)} className="hover:bg-slate-800/40 cursor-pointer">
                          <td className="px-5 py-3">
                            <div className="font-semibold text-slate-200">{c.name || 'Sem nome'}</div>
                            <div className="text-xs text-slate-500">{c.phone}{c.email ? ` · ${c.email}` : ''}</div>
                          </td>
                          <td className="px-5 py-3 text-slate-300">{c.contactType ? CONTACT_TYPE_LABEL[c.contactType] : <span className="text-slate-600">—</span>}</td>
                          <td className="px-5 py-3">
                            {c.responsibleName ? (
                              <span className="text-slate-300">{c.responsibleName}{c.humanActive ? '' : <span className="text-xs text-slate-500">{c.attendanceFinished ? ' (atendimento encerrado)' : ' (com a Nina)'}</span>}</span>
                            ) : <span className="text-slate-500">Nina</span>}
                          </td>
                          <td className="px-5 py-3 text-slate-300">{c.stageTitle ?? <span className="text-slate-600">—</span>}</td>
                          <td className="px-5 py-3 text-slate-400">{new Date(c.lastActivity).toLocaleDateString('pt-BR')}</td>
                          <td className="px-5 py-3">
                            {c.nextFollowup ? (
                              <div>
                                <div className={bucket === 'overdue' ? 'text-red-400' : bucket === 'today' ? 'text-amber-400' : 'text-slate-300'}>
                                  {new Date(c.nextFollowup.due_at).toLocaleDateString('pt-BR')} · {FOLLOWUP_BUCKET_LABEL[bucket!]}
                                </div>
                                <div className="text-xs text-slate-500 truncate max-w-[220px]">{c.nextFollowup.reason}</div>
                              </div>
                            ) : <span className="text-slate-600">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-4 text-sm text-slate-400">
            <span>{total} contato(s) · página {filters.page + 1} de {pages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={filters.page === 0 || loading} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>
                <ChevronLeft className="w-4 h-4" /> Anterior
              </Button>
              <Button variant="outline" size="sm" disabled={filters.page + 1 >= pages || loading} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>
                Próxima <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {openId && <ContactProfile contactId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
};

export default Contacts;
