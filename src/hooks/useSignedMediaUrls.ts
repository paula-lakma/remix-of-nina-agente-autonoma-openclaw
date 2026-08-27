import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Resolve URLs assinadas frescas para mensagens com mídia.
// O bucket é privado: o link é gerado sob demanda pela edge function
// `chat-media`, que revalida sessão e permissão no servidor.

export interface MediaRef {
  id: string;
  conversationId?: string | null;
  hasMedia: boolean;
}

interface CacheEntry {
  url: string;
  filename: string | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry | null>>();

async function resolveOne(id: string, conversationId?: string | null): Promise<CacheEntry | null> {
  const cached = cache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const existing = inflight.get(id);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('chat-media', {
        body: { message_id: id, conversation_id: conversationId ?? undefined },
      });
      if (error) return null;
      const payload = data as { url?: string; filename?: string | null; expires_in?: number } | null;
      if (!payload?.url) return null;
      const entry: CacheEntry = {
        url: payload.url,
        filename: payload.filename ?? null,
        // renova com folga antes do vencimento real
        expiresAt: Date.now() + ((payload.expires_in ?? 3600) - 300) * 1000,
      };
      cache.set(id, entry);
      return entry;
    } catch {
      return null;
    } finally {
      inflight.delete(id);
    }
  })();

  inflight.set(id, promise);
  return promise;
}

export function useSignedMediaUrls(refs: MediaRef[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = refs.filter(r => r.hasMedia).map(r => r.id).join(',');

  useEffect(() => {
    let cancelled = false;
    const targets = refs.filter(r => r.hasMedia);
    if (targets.length === 0) return;

    (async () => {
      for (const t of targets) {
        const entry = await resolveOne(t.id, t.conversationId);
        if (cancelled || !entry) continue;
        setUrls(prev => (prev[t.id] === entry.url ? prev : { ...prev, [t.id]: entry.url }));
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return urls;
}
