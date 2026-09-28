import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type AppRole = 'admin' | 'manager' | 'sdr' | 'user' | 'moderator' | 'expedicao' | 'dermo' | 'parcerias' | 'rastreio' | 'minimal';

// Papel de segurança usado quando nenhum papel conhecido é encontrado (papel novo
// ainda não reconhecido por esta versão do app). Acesso mínimo: só o chat.
export const MINIMAL_ROLE: AppRole = 'minimal';

// Permissões por área (rota base)
export const ROLE_PERMISSIONS: Record<AppRole, string[]> = {
  admin:     ['dashboard', 'ecommerce', 'pipeline', 'chat', 'contacts', 'scheduling', 'campaigns', 'templates', 'team', 'cerebro', 'settings', 'tracking'],
  manager:   ['dashboard', 'ecommerce', 'pipeline', 'chat', 'contacts', 'scheduling', 'campaigns', 'templates', 'tracking'],
  // Vendas (ecommerce): o banco já permite sdr; liberar na interface = acrescentar 'ecommerce' aqui.
  sdr:       ['pipeline', 'chat', 'contacts', 'scheduling'],
  user:      ['pipeline', 'chat', 'scheduling'], // legado (sem CRM)
  moderator: ['dashboard', 'pipeline', 'chat', 'scheduling'],
  // Fase B1: expedição passa a ver o Chat ao Vivo restrito (somente conversas
  // com concessão ativa, via backend `expedicao-chat`). Home continua /tracking.
  expedicao: ['tracking', 'chat'],
  // Dermoconsultora: somente o Chat ao Vivo restrito (backend `dermo-chat`).
  dermo:     ['chat'],
  // Parcerias (Carla): somente o Chat ao Vivo restrito (backend `parcerias-chat`).
  parcerias: ['chat'],
  // Funcionário da expedição: somente Envio de rastreio (sem chat).
  rastreio:  ['tracking'],
  // Papel desconhecido por esta versão: acesso mínimo, somente o chat.
  minimal:   ['chat'],
};

// Rota inicial por papel (usada em "/" e no fallback de acesso negado)
const ROLE_HOME: Record<AppRole, string> = {
  admin: '/dashboard',
  manager: '/dashboard',
  moderator: '/dashboard',
  sdr: '/chat',
  user: '/chat',
  expedicao: '/tracking',
  dermo: '/chat',
  parcerias: '/chat',
  rastreio: '/tracking',
  minimal: '/chat',
};

export function homeRouteForRole(role: AppRole | null): string {
  return (role && ROLE_HOME[role]) || '/chat';
}



export function useUserRole() {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (authLoading) return;
    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .order('role', { ascending: true });
      if (!active) return;
      const roles = (data || []).map((r) => r.role as AppRole);
      // prioridade: admin > manager > moderator > sdr > expedicao > dermo > parcerias > user
      const priority: AppRole[] = ['admin', 'manager', 'moderator', 'sdr', 'expedicao', 'dermo', 'parcerias', 'rastreio', 'user'];
      // Papel desconhecido / versão desatualizada do app: acesso mínimo (somente o
      // Chat ao Vivo restrito). Nunca assumir `sdr`, que abriria Pipeline,
      // Contatos e Agendamentos indevidamente.
      const resolved = priority.find((p) => roles.includes(p)) || MINIMAL_ROLE;

      setRole(resolved);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user, authLoading]);

  const isAdmin = role === 'admin';
  const can = (area: string) => (role ? ROLE_PERMISSIONS[role]?.includes(area) ?? false : false);

  return { role, isAdmin, can, loading, homeRoute: homeRouteForRole(role) };
}
