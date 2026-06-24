import React, { useState } from 'react';
import { Plus, Loader2, Package } from 'lucide-react';
import { Button } from '../../Button';
import { toast } from 'sonner';
import { useBrainProducts, EMPTY_PRODUCT_DRAFT, type BrainProductInput } from '@/hooks/useBrainProducts';
import ProductItem from './ProductItem';
import ProductForm, { validateProductDraft } from './ProductForm';

const ProductsManager: React.FC = () => {
  const { products, loading, create, update, remove } = useBrainProducts();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<BrainProductInput>(EMPTY_PRODUCT_DRAFT);

  const handleCreate = async () => {
    const err = validateProductDraft(draft);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    const ok = await create(draft);
    setBusy(false);
    if (ok) {
      toast.success('Produto adicionado');
      setDraft(EMPTY_PRODUCT_DRAFT);
      setAdding(false);
    } else {
      toast.error('Erro ao adicionar produto');
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
        <strong className="text-slate-300">Produtos = informações individuais.</strong> Cadastre cada produto com
        categoria, objetivos e, se participar, em quais protocolos ele entra e qual função desempenha. O protocolo
        completo (passo a passo) deve ficar na aba <em>Conhecimento</em>.
      </div>

      {products.length === 0 && !adding && (
        <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/40 p-6 text-center">
          <Package className="w-6 h-6 mx-auto text-slate-600 mb-2" />
          <p className="text-sm text-slate-400">Nenhum produto cadastrado. Adicione o que a Nina vende.</p>
        </div>
      )}

      {products.map((p, idx) => (
        <ProductItem key={p.id} product={p} index={idx + 1} onSave={update} onDelete={remove} />
      ))}

      {adding ? (
        <div className="rounded-lg border border-cyan-500/30 bg-slate-950/40 p-4 space-y-4">
          <ProductForm draft={draft} onChange={setDraft} />
          <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
            <Button variant="ghost" size="sm" onClick={() => { setAdding(false); setDraft(EMPTY_PRODUCT_DRAFT); }} disabled={busy}>
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
          Adicionar produto
        </Button>
      )}
    </div>
  );
};

export default ProductsManager;
