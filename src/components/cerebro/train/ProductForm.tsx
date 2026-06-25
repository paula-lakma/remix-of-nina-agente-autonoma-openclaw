import React from 'react';
import TagsInput from './TagsInput';
import type { BrainProductInput } from '@/hooks/useBrainProducts';

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50';

const labelClass = 'block text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1';

const CATEGORY_OPTIONS = [
  'home care', 'profissional', 'sérum', 'máscara', 'sabonete',
  'tônico', 'fluido', 'creme', 'gel', 'finalizador', 'outro',
];

interface ProductFormProps {
  draft: BrainProductInput;
  onChange: (next: BrainProductInput) => void;
}

const ProductForm: React.FC<ProductFormProps> = ({ draft, onChange }) => {
  const set = <K extends keyof BrainProductInput>(key: K, value: BrainProductInput[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <div className="space-y-4">
      {/* ── Bloco 1: Identificação básica (obrigatórios) ── */}
      <div className="space-y-3">
        <div>
          <label className={labelClass}>Nome do produto *</label>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Ex: Sérum Clareador Facial Lakma"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Resumo curto *</label>
          <input
            type="text"
            value={draft.summary ?? ''}
            onChange={(e) => set('summary', e.target.value)}
            placeholder="Escreva em 1 frase o que é o produto e qual sua principal função."
            className={inputClass}
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Categorias do produto *</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {CATEGORY_OPTIONS.map((opt) => {
                const checked = draft.category.includes(opt);
                return (
                  <label
                    key={opt}
                    className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border cursor-pointer transition-colors ${
                      checked
                        ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                        : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-cyan-500 w-3.5 h-3.5"
                      checked={checked}
                      onChange={() =>
                        set(
                          'category',
                          checked
                            ? draft.category.filter((c) => c !== opt)
                            : [...draft.category, opt]
                        )
                      }
                    />
                    {opt}
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <label className={labelClass}>Principal objetivo *</label>
            <TagsInput
              value={draft.main_goals}
              onChange={(next) => set('main_goals', next)}
              placeholder="Ex: clareamento, hidratação, firmeza…"
            />
          </div>
        </div>
      </div>

      {/* ── Bloco 2: Links ── */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Link do site</label>
          <input
            type="url"
            value={draft.site_url ?? ''}
            onChange={(e) => set('site_url', e.target.value)}
            placeholder="Cole aqui o link do produto no site, se houver."
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Link do Mercado Livre</label>
          <input
            type="url"
            value={draft.mercadolivre_url ?? ''}
            onChange={(e) => set('mercadolivre_url', e.target.value)}
            placeholder="Cole aqui o link no Mercado Livre, se houver."
            className={inputClass}
          />
        </div>
      </div>

      {/* ── Bloco 2.5: Aliases / sinônimos ── */}
      <div>
        <label className={labelClass}>Aliases / sinônimos do produto</label>
        <TagsInput
          value={draft.aliases}
          onChange={(next) => set('aliases', next)}
          placeholder='Ex: "Biocomplex", "Bio Complex", "Peeling Inverno"… (usado p/ casar com nomes citados em protocolos)'
        />
        <p className="text-[10px] text-slate-500 mt-1">
          Cadastre variações de escrita ou apelidos. A Nina usa esses aliases ao cruzar com o
          nome citado nos protocolos para achar o link individual do produto.
        </p>
      </div>

      {/* ── Bloco 3: Indicações / uso ── */}
      <div className="space-y-3">
        <div>
          <label className={labelClass}>Tipo de pele / condição indicada</label>
          <TagsInput
            value={draft.skin_types}
            onChange={(next) => set('skin_types', next)}
            placeholder="Ex: acneica, oleosa, sensível, manchada, anti-idade…"
          />
        </div>
        <div>
          <label className={labelClass}>Modo de uso resumido</label>
          <input
            type="text"
            value={draft.usage_short ?? ''}
            onChange={(e) => set('usage_short', e.target.value)}
            placeholder="Ex: aplicar à noite, após higienização da pele."
            className={inputClass}
          />
        </div>
      </div>

      {/* ── Bloco 4: Protocolos ── */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 space-y-3">
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.in_protocols === true}
            onChange={(e) => set('in_protocols', e.target.checked ? true : null)}
            className="accent-cyan-500"
          />
          Participa de protocolos?
        </label>
        <div>
          <label className={labelClass}>Protocolos relacionados</label>
          <TagsInput
            value={draft.related_protocols}
            onChange={(next) => set('related_protocols', next)}
            placeholder="Ex: Protocolo Clareamento Facial, Protocolo Acne…"
          />
        </div>
        <div>
          <label className={labelClass}>Função dentro do protocolo</label>
          <input
            type="text"
            value={draft.protocol_role ?? ''}
            onChange={(e) => set('protocol_role', e.target.value)}
            placeholder="Ex: higienização, permeação, hidratação, fotoproteção…"
            className={inputClass}
          />
        </div>
      </div>

      {/* ── Bloco 5: Combinações ── */}
      <div className="space-y-3">
        <div>
          <label className={labelClass}>Produtos que combinam</label>
          <TagsInput
            value={draft.combines_with}
            onChange={(next) => set('combines_with', next)}
            placeholder="Ex: Sabonete X, Sérum Y, Hidratante Z…"
          />
        </div>
        <div>
          <label className={labelClass}>Produtos que não devem ser combinados / atenção</label>
          <textarea
            value={draft.avoid_combinations ?? ''}
            onChange={(e) => set('avoid_combinations', e.target.value)}
            placeholder="Informe restrições, cuidados ou combinações que exigem atenção. Se não houver, deixe em branco."
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>
      </div>

      {/* ── Bloco 6: Detalhes obrigatórios ── */}
      <div>
        <label className={labelClass}>Detalhes em markdown *</label>
        <textarea
          value={draft.details_md ?? ''}
          onChange={(e) => set('details_md', e.target.value)}
          placeholder="Descreva informações completas: função, indicações, benefícios, modo de uso, diferenciais, objeções, protocolos e observações para a Nina."
          rows={5}
          className={`${inputClass} resize-none`}
        />
      </div>

      {/* ── Bloco 7: Conteúdo opcional para a Nina ── */}
      <div className="space-y-3">
        <div>
          <label className={labelClass}>Objeções comuns e respostas sobre o produto</label>
          <textarea
            value={draft.common_objections_md ?? ''}
            onChange={(e) => set('common_objections_md', e.target.value)}
            placeholder='Ex: "Pode usar em pele sensível?" / "É indicado para uso diário?" Deixe em branco se ainda não houver.'
            rows={3}
            className={`${inputClass} resize-none`}
          />
        </div>
        <div>
          <label className={labelClass}>Observações internas para a Nina sobre o produto</label>
          <textarea
            value={draft.internal_notes_md ?? ''}
            onChange={(e) => set('internal_notes_md', e.target.value)}
            placeholder="Ex: quando recomendar, quando evitar, quando encaminhar para atendimento humano."
            rows={3}
            className={`${inputClass} resize-none`}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
        <input
          type="checkbox"
          checked={draft.is_active}
          onChange={(e) => set('is_active', e.target.checked)}
          className="accent-cyan-500"
        />
        Produto ativo
      </label>
    </div>
  );
};

/** Valida campos obrigatórios do produto. Retorna mensagem de erro ou null. */
export function validateProductDraft(draft: BrainProductInput): string | null {
  if (!draft.name.trim()) return 'Informe o nome do produto';
  if (!(draft.summary ?? '').trim()) return 'Informe o resumo curto';
  if (!draft.category.length) return 'Selecione ao menos uma categoria do produto';
  if (!draft.main_goals.length) return 'Informe ao menos um objetivo principal';
  if (!(draft.details_md ?? '').trim()) return 'Preencha os detalhes em markdown';
  return null;
}

export default ProductForm;
