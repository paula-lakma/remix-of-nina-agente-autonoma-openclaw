import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { KpiCards } from '@/components/ecommerce/KpiCards';
import { SalesChart } from '@/components/ecommerce/SalesChart';
import { TopProducts } from '@/components/ecommerce/TopProducts';
import { TopCoupons } from '@/components/ecommerce/TopCoupons';
import { CustomersBlock } from '@/components/ecommerce/CustomersBlock';
import { OrderStatusBlock } from '@/components/ecommerce/OrderStatusBlock';
import { PeriodFilter } from '@/components/ecommerce/PeriodFilter';
import {
  fetchEcomSeries, fetchEcomSummary, fetchTopCoupons, fetchTopProducts,
  type CouponRow, type EcomSummary, type ProductRow, type SeriesPoint,
} from '@/services/ecommerceMetrics';
import {
  HISTORY_FALLBACK_START, addDays, canCompare, formatDayBR, resolvePeriod, toSPDay, todaySP, type PeriodKind,
} from '@/lib/ecommercePeriod';

const Ecommerce: React.FC = () => {
  const today = todaySP();
  const [kind, setKind] = useState<PeriodKind>('30days');
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today });
  const [historyStart, setHistoryStart] = useState(HISTORY_FALLBACK_START);
  const [productOrder, setProductOrder] = useState<'quantity' | 'revenue'>('revenue');
  const [summary, setSummary] = useState<EcomSummary | null>(null);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const period = useMemo(() => resolvePeriod(kind, { historyStart, custom }), [kind, historyStart, custom]);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const [s, t, p, c] = await Promise.all([
        fetchEcomSummary(period.from, period.to, force),
        fetchEcomSeries(period.from, period.to, period.bucket, force),
        fetchTopProducts(period.from, period.to, productOrder, force),
        fetchTopCoupons(period.from, period.to, force),
      ]);
      setSummary(s); setSeries(t); setProducts(p); setCoupons(c);
      if (s.bounds.first_order_at) setHistoryStart(toSPDay(s.bounds.first_order_at));
      setUpdatedAt(new Date());
    } catch (e) {
      console.error('Erro ao carregar vendas:', e);
      setError('Não foi possível carregar os indicadores de vendas.');
    } finally {
      setLoading(false);
    }
  }, [period, productOrder]);

  useEffect(() => { load(); }, [load]);

  const compare = summary ? canCompare(period.prevFrom, summary.bounds.first_order_at, summary.previous.orders) : false;
  const historyLabel = formatDayBR(historyStart);

  return (
    <div className="p-4 sm:p-6 space-y-6 overflow-y-auto h-full custom-scrollbar">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Vendas</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Pedidos válidos da loja de {formatDayBR(period.fromDay)} a {formatDayBR(addDays(period.toDayExclusive, -1))}.
          </p>
          {period.clampedToHistory && (
            <p className="text-xs text-muted-foreground mt-1">Dados disponíveis a partir de {historyLabel}.</p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-start">
          <PeriodFilter kind={kind} onKind={setKind} custom={custom} onCustom={setCustom} minDay={historyStart} maxDay={today} />
          <button onClick={() => load(true)} disabled={loading}
            className="flex items-center justify-center gap-2 px-3 py-1.5 text-xs rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar{updatedAt ? ` · ${updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}

      {!summary && loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : summary && (
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <KpiCards summary={summary} compare={compare} />
          <SalesChart data={series} bucket={period.bucket} />
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
            <TopProducts rows={products} order={productOrder} onOrder={setProductOrder} />
            <TopCoupons rows={coupons} revenue={summary.current.revenue} withCouponRevenue={summary.current.with_coupon_revenue} />
            <CustomersBlock summary={summary} historyLabel={historyLabel} />
            <OrderStatusBlock summary={summary} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Ecommerce;
