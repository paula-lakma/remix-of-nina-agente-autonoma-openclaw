import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type ProtocolStatus = 'draft' | 'approved' | 'inactive';

export const PROTOCOL_STATUS_LABELS: Record<ProtocolStatus, string> = {
  draft: 'Rascunho',
  approved: 'Aprovado',
  inactive: 'Inativo',
};

export interface BrainProtocol {
  id: string;
  name: string;
  slug: string;
  status: ProtocolStatus | string;
  knowledge_text: string | null;
  image_url: string | null;
  image_path: string | null;
  pdf_url: string | null;
  pdf_path: string | null;
  drive_url: string | null;
  created_at: string;
  updated_at: string;
}

export type BrainProtocolInput = Omit<BrainProtocol, 'id' | 'created_at' | 'updated_at'>;

const COLUMNS =
  'id, name, slug, status, knowledge_text, image_url, image_path, pdf_url, pdf_path, drive_url, created_at, updated_at';

/** Gera um slug a partir do nome (minúsculo, sem acento, hifenizado). */
export function slugifyProtocol(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const EMPTY_PROTOCOL_DRAFT: BrainProtocolInput = {
  name: '',
  slug: '',
  status: 'draft',
  knowledge_text: '',
  image_url: '',
  image_path: null,
  pdf_url: '',
  pdf_path: null,
  drive_url: '',
};

export function protocolToDraft(p: BrainProtocol): BrainProtocolInput {
  return {
    name: p.name,
    slug: p.slug,
    status: (p.status as ProtocolStatus) ?? 'draft',
    knowledge_text: p.knowledge_text ?? '',
    image_url: p.image_url ?? '',
    image_path: p.image_path ?? null,
    pdf_url: p.pdf_url ?? '',
    pdf_path: p.pdf_path ?? null,
    drive_url: p.drive_url ?? '',
  };
}

interface UseBrainProtocolsResult {
  protocols: BrainProtocol[];
  loading: boolean;
  error: string | null;
  create: (input: BrainProtocolInput) => Promise<boolean>;
  update: (id: string, patch: Partial<BrainProtocolInput>) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  refetch: () => Promise<void>;
}

/** CRUD de brain_protocols (RLS owner-scoped; slug único por owner). */
export function useBrainProtocols(): UseBrainProtocolsResult {
  const { user } = useAuth();
  const [protocols, setProtocols] = useState<BrainProtocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProtocols = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const { data, error: queryError } = await supabase
        .from('brain_protocols')
        .select(COLUMNS)
        .order('created_at', { ascending: true });
      if (queryError) throw queryError;
      setProtocols((data ?? []) as BrainProtocol[]);
    } catch (err) {
      console.error('[useBrainProtocols] Erro ao carregar:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar protocolos');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProtocols();
  }, [fetchProtocols]);

  const isDuplicateSlug = (err: unknown) => (err as { code?: string })?.code === '23505';

  const create = useCallback(
    async (input: BrainProtocolInput): Promise<boolean> => {
      if (!user) return false;
      try {
        const { error: insertError } = await supabase
          .from('brain_protocols')
          .insert({ ...input, owner_user_id: user.id });
        if (insertError) throw insertError;
        await fetchProtocols();
        return true;
      } catch (err) {
        console.error('[useBrainProtocols] Erro ao criar:', err);
        setError(
          isDuplicateSlug(err)
            ? 'Já existe um protocolo com esse slug'
            : err instanceof Error
              ? err.message
              : 'Erro ao criar protocolo'
        );
        return false;
      }
    },
    [user, fetchProtocols]
  );

  const update = useCallback(
    async (id: string, patch: Partial<BrainProtocolInput>): Promise<boolean> => {
      try {
        const { error: updateError } = await supabase
          .from('brain_protocols')
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (updateError) throw updateError;
        await fetchProtocols();
        return true;
      } catch (err) {
        console.error('[useBrainProtocols] Erro ao atualizar:', err);
        setError(
          isDuplicateSlug(err)
            ? 'Já existe um protocolo com esse slug'
            : err instanceof Error
              ? err.message
              : 'Erro ao atualizar protocolo'
        );
        return false;
      }
    },
    [fetchProtocols]
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const { error: deleteError } = await supabase.from('brain_protocols').delete().eq('id', id);
        if (deleteError) throw deleteError;
        await fetchProtocols();
        return true;
      } catch (err) {
        console.error('[useBrainProtocols] Erro ao remover:', err);
        setError(err instanceof Error ? err.message : 'Erro ao remover protocolo');
        return false;
      }
    },
    [fetchProtocols]
  );

  return { protocols, loading, error, create, update, remove, refetch: fetchProtocols };
}
