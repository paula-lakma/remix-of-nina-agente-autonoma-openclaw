import React from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { brl, type SeriesPoint } from '@/services/ecommerceMetrics';
import type { Bucket } from '@/lib/ecommercePeriod';

interface Props { data: SeriesPoint[]; bucket: Bucket }

const label = (iso: string, bucket: Bucket) => {
  const [d, t] = iso.split('T');
  const [, m, day] = d.split('-');
  if (bucket === 'hour') return `${(t || '00').slice(0, 2)}h`;
  return bucket === 'week' ? `sem ${day}/${m}` : `${day}/${m}`;
};

export const SalesChart: React.FC<Props> = ({ data, bucket }) => {
  const rows = data.map((d) => ({ ...d, name: label(d.bucket_start, bucket) }));
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6 shadow-lg">
      <h3 className="text-lg font-semibold text-foreground">Evolução de vendas</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Receita de produtos e pedidos válidos por {bucket === 'hour' ? 'hora' : bucket === 'day' ? 'dia' : 'semana'}
      </p>
      <div className="h-[240px] sm:h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 10, right: 0, left: -10, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" minTickGap={16} />
            <YAxis yAxisId="r" axisLine={false} tickLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))"
              tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
            <YAxis yAxisId="o" orientation="right" axisLine={false} tickLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
            <Tooltip
              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, color: 'hsl(var(--foreground))' }}
              formatter={(v: number, n: string) => (n === 'revenue' ? [brl(v), 'Receita'] : [v, 'Pedidos'])}
            />
            <Bar yAxisId="o" dataKey="orders" fill="hsl(var(--accent))" fillOpacity={0.5} radius={[4, 4, 0, 0]} />
            <Area yAxisId="r" type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="hsl(var(--primary))" fillOpacity={0.15} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
