import React from 'react';
import { brl, type ProductRow } from '@/services/ecommerceMetrics';

interface Props { rows: ProductRow[]; order: 'quantity' | 'revenue'; onOrder: (o: 'quantity' | 'revenue') => void }

export const TopProducts: React.FC<Props> = ({ rows, order, onOrder }) => (
  <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6 shadow-lg min-w-0">
    <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
      <h3 className="text-lg font-semibold text-foreground">Top produtos</h3>
      <div className="flex gap-1 bg-muted p-1 rounded-lg">
        {(['revenue', 'quantity'] as const).map((o) => (
          <button key={o} onClick={() => onOrder(o)}
            className={`px-2 py-1 text-xs rounded-md ${order === o ? 'bg-background text-foreground' : 'text-muted-foreground'}`}>
            {o === 'revenue' ? 'Receita' : 'Quantidade'}
          </button>
        ))}
      </div>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground border-b border-border">
            <th className="py-2 pr-3 font-medium">Produto</th>
            <th className="py-2 pr-3 font-medium text-right">Qtd.</th>
            <th className="py-2 pr-3 font-medium text-right hidden sm:table-cell">Pedidos</th>
            <th className="py-2 font-medium text-right">Receita</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.product_key} className="border-b border-border/50 last:border-0">
              <td className="py-2 pr-3 text-foreground max-w-[220px] truncate" title={r.product_name}>{r.product_name}</td>
              <td className="py-2 pr-3 text-right">{r.quantity}</td>
              <td className="py-2 pr-3 text-right hidden sm:table-cell">{r.orders}</td>
              <td className="py-2 text-right whitespace-nowrap">{brl(r.revenue)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">Sem vendas no período.</td></tr>}
        </tbody>
      </table>
    </div>
  </div>
);
