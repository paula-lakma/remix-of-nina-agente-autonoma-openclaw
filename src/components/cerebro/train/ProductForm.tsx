import React from 'react';
import TagsInput from './TagsInput';
import MediaUpload from './MediaUpload';
import type { BrainProductInput } from '@/hooks/useBrainProducts';

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50';

const labelClass = 'block text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1';

const CATEGORY_OPTIONS = [
  'home care', 'profissional', 'sérum', 'máscara', 'sabonete',
  'tônico', 'fluido', 'creme', 'gel', 'finalizador', 'outro',
];

const INTENCAO_OPTIONS = [
  'peeling', 'clareamento', 'manchas', 'acne', 'rejuvenescimento',
  'hidratação', 'limpeza_de_pele', 'corporal', 'oleosidade', 'anti-idade',
];

const TIPO_USO_OPTIONS: Array<{ value: 'profissional' | 'home_care' | 'ambos'; label: string }> = [
  { value: 'profissional', label: 'Profissional / cabine' },
  { value: 'home_care', label: 'Home care' },
  { value: 'ambos', label: 'Ambos' },
];

function formatBRL(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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

      {/* ── Bloco 2.2: Imagem oficial/aprovada do produto ── */}
      <div className="space-y-2">
        <label className={labelClass}>Foto oficial / aprovada do produto</label>
        <MediaUpload
          kind="image"
          path={draft.image_path}
          url={draft.image_url}
          folder="products/image"
          fileKey={draft.name || 'produto'}
          label="Upload da foto do produto (JPG, PNG, WEBP)"
          onChange={({ path, url }) =>
            onChange({ ...draft, image_path: path, image_url: url ?? draft.image_url })
          }
        />
        <div>
          <label className={labelClass}>Ou cole uma URL pública (fallback)</label>
          <input
            type="url"
            value={draft.image_url ?? ''}
            onChange={(e) => set('image_url', e.target.value)}
            placeholder="https://...  (.jpg, .png ou .webp)"
            className={inputClass}
          />
        </div>
        <p className="text-[10px] text-slate-500">
          Prioridade: arquivo no Storage &gt; URL manual. A Nina envia a foto como imagem no
          WhatsApp quando indicar o produto. Se ambos vazios, segue só com nome + link.
        </p>
      </div>


      {/* ── Bloco 2.3: Fluxo comercial (Paula) — preço, PDF, tipo de uso, intenção ── */}
      <div className="rounded-lg border border-emerald-700/40 bg-emerald-500/5 p-3 space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
          Fluxo comercial aprovado pela Paula
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Valor sem desconto (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={draft.valor_sem_desconto ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                set('valor_sem_desconto', raw === '' ? null : Number(raw));
              }}
              placeholder="Ex: 129.90"
              className={inputClass}
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Preço cheio/oficial. O valor com cupom <strong>LAKMA35</strong> é calculado automaticamente
              (35% off):{' '}
              {draft.valor_sem_desconto && draft.valor_sem_desconto > 0 ? (
                <span className="text-emerald-300">
                  R$ {formatBRL(draft.valor_sem_desconto * 0.65)}
                </span>
              ) : (
                <span className="text-slate-500">—</span>
              )}
              . Se vazio, a Nina não inventa preço.
            </p>
          </div>
          <div>
            <label className={labelClass}>Tipo de uso</label>
            <select
              value={draft.tipo_uso ?? ''}
              onChange={(e) =>
                set('tipo_uso', (e.target.value || null) as BrainProductInput['tipo_uso'])
              }
              className={inputClass}
            >
              <option value="">— Não definido —</option>
              {TIPO_USO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>PDF aprovado do protocolo (URL pública)</label>
          <input
            type="url"
            value={draft.protocolo_pdf_url ?? ''}
            onChange={(e) => set('protocolo_pdf_url', e.target.value)}
            placeholder="https://...  (somente PDF oficial/aprovado — a Nina envia como documento no WhatsApp)"
            className={inputClass}
          />
          <p className="text-[10px] text-slate-500 mt-1">
            Se vazio, a Nina não menciona PDF e não inventa documento.
          </p>
        </div>

        <div>
          <label className={labelClass}>Indicação curta (frase pronta para a Nina)</label>
          <input
            type="text"
            value={draft.indicacao_curta ?? ''}
            onChange={(e) => set('indicacao_curta', e.target.value)}
            placeholder='Ex: "Para uso profissional, eu indicaria o Kit Ácidos Sem Mistérios."'
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Categoria de intenção</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {INTENCAO_OPTIONS.map((opt) => {
              const checked = draft.categoria_intencao.includes(opt);
              return (
                <label
                  key={opt}
                  className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border cursor-pointer transition-colors ${
                    checked
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-emerald-500 w-3.5 h-3.5"
                    checked={checked}
                    onChange={() =>
                      set(
                        'categoria_intencao',
                        checked
                          ? draft.categoria_intencao.filter((c) => c !== opt)
                          : [...draft.categoria_intencao, opt]
                      )
                    }
                  />
                  {opt}
                </label>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Usado pela Nina para cruzar a intenção do lead ("quero clarear", "tenho manchas") com o produto certo.
          </p>
        </div>

        <div>
          <label className={labelClass}>Quando indicar direto (palavras-chave / situações)</label>
          <TagsInput
            value={draft.quando_indicar_direto}
            onChange={(next) => set('quando_indicar_direto', next)}
            placeholder='Ex: "manchas no rosto", "quero peeling profissional", "vitamina c"…'
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
