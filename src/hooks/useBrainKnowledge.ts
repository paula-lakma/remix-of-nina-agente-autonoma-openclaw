import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type KnowledgeType =
  | 'protocolo'
  | 'faq'
  | 'politica'
  | 'processo'
  | 'guia'
  | 'objecoes'
  | 'treinamento';

export type KnowledgePriority = 'baixa' | 'media' | 'alta';

export interface BrainKnowledge {
  id: string;
  title: string;
  slug: string;
  content_md: string;
  knowledge_type: KnowledgeType | string | null;
  category: string | null;
  tags: string[];
  related_products: string[];
  when_to_use_md: string | null;
  when_to_escalate_md: string | null;
  priority: KnowledgePriority | string | null;
  position: number;
}

export type BrainKnowledgeInput = Omit<BrainKnowledge, 'id' | 'position'>;

interface UseBrainKnowledgeResult {
  entries: BrainKnowledge[];
  loading: boolean;
  error: string | null;
  create: (input: BrainKnowledgeInput) => Promise<boolean>;
  update: (id: string, patch: Partial<BrainKnowledgeInput>) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  refetch: () => Promise<void>;
}

const KNOWLEDGE_COLUMNS =
  'id, title, slug, content_md, knowledge_type, category, tags, related_products, when_to_use_md, when_to_escalate_md, priority, position';

/** Gera um slug a partir do título (minúsculo, sem acento, hifenizado). */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** CRUD de brain_knowledge (RLS owner-scoped; slug único por owner). */
export function useBrainKnowledge(): UseBrainKnowledgeResult {
  const { user } = useAuth();
  const [entries, setEntries] = useState<BrainKnowledge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const { data, error: queryError } = await supabase
        .from('brain_knowledge')
        .select(KNOWLEDGE_COLUMNS)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

      if (queryError) throw queryError;
      setEntries((data ?? []) as BrainKnowledge[]);
    } catch (err) {
      console.error('[useBrainKnowledge] Erro ao carregar:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar conhecimento');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const isDuplicateSlug = (err: unknown) =>
    typeof (err as { code?: string })?.code === 'string' &&
    (err as { code: string }).code === '23505';

  const create = useCallback(
    async (input: BrainKnowledgeInput): Promise<boolean> => {
      try {
        const position = entries.length;
        const { error: insertError } = await supabase
          .from('brain_knowledge')
          .insert({ ...input, position });
        if (insertError) throw insertError;
        await fetchEntries();
        return true;
      } catch (err) {
        console.error('[useBrainKnowledge] Erro ao criar:', err);
        setError(isDuplicateSlug(err) ? 'Já existe um item com esse slug' : err instanceof Error ? err.message : 'Erro ao criar item');
        return false;
      }
    },
    [entries.length, fetchEntries]
  );

  const update = useCallback(
    async (id: string, patch: Partial<BrainKnowledgeInput>): Promise<boolean> => {
      try {
        const { error: updateError } = await supabase
          .from('brain_knowledge')
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (updateError) throw updateError;
        await fetchEntries();
        return true;
      } catch (err) {
        console.error('[useBrainKnowledge] Erro ao atualizar:', err);
        setError(isDuplicateSlug(err) ? 'Já existe um item com esse slug' : err instanceof Error ? err.message : 'Erro ao atualizar item');
        return false;
      }
    },
    [fetchEntries]
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const { error: deleteError } = await supabase.from('brain_knowledge').delete().eq('id', id);
        if (deleteError) throw deleteError;
        await fetchEntries();
        return true;
      } catch (err) {
        console.error('[useBrainKnowledge] Erro ao remover:', err);
        setError(err instanceof Error ? err.message : 'Erro ao remover item');
        return false;
      }
    },
    [fetchEntries]
  );

  return { entries, loading, error, create, update, remove, refetch: fetchEntries };
}

export const EMPTY_KNOWLEDGE_DRAFT: BrainKnowledgeInput = {
  title: '',
  slug: '',
  content_md: '',
  knowledge_type: '',
  category: '',
  tags: [],
  related_products: [],
  when_to_use_md: '',
  when_to_escalate_md: '',
  priority: '',
};

export function knowledgeToDraft(k: BrainKnowledge): BrainKnowledgeInput {
  return {
    title: k.title,
    slug: k.slug,
    content_md: k.content_md,
    knowledge_type: k.knowledge_type ?? '',
    category: k.category ?? '',
    tags: k.tags ?? [],
    related_products: k.related_products ?? [],
    when_to_use_md: k.when_to_use_md ?? '',
    when_to_escalate_md: k.when_to_escalate_md ?? '',
    priority: k.priority ?? '',
  };
}
