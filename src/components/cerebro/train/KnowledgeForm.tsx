import React from 'react';
import TagsInput from './TagsInput';
import MediaUpload from './MediaUpload';
import { slugify, type BrainKnowledgeInput } from '@/hooks/useBrainKnowledge';

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50';

const labelClass = 'block text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1';

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Selecione…' },
  { value: 'protocolo', label: 'Protocolo' },
  { value: 'faq', label: 'FAQ' },
  { value: 'politica', label: 'Política' },
  { value: 'processo', label: 'Processo interno' },
  { value: 'guia', label: 'Guia de atendimento' },
  { value: 'objecoes', label: 'Objeções' },
  { value: 'treinamento', label: 'Treinamento comercial' },
];

const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Não definida' },
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Média' },
  { value: 'alta', label: 'Alta' },
];

interface KnowledgeFormProps {
  draft: BrainKnowledgeInput;
  onChange: (next: BrainKnowledgeInput) => void;
  /** Quando true, recalcula o slug automaticamente a partir do título (modo criação). */
  autoSlugFromTitle?: boolean;
  onSlugManualEdit?: () => void;
}

const KnowledgeForm: React.FC<KnowledgeFormProps> = ({
  draft,
  onChange,
  autoSlugFromTitle = false,
  onSlugManualEdit,
}) => {
  const set = <K extends keyof BrainKnowledgeInput>(key: K, value: BrainKnowledgeInput[K]) =>
    onChange({ ...draft, [key]: value });

  const onTitleChange = (title: string) => {
    if (autoSlugFromTitle) {
      onChange({ ...draft, title, slug: slugify(title) });
    } else {
      set('title', title);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Identificação ── */}
      <div className="space-y-3">
        <div>
          <label className={labelClass}>Título *</label>
          <input
            type="text"
            value={draft.title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Ex: Protocolo Clareamento Facial"
            className={inputClass}
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Slug</label>
            <input
              type="text"
              value={draft.slug}
              onChange={(e) => {
                onSlugManualEdit?.();
                set('slug', e.target.value);
              }}
              placeholder="gerado-do-titulo"
              className={`${inputClass} font-mono`}
            />
          </div>
          <div>
            <label className={labelClass}>Prioridade do conhecimento</label>
            <select
              value={draft.priority ?? ''}
              onChange={(e) => set('priority', e.target.value)}
              className={inputClass}
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Classificação ── */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Tipo de conhecimento *</label>
          <select
            value={draft.knowledge_type ?? ''}
            onChange={(e) => set('knowledge_type', e.target.value)}
            className={inputClass}
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Categoria *</label>
          <input
            type="text"
            value={draft.category ?? ''}
            onChange={(e) => set('category', e.target.value)}
            placeholder="Ex: protocolos faciais, atendimento, vendas, pós-venda…"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Tags</label>
        <TagsInput
          value={draft.tags}
          onChange={(next) => set('tags', next)}
          placeholder="Ex: acne, clareamento, melasma, hidratação, anti-idade…"
        />
      </div>

      <div>
        <label className={labelClass}>Produtos relacionados</label>
        <TagsInput
          value={draft.related_products}
          onChange={(next) => set('related_products', next)}
          placeholder="Ex: Sabonete X, Sérum Y, Máscara Z…"
        />
      </div>

      {/* ── Conteúdo obrigatório ── */}
      <div>
        <label className={labelClass}>Conteúdo em markdown *</label>
        <textarea
          value={draft.content_md}
          onChange={(e) => set('content_md', e.target.value)}
          placeholder="Cole aqui o conteúdo completo: protocolo, FAQ, política, processo, guia, objeções ou treinamento."
          rows={6}
          className={`${inputClass} resize-none`}
        />
      </div>

      {/* ── Mídia aprovada do protocolo (apenas Nina envia se preenchido) ── */}
      <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-3 space-y-3">
        <div className="text-[11px] uppercase tracking-wide text-emerald-300/80 font-semibold">
          Mídia aprovada do protocolo
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          A Nina <strong>só envia</strong> imagem/PDF se a URL aprovada estiver cadastrada aqui. Ela nunca gera,
          busca externamente ou substitui mídia.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Imagem aprovada do protocolo (URL)</label>
            <input
              type="url"
              value={draft.imagem_protocolo_url ?? ''}
              onChange={(e) => set('imagem_protocolo_url', e.target.value)}
              placeholder="https://…/protocolo-clareamento.jpg"
              className={inputClass}
            />
            {draft.imagem_protocolo_url ? (
              <div className="mt-2">
                <img
                  src={draft.imagem_protocolo_url}
                  alt="Pré-visualização do protocolo"
                  className="h-24 w-auto rounded border border-slate-800 object-cover"
                  onError={(e) => ((e.currentTarget.style.display = 'none'))}
                />
              </div>
            ) : null}
          </div>
          <div>
            <label className={labelClass}>PDF aprovado do protocolo (URL)</label>
            <input
              type="url"
              value={draft.protocolo_pdf_url ?? ''}
              onChange={(e) => set('protocolo_pdf_url', e.target.value)}
              placeholder="https://…/protocolo.pdf"
              className={inputClass}
            />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Tipo de uso</label>
            <select
              value={draft.tipo_uso ?? ''}
              onChange={(e) => set('tipo_uso', e.target.value)}
              className={inputClass}
            >
              <option value="">Selecione…</option>
              <option value="profissional">Profissional</option>
              <option value="home_care">Home care</option>
              <option value="ambos">Ambos</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Categoria de intenção</label>
            <TagsInput
              value={draft.categoria_intencao}
              onChange={(next) => set('categoria_intencao', next)}
              placeholder="peeling, clareamento, manchas, acne, rejuvenescimento…"
            />
          </div>
        </div>
      </div>

      {/* ── Roteamento da Nina ── */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 space-y-3">
        <div>
          <label className={labelClass}>Quando a Nina deve usar esse conhecimento</label>
          <textarea
            value={draft.when_to_use_md ?? ''}
            onChange={(e) => set('when_to_use_md', e.target.value)}
            placeholder="Ex: usar quando a cliente perguntar sobre protocolos para manchas, clareamento ou melasma."
            rows={3}
            className={`${inputClass} resize-none`}
          />
        </div>
        <div>
          <label className={labelClass}>Quando encaminhar para atendimento humano</label>
          <textarea
            value={draft.when_to_escalate_md ?? ''}
            onChange={(e) => set('when_to_escalate_md', e.target.value)}
            placeholder="Ex: dúvidas técnicas complexas, contraindicações específicas, reações adversas, gestantes ou casos de insegurança."
            rows={3}
            className={`${inputClass} resize-none`}
          />
        </div>
      </div>
    </div>
  );
};

export function validateKnowledgeDraft(draft: BrainKnowledgeInput): string | null {
  if (!draft.title.trim()) return 'Informe o título';
  if (!(draft.knowledge_type ?? '').trim()) return 'Selecione o tipo de conhecimento';
  if (!(draft.category ?? '').trim()) return 'Informe a categoria';
  if (!draft.content_md.trim()) return 'Preencha o conteúdo em markdown';
  return null;
}

export default KnowledgeForm;
