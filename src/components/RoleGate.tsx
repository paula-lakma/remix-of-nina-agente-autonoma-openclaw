import React from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';

interface RoleGateProps {
  area: string; // ex: 'cerebro', 'settings', 'team', 'dashboard'
  children: React.ReactNode;
  redirectTo?: string;
}

const RoleGate: React.FC<RoleGateProps> = ({ area, children, redirectTo }) => {
  const { can, loading, role, homeRoute } = useUserRole();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!can(area)) {
    const target = redirectTo ?? homeRoute;
    // Papéis com uma única área permitida (ex.: expedicao) voltam para a própria home
    if (role && !can(area) && target && !window.location.pathname.startsWith(target)) {
      return <Navigate to={target} replace />;
    }
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
        <ShieldAlert className="w-12 h-12 text-amber-500" />
        <h2 className="text-xl font-semibold text-foreground">Acesso restrito</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Você não tem permissão para acessar esta área. Solicite acesso ao administrador master.
        </p>
      </div>
    );
  }


  return <>{children}</>;
};

export default RoleGate;
