import React from 'react';
import type { EcomSummary } from '@/services/ecommerceMetrics';

export const OrderStatusBlock: React.FC<{ summary: EcomSummary }> = ({ summary }) => {
  const s = summary.status;
  const items = [
    { label: 'Pendentes', value: s.pending },
    { label: 'Cancelados / anulados', value: s.cancelled },
    { label: 'Testes', value: s.test },
    ...(s.other_invalid ? [{ label: 'Outros inválidos', value: s.other_invalid }] : []),
  ];
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6 shadow-lg min-w-0">
      <h3 className="text-lg font-semibold text-foreground">Situação dos pedidos</h3>
      <p className="text-sm text-muted-foreground mb-4">Pedidos fora das métricas principais, criados no período</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((i) => (
          <div key={i.label} className="rounded-xl border border-border bg-background/40 p-3">
            <p className="text-xs text-muted-foreground">{i.label}</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{i.value}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Pendentes podem virar pagos depois; a receita de dias recentes pode subir.</p>
    </div>
  );
};
