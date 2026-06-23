import React, { useState } from 'react';
import { Pencil, Trash2, Check, X, Loader2 } from 'lucide-react';
import { Button } from '../../Button';
import { toast } from 'sonner';
import { knowledgeToDraft, type BrainKnowledge, type BrainKnowledgeInput } from '@/hooks/useBrainKnowledge';
import KnowledgeForm, { validateKnowledgeDraft } from './KnowledgeForm';

interface KnowledgeItemProps {
  entry: BrainKnowledge;
  onSave: (id: string, patch: Partial<BrainKnowledgeInput>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

const TYPE_LABEL: Record<string, string> = {
  protocolo: 'Protocolo',
  faq: 'FAQ',
  politica: 'Política',
  processo: 'Processo',
  guia: 'Guia',
  objecoes: 'Objeções',
  treinamento: 'Treinamento',
};

const KnowledgeItem: React.FC<KnowledgeItemProps> = ({ entry, onSave, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<BrainKnowledgeInput>(() => knowledgeToDraft(entry));

  const handleSave = async () => {
    const err = validateKnowledgeDraft(draft);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    const ok = await onSave(entry.id, draft);
    setBusy(false);
    if (ok) {
      toast.success('Conhecimento atualizado');
      setEditing(false);
    } else {
      toast.error('Erro ao salvar (slug pode já existir)');
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    await onDelete(entry.id);
    setBusy(false);
  };

  if (!editing) {
    const typeKey = (entry.knowledge_type ?? '').toLowerCase();
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-100 truncate">{entry.title}</span>
            {entry.knowledge_type && (
              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300">
                {TYPE_LABEL[typeKey] ?? entry.knowledge_type}
              </span>
            )}
            {entry.category && (
              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                {entry.category}
              </span>
            )}
            {entry.priority === 'alta' && (
              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300">
                prioridade alta
              </span>
            )}
          </div>
          <code className="text-[11px] text-slate-500">/{entry.slug}</code>
          <p className="text-xs text-slate-400 mt-1 line-clamp-2">{entry.content_md}</p>
          {entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {entry.tags.slice(0, 6).map((t) => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-400">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => {
              setDraft(knowledgeToDraft(entry));
              setEditing(true);
            }}
            className="p-2 rounded-md text-slate-400 hover:bg-slate-800 hover:text-cyan-400"
            title="Editar"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={handleDelete} disabled={busy} className="p-2 rounded-md text-slate-400 hover:bg-slate-800 hover:text-red-400" title="Remover">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-cyan-500/30 bg-slate-950/40 p-4 space-y-4">
      <KnowledgeForm draft={draft} onChange={setDraft} />
      <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={busy}>
          <X className="w-4 h-4 mr-1" /> Cancelar
        </Button>
        <Button size="sm" onClick={handleSave} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
          Salvar
        </Button>
      </div>
    </div>
  );
};

export default KnowledgeItem;
