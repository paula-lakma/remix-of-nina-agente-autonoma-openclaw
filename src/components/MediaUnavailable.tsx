import React from 'react';
import { ImageOff, FileX2, MicOff, VideoOff } from 'lucide-react';

type Kind = 'image' | 'audio' | 'video' | 'document' | string;

const ICON: Record<string, React.ElementType> = {
  image: ImageOff,
  audio: MicOff,
  video: VideoOff,
};

/**
 * Fallback local, discreto, para mídia que não existe mais no storage.
 * Nunca dispara toast nem popup global: é um estado esperado.
 */
export const MediaUnavailable: React.FC<{ kind?: Kind; className?: string }> = ({ kind, className }) => {
  const Icon = ICON[kind ?? ''] ?? FileX2;
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-dashed border-slate-600/60 bg-black/10 px-3 py-2 ${className ?? ''}`}
    >
      <Icon className="w-4 h-4 opacity-60 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-medium opacity-80">Mídia indisponível</p>
        <p className="text-[10px] opacity-60">arquivo não está mais disponível</p>
      </div>
    </div>
  );
};

export default MediaUnavailable;
