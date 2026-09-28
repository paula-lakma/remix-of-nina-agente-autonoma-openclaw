import React from 'react';
import { brl, type CouponRow } from '@/services/ecommerceMetrics';

export const TopCoupons: React.FC<{ rows: CouponRow[]; revenue: number; withCouponRevenue: number }> = ({ rows, revenue, withCouponRevenue }) => {
  const share = revenue ? Math.round((withCouponRevenue / revenue) * 100) : null;
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6 shadow-lg min-w-0">
      <h3 className="text-lg font-semibold text-foreground">Top cupons</h3>
      <p className="text-sm text-muted-foreground mb-4">
        {share !== null ? `${share}% da receita do período veio de pedidos com algum cupom.` : 'Sem vendas no período.'}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-2 pr-3 font-medium">Cupom</th>
              <th className="py-2 pr-3 font-medium text-right">Pedidos</th>
              <th className="py-2 pr-3 font-medium text-right">Receita</th>
              <th className="py-2 font-medium text-right hidden sm:table-cell">Ticket médio</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.coupon ?? '__none'} className={`border-b border-border/50 last:border-0 ${r.is_no_coupon ? 'text-muted-foreground' : ''}`}>
                <td className="py-2 pr-3 font-medium">{r.is_no_coupon ? 'Sem cupom' : r.coupon}</td>
                <td className="py-2 pr-3 text-right">{r.orders}</td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">{brl(r.revenue)}</td>
                <td className="py-2 text-right whitespace-nowrap hidden sm:table-cell">{r.orders ? brl(r.avg_ticket) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
