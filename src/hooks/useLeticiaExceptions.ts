import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { computeLeticiaExceptions, type LeticiaException } from '@/lib/leticiaExceptions';
import { DESTINATION_EMAILS } from '../../supabase/functions/_shared/handoff';

/** Somente leitura. `refreshKey` muda quando o Chat já atualizou a lista normal. */
export function useLeticiaExceptions(enabled: boolean, refreshKey: unknown) {
  const [items, setItems] = useState<LeticiaException[]>([]);

  const load = useCallback(async () => {
    const { data: tm } = await supabase.from('team_members').select('id').eq('email', DESTINATION_EMAILS.financeiro).maybeSingle();
    if (!tm?.id) return setItems([]);
    const { data: msgs } = await supabase
      .from('messages').select('id, conversation_id, from_type, content, sent_at')
      .eq('from_type', 'nina').ilike('content', '%let_cia%').limit(2000);
    const ids = [...new Set((msgs ?? []).map((m) => m.conversation_id))];
    if (ids.length === 0) return setItems([]);
    const [g, e, c] = await Promise.all([
      supabase.from('conversation_access_grants').select('conversation_id, team_member_id, is_active, created_at, revoked_at').in('conversation_id', ids),
      supabase.from('conversation_handoff_events').select('conversation_id, handoff_reason, created_at').in('conversation_id', ids),
      supabase.from('conversations').select('id, status, assigned_user_id, handoff_reason, contact:contacts(name)').in('id', ids),
    ]);
    setItems(computeLeticiaExceptions({
      messages: (msgs ?? []) as never,
      grants: (g.data ?? []) as never,
      events: (e.data ?? []) as never,
      conversations: (c.data ?? []).map((x: any) => ({ ...x, contact_name: x.contact?.name ?? null })),
      leticiaId: tm.id,
      now: new Date(),
    }));
  }, []);

  useEffect(() => {
    if (!enabled) { setItems([]); return; }
    const t = setTimeout(() => { load().catch(() => {}); }, 1500);
    return () => clearTimeout(t);
  }, [enabled, refreshKey, load]);

  // Reavaliação leve para a janela de 2 min vencer sem refresh manual.
  useEffect(() => {
    if (!enabled) return;
    const i = setInterval(() => { load().catch(() => {}); }, 120_000);
    return () => clearInterval(i);
  }, [enabled, load]);

  return items;
}
