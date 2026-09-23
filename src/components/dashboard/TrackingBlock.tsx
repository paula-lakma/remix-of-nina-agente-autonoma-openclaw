import React from 'react';
import { Truck } from 'lucide-react';
import type { TrackingMetrics } from '@/services/dashboardMetrics';

interface Props {
  metrics: TrackingMetrics;
  periodLabel: string;
}

export const TrackingBlock: React.FC<Props> = ({ metrics, periodLabel }) => {
  const items = [
    { label: 'Enviados com sucesso', value: metrics.sent, strong: true },
    { label: 'Correios', value: metrics.correios },
    { label: 'Jadlog', value: metrics.jadlog },
    { label: 'Outros (histórico antigo)', value: metrics.others },
    { label: 'Automático Shopify', value: metrics.automatic },
    { label: 'Manual (expedição)', value: metrics.manual },
    { label: 'Bloqueados por duplicidade', value: metrics.duplicates },
    { label: 'Falhas', value: metrics.failures },
    { label: 'Indeterminados (sem envio)', value: metrics.undetermined },
  ];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-lg">
      <div className="flex items-center gap-2 mb-1">
        <Truck className="w-5 h-5 text-cyan-400" />
        <h3 className="text-lg font-semibold text-white">Rastreio</h3>
      </div>
      <p className="text-sm text-slate-400 mb-4">Período: {periodLabel}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <div key={i.label} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
            <p className="text-xs text-slate-400">{i.label}</p>
            <p className={`mt-1 font-bold ${i.strong ? 'text-2xl text-white' : 'text-xl text-slate-200'}`}>{i.value}</p>
          </div>
        ))}
      </div>
      {metrics.manualByUser.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-800 text-sm text-slate-400">
          Envios manuais por perfil:{' '}
          {metrics.manualByUser.map((u) => `${u.label} (${u.count})`).join(' · ')}
        </div>
      )}
    </div>
  );
};
