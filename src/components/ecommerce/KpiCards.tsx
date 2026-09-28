import React from 'react';
import { DollarSign, Receipt, ShoppingBag, Users } from 'lucide-react';
import { brl, type EcomSummary } from '@/services/ecommerceMetrics';
import { pctChange } from '@/lib/ecommercePeriod';

interface Props { summary: EcomSummary; compare: boolean }

const Delta: React.FC<{ cur: number; prev: number; show: boolean }> = ({ cur, prev, show }) => {
  const p = show ? pctChange(cur, prev) : null;
  if (p === null) return <span className="text-xs text-muted-foreground">sem base de comparação</span>;
  const up = p >= 0;
  return (
    <span className={`text-xs font-medium ${up ? 'text-primary' : 'text-destructive'}`}>
      {up ? '+' : ''}{p.toFixed(1).replace('.', ',')}% vs período anterior
    </span>
  );
};

export const KpiCards: React.FC<Props> = ({ summary, compare }) => {
  const c = summary.current;
  const p = summary.previous;
  const ticket = c.orders ? c.revenue / c.orders : 0;
  const prevTicket = p.orders ? p.revenue / p.orders : 0;
  const cards = [
    { label: 'Receita de produtos', value: brl(c.revenue), icon: DollarSign, delta: <Delta cur={c.revenue} prev={p.revenue} show={compare} />,
      extra: `Frete ${brl(c.shipping)} · Total ${brl(c.total)}` },
    { label: 'Pedidos válidos', value: c.orders.toLocaleString('pt-BR'), icon: ShoppingBag, delta: <Delta cur={c.orders} prev={p.orders} show={compare} /> },
    { label: 'Ticket médio', value: brl(ticket), icon: Receipt, delta: <Delta cur={ticket} prev={prevTicket} show={compare} /> },
    { label: 'Clientes únicos', value: c.customers.toLocaleString('pt-BR'), icon: Users, delta: <Delta cur={c.customers} prev={p.customers} show={compare} />,
      extra: `${summary.customers.new} novos no período` },
  ];
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((k) => (
        <div key={k.label} className="rounded-2xl border border-border bg-card/60 p-5 shadow-lg min-w-0">
          <div className="flex items-center justify-between pb-2">
            <span className="text-sm font-medium text-muted-foreground">{k.label}</span>
            <k.icon className="h-5 w-5 text-primary" />
          </div>
          <div className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight truncate">{k.value}</div>
          <div className="mt-1">{k.delta}</div>
          {k.extra && <div className="mt-1 text-xs text-muted-foreground">{k.extra}</div>}
        </div>
      ))}
    </div>
  );
};
