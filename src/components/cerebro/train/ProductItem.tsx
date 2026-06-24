import React, { useState } from 'react';
import { Pencil, Trash2, Check, X, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../../Button';
import { toast } from 'sonner';
import { productToDraft, type BrainProduct, type BrainProductInput } from '@/hooks/useBrainProducts';
import ProductForm, { validateProductDraft } from './ProductForm';

interface ProductItemProps {
  product: BrainProduct;
  onSave: (id: string, patch: Partial<BrainProductInput>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

const ProductItem: React.FC<ProductItemProps> = ({ product, onSave, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<BrainProductInput>(() => productToDraft(product));

  const handleSave = async () => {
    const err = validateProductDraft(draft);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    const ok = await onSave(product.id, draft);
    setBusy(false);
    if (ok) {
      toast.success('Produto atualizado');
      setEditing(false);
    } else {
      toast.error('Erro ao salvar');
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    await onDelete(product.id);
    setBusy(false);
  };

  if (!editing) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setCollapsed((c) => !c)}
                className="flex items-center gap-1.5 text-left group"
                title={collapsed ? 'Expandir' : 'Minimizar'}
              >
                {collapsed ? (
                  <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 flex-shrink-0" />
                ) : (
                  <ChevronUp className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 flex-shrink-0" />
                )}
                <span className="text-sm font-medium text-slate-100 truncate">{product.name}</span>
              </button>
              <span
                className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                  product.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-700/40 text-slate-500'
                }`}
              >
                {product.is_active ? 'Ativo' : 'Inativo'}
              </span>
              {product.category && (
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                  {product.category}
                </span>
              )}
              {product.in_protocols && (
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300">
                  em protocolo
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => {
                setDraft(productToDraft(product));
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
        {!collapsed && (
          <div className="mt-2 pl-5.5">
            {product.summary && <p className="text-xs text-slate-400 line-clamp-2">{product.summary}</p>}
            {product.main_goals.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {product.main_goals.slice(0, 5).map((g) => (
                  <span key={g} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-400">
                    {g}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-cyan-500/30 bg-slate-950/40 p-4 space-y-4">
      <ProductForm draft={draft} onChange={setDraft} />
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

export default ProductItem;
