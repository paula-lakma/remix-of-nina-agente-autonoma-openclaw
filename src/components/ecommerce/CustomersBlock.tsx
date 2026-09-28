import React from 'react';
import { Info } from 'lucide-react';
import type { EcomSummary } from '@/services/ecommerceMetrics';

export const CustomersBlock: React.FC<{ summary: EcomSummary; historyLabel: string }> = ({ summary, historyLabel }) => {
  const c = summary.customers;
  const items = [
    { label: 'Novos', value: c.new, hint: 'Primeira compra conhecida dentro do período' },
    { label: 'Recorrentes', value: c.recurring, hint: '2+ pedidos válidos no histórico até o fim do período' },
    { label: 'Recompras no período', value: c.repurchase, hint: 'Compraram antes do período ou fizeram 2+ pedidos nele' },
  ];
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6 shadow-lg min-w-0">
      <h3 className="text-lg font-semibold text-foreground">Clientes no período</h3>
      <p className="text-sm text-muted-foreground mb-4">{summary.current.customers} clientes com pedido válido</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {items.map((i) => (
          <div key={i.label} className="rounded-xl border border-border bg-background/40 p-3" title={i.hint}>
            <p className="text-xs text-muted-foreground">{i.label}</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{i.value}</p>
            <p className="mt-1 text-[11px] text-muted-foreground leading-snug">{i.hint}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="h-4 w-4 flex-shrink-0" /> Baseado no histórico disponível desde {historyLabel}.
      </p>
    </div>
  );
};
