import React, { useState, useRef } from 'react';
import { FileText, ScanText, Mic, Volume2, Loader2, Play, Pause, FileDown } from 'lucide-react';
import { UIMessage, MessageType } from '../types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Props = { msg: UIMessage };

export const MessageActions: React.FC<Props> = ({ msg }) => {
  const [loading, setLoading] = useState<null | 'ocr' | 'stt' | 'tts'>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [ttsUrl, setTtsUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const callFn = async (name: string, body: any) => {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  };

  const handleOcr = async (mode: 'ocr' | 'describe' = 'ocr') => {
    if (!msg.mediaUrl) return;
    setLoading('ocr');
    try {
      const data = await callFn('media-ocr', { mediaUrl: msg.mediaUrl, mode });
      setOcrText(data.text || '[vazio]');
    } catch (e: any) {
      toast.error(`OCR falhou: ${e.message || e}`);
    } finally { setLoading(null); }
  };

  const handleStt = async () => {
    if (!msg.mediaUrl) return;
    setLoading('stt');
    try {
      const data = await callFn('media-stt', { mediaUrl: msg.mediaUrl });
      setTranscript(data.text || '[vazio]');
    } catch (e: any) {
      toast.error(`Transcrição falhou: ${e.message || e}`);
    } finally { setLoading(null); }
  };

  const handleTts = async () => {
    const text = msg.content?.trim();
    if (!text) return;
    setLoading('tts');
    try {
      const data = await callFn('media-tts', { text });
      const url = `data:${data.mime};base64,${data.audioBase64}`;
      setTtsUrl(url);
      setTimeout(() => audioRef.current?.play(), 50);
    } catch (e: any) {
      toast.error(`TTS falhou: ${e.message || e}`);
    } finally { setLoading(null); }
  };

  const togglePlay = () => {
    const a = audioRef.current; if (!a) return;
    if (playing) { a.pause(); } else { a.play(); }
  };

  const isImg = msg.type === MessageType.IMAGE;
  const isAud = msg.type === MessageType.AUDIO;
  const isDoc = msg.type === MessageType.DOCUMENT;
  const isText = msg.type === MessageType.TEXT && !!msg.content?.trim();

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {(isImg || isDoc) && msg.mediaUrl && (
          <button
            onClick={() => handleOcr('ocr')}
            disabled={loading !== null}
            className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-md bg-slate-700/70 hover:bg-slate-600 text-slate-100 disabled:opacity-50"
            title="Extrair texto (OCR)"
          >
            {loading === 'ocr' ? <Loader2 className="w-3 h-3 animate-spin" /> : <ScanText className="w-3 h-3" />}
            OCR
          </button>
        )}
        {isImg && msg.mediaUrl && (
          <button
            onClick={() => handleOcr('describe')}
            disabled={loading !== null}
            className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-md bg-slate-700/70 hover:bg-slate-600 text-slate-100 disabled:opacity-50"
            title="Descrever imagem"
          >
            <FileText className="w-3 h-3" /> Descrever
          </button>
        )}
        {isAud && msg.mediaUrl && (
          <button
            onClick={handleStt}
            disabled={loading !== null}
            className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-md bg-slate-700/70 hover:bg-slate-600 text-slate-100 disabled:opacity-50"
            title="Transcrever áudio"
          >
            {loading === 'stt' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mic className="w-3 h-3" />}
            Transcrever
          </button>
        )}
        {isText && (
          <button
            onClick={ttsUrl ? togglePlay : handleTts}
            disabled={loading !== null}
            className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-md bg-slate-700/70 hover:bg-slate-600 text-slate-100 disabled:opacity-50"
            title="Ouvir mensagem (TTS)"
          >
            {loading === 'tts' ? <Loader2 className="w-3 h-3 animate-spin" /> :
              ttsUrl ? (playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />) :
              <Volume2 className="w-3 h-3" />}
            {ttsUrl ? (playing ? 'Pausar' : 'Ouvir') : 'Ouvir'}
          </button>
        )}
        {isDoc && msg.mediaUrl && (
          <a
            href={msg.mediaUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-md bg-slate-700/70 hover:bg-slate-600 text-slate-100"
          >
            <FileDown className="w-3 h-3" /> Baixar
          </a>
        )}
      </div>

      {ttsUrl && (
        <audio
          ref={audioRef}
          src={ttsUrl}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          className="hidden"
        />
      )}

      {transcript && (
        <div className="text-xs bg-slate-900/60 border border-slate-700/60 rounded-md p-2 text-slate-200">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Transcrição</div>
          <p className="whitespace-pre-wrap leading-relaxed">{transcript}</p>
        </div>
      )}
      {ocrText && (
        <div className="text-xs bg-slate-900/60 border border-slate-700/60 rounded-md p-2 text-slate-200">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Texto extraído</div>
          <p className="whitespace-pre-wrap leading-relaxed">{ocrText}</p>
        </div>
      )}
    </div>
  );
};

export default MessageActions;
