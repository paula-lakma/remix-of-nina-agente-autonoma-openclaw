import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface BrainProduct {
  id: string;
  name: string;
  summary: string | null;
  details_md: string | null;
  site_url: string | null;
  mercadolivre_url: string | null;
  aliases: string[];
  category: string[];
  skin_types: string[];
  main_goals: string[];
  usage_short: string | null;
  in_protocols: boolean | null;
  related_protocols: string[];
  protocol_role: string | null;
  combines_with: string[];
  avoid_combinations: string | null;
  common_objections_md: string | null;
  internal_notes_md: string | null;
  position: number;
  is_active: boolean;
}

export type BrainProductInput = Omit<BrainProduct, 'id' | 'position'>;

interface UseBrainProductsResult {
  products: BrainProduct[];
  loading: boolean;
  error: string | null;
  create: (input: BrainProductInput) => Promise<boolean>;
  update: (id: string, patch: Partial<BrainProductInput>) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  refetch: () => Promise<void>;
}

const PRODUCT_COLUMNS =
  'id, name, summary, details_md, site_url, mercadolivre_url, aliases, category, skin_types, main_goals, usage_short, in_protocols, related_protocols, protocol_role, combines_with, avoid_combinations, common_objections_md, internal_notes_md, position, is_active';

/** CRUD de brain_products (RLS owner-scoped; owner_user_id default = auth.uid()). */
export function useBrainProducts(): UseBrainProductsResult {
  const { user } = useAuth();
  const [products, setProducts] = useState<BrainProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const { data, error: queryError } = await supabase
        .from('brain_products')
        .select(PRODUCT_COLUMNS)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

      if (queryError) throw queryError;
      setProducts((data ?? []) as BrainProduct[]);
    } catch (err) {
      console.error('[useBrainProducts] Erro ao carregar:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar produtos');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const create = useCallback(
    async (input: BrainProductInput): Promise<boolean> => {
      try {
        const position = products.length;
        const { error: insertError } = await supabase
          .from('brain_products')
          .insert({ ...input, position });
        if (insertError) throw insertError;
        await fetchProducts();
        return true;
      } catch (err) {
        console.error('[useBrainProducts] Erro ao criar:', err);
        setError(err instanceof Error ? err.message : 'Erro ao criar produto');
        return false;
      }
    },
    [products.length, fetchProducts]
  );

  const update = useCallback(
    async (id: string, patch: Partial<BrainProductInput>): Promise<boolean> => {
      try {
        const { error: updateError } = await supabase
          .from('brain_products')
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (updateError) throw updateError;
        await fetchProducts();
        return true;
      } catch (err) {
        console.error('[useBrainProducts] Erro ao atualizar:', err);
        setError(err instanceof Error ? err.message : 'Erro ao atualizar produto');
        return false;
      }
    },
    [fetchProducts]
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const { error: deleteError } = await supabase.from('brain_products').delete().eq('id', id);
        if (deleteError) throw deleteError;
        await fetchProducts();
        return true;
      } catch (err) {
        console.error('[useBrainProducts] Erro ao remover:', err);
        setError(err instanceof Error ? err.message : 'Erro ao remover produto');
        return false;
      }
    },
    [fetchProducts]
  );

  return { products, loading, error, create, update, remove, refetch: fetchProducts };
}

export const EMPTY_PRODUCT_DRAFT: BrainProductInput = {
  name: '',
  summary: '',
  details_md: '',
  site_url: '',
  mercadolivre_url: '',
  category: [],
  skin_types: [],
  main_goals: [],
  usage_short: '',
  in_protocols: null,
  related_protocols: [],
  protocol_role: '',
  combines_with: [],
  avoid_combinations: '',
  common_objections_md: '',
  internal_notes_md: '',
  is_active: true,
};

export function productToDraft(p: BrainProduct): BrainProductInput {
  return {
    name: p.name,
    summary: p.summary,
    details_md: p.details_md,
    site_url: p.site_url,
    mercadolivre_url: p.mercadolivre_url,
    category: p.category ?? [],
    skin_types: p.skin_types ?? [],
    main_goals: p.main_goals ?? [],
    usage_short: p.usage_short,
    in_protocols: p.in_protocols,
    related_protocols: p.related_protocols ?? [],
    protocol_role: p.protocol_role,
    combines_with: p.combines_with ?? [],
    avoid_combinations: p.avoid_combinations,
    common_objections_md: p.common_objections_md,
    internal_notes_md: p.internal_notes_md,
    is_active: p.is_active,
  };
}
