import React, { useMemo, useState } from 'react';
import { Plus, Loader2, BookOpen, Search, X } from 'lucide-react';
import { Button } from '../../Button';
import { toast } from 'sonner';
import { useBrainKnowledge, slugify, EMPTY_KNOWLEDGE_DRAFT, type BrainKnowledgeInput } from '@/hooks/useBrainKnowledge';
import KnowledgeItem from './KnowledgeItem';
import KnowledgeForm, { validateKnowledgeDraft } from './KnowledgeForm';

const KnowledgeManager: React.FC = () => {
  const { entries, loading, create, update, remove } = useBrainKnowledge();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [draft, setDraft] = useState<BrainKnowledgeInput>(EMPTY_KNOWLEDGE_DRAFT);
  const [query, setQuery] = useState('');

  const normalize = (v: string) =>
    v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return entries;
    return entries.filter((e) =>
      [e.title, e.slug, e.content_md, e.category, e.knowledge_type, ...(e.tags ?? []), ...(e.related_products ?? [])]
        .filter(Boolean)
        .some((f) => normalize(String(f)).includes(q))
    );
  }, [entries, query]);

  const reset = () => {
    setDraft(EMPTY_KNOWLEDGE_DRAFT);
    setSlugTouched(false);
    setAdding(false);
  };

  const handleCreate = async () => {
    const err = validateKnowledgeDraft(draft);
    if (err) {
      toast.error(err);
      return;
    }
    const payload = { ...draft, slug: (draft.slug || slugify(draft.title)).trim() };
    setBusy(true);
    const ok = await create(payload);
    setBusy(false);
    if (ok) {
      toast.success('Conhecimento adicionado');
      reset();
    } else {
      toast.error('Erro ao adicionar (slug pode já existir)');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-400">
        <strong className="text-slate-300">Conhecimento = conteúdos amplos.</strong> Cadastre protocolos completos,
        FAQs, políticas, processos, guias de atendimento e objeções. Explique também quando a Nina deve usar cada
        conhecimento e quando deve encaminhar para um atendente humano.
      </div>

      {entries.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título, slug, tag, categoria ou conteúdo..."
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
      )}

      {entries.length === 0 && !adding && (
        <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/40 p-6 text-center">
          <BookOpen className="w-6 h-6 mx-auto text-slate-600 mb-2" />
          <p className="text-sm text-slate-400">Sem artigos de conhecimento. Ensine protocolos, políticas, FAQs e processos.</p>
        </div>
      )}

      {entries.length > 0 && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/40 p-6 text-center">
          <p className="text-sm text-slate-400">Nenhum conhecimento encontrado para "{query}".</p>
        </div>
      )}

      {filtered.map((e) => (
        <KnowledgeItem key={e.id} entry={e} onSave={update} onDelete={remove} />
      ))}

      {adding ? (
        <div className="rounded-lg border border-cyan-500/30 bg-slate-950/40 p-4 space-y-4">
          <KnowledgeForm
            draft={draft}
            onChange={setDraft}
            autoSlugFromTitle={!slugTouched}
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
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)} className="w-full">
          <Plus className="w-4 h-4 mr-2" />
          Adicionar conhecimento
        </Button>
      )}
    </div>
  );
};

export default KnowledgeManager;
