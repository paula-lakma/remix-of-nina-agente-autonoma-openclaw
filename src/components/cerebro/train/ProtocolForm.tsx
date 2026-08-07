import React from 'react';
import MediaUpload from './MediaUpload';
import {
  PROTOCOL_STATUS_LABELS,
  slugifyProtocol,
  type BrainProtocolInput,
  type ProtocolStatus,
} from '@/hooks/useBrainProtocols';

interface ProtocolFormProps {
  draft: BrainProtocolInput;
  onChange: (next: BrainProtocolInput) => void;
  autoSlugFromName?: boolean;
  onSlugManualEdit?: () => void;
  /** id do protocolo (define a pasta no Storage). Ausente em criação. */
  protocolId?: string;
}

export function validateProtocolDraft(draft: BrainProtocolInput): string | null {
  if (!draft.name.trim()) return 'Informe o nome do protocolo';
  const slug = (draft.slug || slugifyProtocol(draft.name)).trim();
  if (!slug) return 'Informe um slug válido';
  return null;
}

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-slate-800 bg-slate-950/60 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50';
const labelCls = 'block text-[11px] uppercase tracking-wide text-slate-400 mb-1.5';

const ProtocolForm: React.FC<ProtocolFormProps> = ({
  draft,
  onChange,
  autoSlugFromName = false,
  onSlugManualEdit,
  protocolId,
}) => {
  const set = (patch: Partial<BrainProtocolInput>) => onChange({ ...draft, ...patch });

  const folderKey = protocolId ?? draft.slug || slugifyProtocol(draft.name) || 'novo';

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Nome do protocolo</label>
          <input
            className={inputCls}
            value={draft.name}
            placeholder="Ex: Protocolo de manchas"
            onChange={(e) => {
              const name = e.target.value;
              set(autoSlugFromName ? { name, slug: slugifyProtocol(name) } : { name });
            }}
          />
        </div>
        <div>
          <label className={labelCls}>Slug (identificador interno)</label>
          <input
            className={inputCls}
            value={draft.slug}
            placeholder="protocolo-de-manchas"
            onChange={(e) => {
              onSlugManualEdit?.();
              set({ slug: e.target.value });
            }}
          />
          <p className="text-[10px] text-slate-500 mt-1">
            Usado apenas como identificador interno — nunca vira URL de produto.
          </p>
        </div>
      </div>

      <div className="sm:max-w-[220px]">
        <label className={labelCls}>Status</label>
        <select
          className={inputCls}
          value={draft.status}
          onChange={(e) => set({ status: e.target.value as ProtocolStatus })}
        >
          {(Object.keys(PROTOCOL_STATUS_LABELS) as ProtocolStatus[]).map((s) => (
            <option key={s} value={s}>
              {PROTOCOL_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>Conhecimento do protocolo</label>
        <textarea
          className={`${inputCls} min-h-[220px] font-mono text-[13px] leading-relaxed`}
          value={draft.knowledge_text ?? ''}
          placeholder={
            'Objetivo:\nIndicação:\nQuando indicar:\nQuando não indicar / encaminhar:\nProdutos utilizados (nomes):'
          }
          onChange={(e) => set({ knowledge_text: e.target.value })}
        />
        <p className="text-[10px] text-slate-500 mt-1">
          Texto único com objetivo, indicação, quando indicar, quando encaminhar e nomes dos produtos utilizados.
          Preço, foto e link continuam exclusivamente no cadastro de Produtos.
        </p>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 space-y-3">
        <p className="text-[11px] uppercase tracking-wide text-slate-400">Material oficial</p>

        <MediaUpload
          kind="image"
          label="Imagem aprovada do protocolo"
          path={draft.image_path}
          url={draft.image_url}
          folder={`protocols/${folderKey}`}
          fileKey="imagem"
          onChange={({ path, url }) => set({ image_path: path, image_url: url })}
        />
        <div>
          <label className={labelCls}>Ou URL manual da imagem</label>
          <input
            className={inputCls}
            value={draft.image_url ?? ''}
            placeholder="https://..."
            onChange={(e) => set({ image_url: e.target.value })}
          />
        </div>

        <MediaUpload
          kind="pdf"
          label="PDF aprovado do protocolo"
          path={draft.pdf_path}
          url={draft.pdf_url}
          folder={`protocols/${folderKey}`}
          fileKey="protocolo"
          onChange={({ path, url }) => set({ pdf_path: path, pdf_url: url })}
        />
        <div>
          <label className={labelCls}>Ou URL manual do PDF</label>
          <input
            className={inputCls}
            value={draft.pdf_url ?? ''}
            placeholder="https://..."
            onChange={(e) => set({ pdf_url: e.target.value })}
          />
        </div>

        <div>
          <label className={labelCls}>Link oficial do Drive</label>
          <input
            className={inputCls}
            value={draft.drive_url ?? ''}
            placeholder="https://drive.google.com/..."
            onChange={(e) => set({ drive_url: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
};

export default ProtocolForm;
