import React, { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const BUCKET = 'brain-media';
const SIGNED_TTL = 60 * 60 * 24 * 7; // 7 dias

export type MediaKind = 'image' | 'pdf';

interface MediaUploadProps {
  kind: MediaKind;
  /** path no Storage (ex: <user>/products/<id>.jpg) salvo no DB */
  path: string | null;
  /** URL atual (assinada ou manual) salva no DB */
  url: string | null;
  /** sub-pasta após o user-id (ex: "products/image", "knowledge/pdf") */
  folder: string;
  /** chave estável p/ nomear o arquivo (id do registro ou slug) */
  fileKey: string;
  onChange: (next: { path: string | null; url: string | null }) => void;
  label?: string;
}

const ACCEPT: Record<MediaKind, string> = {
  image: 'image/jpeg,image/png,image/webp',
  pdf: 'application/pdf',
};

const MAX_BYTES: Record<MediaKind, number> = {
  image: 8 * 1024 * 1024, // 8 MB
  pdf: 20 * 1024 * 1024, // 20 MB
};

function extOf(file: File, kind: MediaKind): string {
  const name = file.name.toLowerCase();
  if (kind === 'pdf') return 'pdf';
  if (name.endsWith('.png')) return 'png';
  if (name.endsWith('.webp')) return 'webp';
  return 'jpg';
}

export async function refreshSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_TTL);
  if (error) {
    console.error('[MediaUpload] sign error', error);
    return null;
  }
  return data?.signedUrl ?? null;
}

const MediaUpload: React.FC<MediaUploadProps> = ({
  kind,
  path,
  url,
  folder,
  fileKey,
  onChange,
  label,
}) => {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePick = () => inputRef.current?.click();

  const handleFile = async (file: File) => {
    setError(null);
    if (!user) {
      setError('Faça login para enviar arquivos.');
      return;
    }
    if (!ACCEPT[kind].split(',').includes(file.type)) {
      setError(`Tipo de arquivo inválido. Aceito: ${ACCEPT[kind]}`);
      return;
    }
    if (file.size > MAX_BYTES[kind]) {
      setError(`Arquivo grande demais (máx ${Math.round(MAX_BYTES[kind] / 1024 / 1024)} MB).`);
      return;
    }
    try {
      setBusy(true);
      const ext = extOf(file, kind);
      const safeKey = (fileKey || 'item').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
      const newPath = `${user.id}/${folder}/${safeKey}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(newPath, file, { contentType: file.type, upsert: true, cacheControl: '3600' });
      if (upErr) throw upErr;

      // tenta remover o antigo (best-effort)
      if (path && path !== newPath) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => null);
      }

      const signed = await refreshSignedUrl(newPath);
      onChange({ path: newPath, url: signed });
    } catch (err) {
      console.error('[MediaUpload] upload error', err);
      setError(err instanceof Error ? err.message : 'Falha no upload');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (!path) {
      onChange({ path: null, url: null });
      return;
    }
    try {
      setBusy(true);
      await supabase.storage.from(BUCKET).remove([path]).catch(() => null);
      onChange({ path: null, url: null });
    } finally {
      setBusy(false);
    }
  };

  const isImage = kind === 'image';

  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/50 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">
          {label ?? (isImage ? 'Upload de imagem' : 'Upload de PDF')}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handlePick}
            disabled={busy}
            className="text-xs px-2 py-1 rounded border border-cyan-700/50 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50"
          >
            {busy ? 'Enviando…' : path ? 'Substituir arquivo' : 'Enviar arquivo'}
          </button>
          {(path || url) && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy}
              className="text-xs px-2 py-1 rounded border border-rose-700/50 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
            >
              Remover
            </button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT[kind]}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {url && isImage && (
        <img
          src={url}
          alt="preview"
          className="h-24 w-auto rounded border border-slate-800 object-cover bg-slate-950"
          onError={(e) => ((e.currentTarget as HTMLImageElement).style.opacity = '0.3')}
        />
      )}
      {url && !isImage && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-xs text-cyan-300 underline truncate max-w-full"
        >
          Visualizar PDF enviado
        </a>
      )}
      {path && (
        <p className="text-[10px] text-slate-500 truncate">Arquivo: {path}</p>
      )}
      {error && <p className="text-[11px] text-rose-400">{error}</p>}
      <p className="text-[10px] text-slate-500">
        {isImage
          ? 'Aceita JPG, PNG, WEBP. Máx 8 MB. URL assinada de 7 dias é regenerada automaticamente no Brain Build.'
          : 'Aceita PDF. Máx 20 MB. URL assinada de 7 dias é regenerada automaticamente no Brain Build.'}
      </p>
    </div>
  );
};

export default MediaUpload;
