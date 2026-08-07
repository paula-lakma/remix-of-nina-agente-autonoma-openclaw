import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Save, Trash2, FileText } from 'lucide-react';
import { Button } from '../../Button';
import { toast } from 'sonner';
import ProtocolForm, { validateProtocolDraft } from './ProtocolForm';
import {
  PROTOCOL_STATUS_LABELS,
  protocolToDraft,
  slugifyProtocol,
  type BrainProtocol,
  type BrainProtocolInput,
  type ProtocolStatus,
} from '@/hooks/useBrainProtocols';

interface ProtocolItemProps {
  protocol: BrainProtocol;
  onSave: (id: string, patch: Partial<BrainProtocolInput>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

const STATUS_STYLE: Record<string, string> = {
  draft: 'border-slate-700 bg-slate-800/60 text-slate-300',
  approved: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  inactive: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
};

const ProtocolItem: React.FC<ProtocolItemProps> = ({ protocol, onSave, onDelete }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState<BrainProtocolInput>(() => protocolToDraft(protocol));

  const handleSave = async () => {
    const err = validateProtocolDraft(draft);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    const ok = await onSave(protocol.id, {
      ...draft,
      slug: (draft.slug || slugifyProtocol(draft.name)).trim(),
    });
    setBusy(false);
    if (ok) {
      toast.success('Protocolo atualizado');
      setOpen(false);
    } else {
      toast.error('Erro ao salvar (slug pode já existir)');
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    const ok = await onDelete(protocol.id);
    setBusy(false);
    if (ok) toast.success('Protocolo excluído');
    else toast.error('Erro ao excluir protocolo');
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40">
      <div className="flex items-center gap-3 p-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 min-w-0 flex-1 text-left"
        >
          {open ? (
            <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
          )}
          <FileText className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          <span className="text-sm text-slate-200 truncate">{protocol.name}</span>
          <code className="text-[11px] text-slate-500 truncate">{protocol.slug}</code>
        </button>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${
            STATUS_STYLE[protocol.status] ?? STATUS_STYLE.draft
          }`}
        >
          {PROTOCOL_STATUS_LABELS[protocol.status as ProtocolStatus] ?? protocol.status}
        </span>
        <button
          onClick={() => setConfirmDelete(true)}
          className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 flex-shrink-0"
          aria-label="Excluir protocolo"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {confirmDelete && (
        <div className="mx-3 mb-3 rounded-md border border-rose-500/30 bg-rose-500/5 p-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-rose-300">Excluir "{protocol.name}"? Esta ação não pode ser desfeita.</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleDelete} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Excluir'}
            </Button>
          </div>
        </div>
      )}

      {open && (
        <div className="border-t border-slate-800 p-4 space-y-4">
          <ProtocolForm draft={draft} onChange={setDraft} protocolId={protocol.id} />
          <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(protocolToDraft(protocol));
                setOpen(false);
              }}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProtocolItem;
