import React, { useMemo, useState } from 'react';
import { Plus, Loader2, FileText, Search, X } from 'lucide-react';
import { Button } from '../../Button';
import { toast } from 'sonner';
import {
  useBrainProtocols,
  slugifyProtocol,
  EMPTY_PROTOCOL_DRAFT,
  PROTOCOL_STATUS_LABELS,
  type BrainProtocolInput,
  type ProtocolStatus,
} from '@/hooks/useBrainProtocols';
import ProtocolItem from './ProtocolItem';
import ProtocolForm, { validateProtocolDraft } from './ProtocolForm';

const ProtocolsManager: React.FC = () => {
  const { protocols, loading, create, update, remove } = useBrainProtocols();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [draft, setDraft] = useState<BrainProtocolInput>(EMPTY_PROTOCOL_DRAFT);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ProtocolStatus>('all');

  const normalize = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return protocols.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (!q) return true;
      return [p.name, p.slug].filter(Boolean).some((f) => normalize(String(f)).includes(q));
    });
  }, [protocols, query, statusFilter]);

  const reset = () => {
    setDraft(EMPTY_PROTOCOL_DRAFT);
    setSlugTouched(false);
    setAdding(false);
  };

  const handleCreate = async () => {
    const err = validateProtocolDraft(draft);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    const ok = await create({ ...draft, slug: (draft.slug || slugifyProtocol(draft.name)).trim() });
    setBusy(false);
    if (ok) {
      toast.success('Protocolo criado');
      reset();
    } else {
      toast.error('Erro ao criar (slug pode já existir)');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
      </div>
    );
  }

  const selectCls =
    'px-3 py-2 rounded-lg border border-slate-800 bg-slate-950/60 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/50';

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-400">
        <strong className="text-slate-300">Protocolos = rotinas completas de tratamento.</strong> Cadastre o
        conhecimento do protocolo em um único texto e anexe o material oficial aprovado. Produtos, preços e links
        continuam exclusivamente na aba Produtos.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar protocolo por nome ou slug..."
            className="w-full pl-9 pr-9 py-2 rounded-lg border border-slate-800 bg-slate-950/60 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800"
              aria-label="Limpar busca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <select
          className={selectCls}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | ProtocolStatus)}
        >
          <option value="all">Todos os status</option>
          {(Object.keys(PROTOCOL_STATUS_LABELS) as ProtocolStatus[]).map((s) => (
            <option key={s} value={s}>
              {PROTOCOL_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={() => setAdding(true)} disabled={adding}>
          <Plus className="w-4 h-4 mr-2" />
          Novo protocolo
        </Button>
      </div>

      <p className="text-[11px] text-slate-500">
        {filtered.length} de {protocols.length} protocolo{protocols.length === 1 ? '' : 's'}
      </p>

      {protocols.length === 0 && !adding && (
        <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/40 p-6 text-center">
          <FileText className="w-6 h-6 mx-auto text-slate-600 mb-2" />
          <p className="text-sm text-slate-400">Nenhum protocolo cadastrado.</p>
        </div>
      )}

      {protocols.length > 0 && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/40 p-6 text-center">
          <p className="text-sm text-slate-400">Nenhum protocolo encontrado para o filtro atual.</p>
        </div>
      )}

      {filtered.map((p) => (
        <ProtocolItem key={p.id} protocol={p} onSave={update} onDelete={remove} />
      ))}

      {adding && (
        <div className="rounded-lg border border-cyan-500/30 bg-slate-950/40 p-4 space-y-4">
          <ProtocolForm
            draft={draft}
            onChange={setDraft}
            autoSlugFromName={!slugTouched}
            onSlugManualEdit={() => setSlugTouched(true)}
          />
          <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
            <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Adicionar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProtocolsManager;
