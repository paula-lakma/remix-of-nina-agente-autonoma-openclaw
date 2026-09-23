import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { OnboardingBanner } from './OnboardingBanner';
import { SystemHealthCard } from './SystemHealthCard';
import { OverviewCards } from './dashboard/OverviewCards';
import { ResponsibleTable } from './dashboard/ResponsibleTable';
import { AttentionQueue } from './dashboard/AttentionQueue';
import { TrackingBlock } from './dashboard/TrackingBlock';
import {
  fetchAttentionQueue,
  fetchByResponsible,
  fetchMessageVolume,
  fetchOverviewMetrics,
  fetchTrackingMetrics,
  type OverviewMetrics,
  type QueueItem,
  type ResponsibleRow,
  type TrackingMetrics,
} from '@/services/dashboardMetrics';
import { useOutletContext } from 'react-router-dom';

interface OutletContext {
  showOnboarding: boolean;
  setShowOnboarding: (show: boolean) => void;
}

type PeriodFilter = 'today' | '7days' | '30days';

const periodLabels: Record<PeriodFilter, string> = {
  today: 'Hoje',
  '7days': '7 dias',
  '30days': '30 dias',
};

const periodDays: Record<PeriodFilter, number> = { today: 1, '7days': 7, '30days': 30 };

const Dashboard: React.FC = () => {
  const [period, setPeriod] = useState<PeriodFilter>('today');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewMetrics | null>(null);
  const [responsibles, setResponsibles] = useState<ResponsibleRow[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [tracking, setTracking] = useState<TrackingMetrics | null>(null);
  const [chartData, setChartData] = useState<{ name: string; chats: number }[]>([]);
  const { setShowOnboarding } = useOutletContext<OutletContext>();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const days = periodDays[period];
        const [o, r, q, t, c] = await Promise.all([
          fetchOverviewMetrics(days),
          fetchByResponsible(days),
          fetchAttentionQueue(),
          fetchTrackingMetrics(days),
          fetchMessageVolume(days),
        ]);
        if (cancelled) return;
        setOverview(o);
        setResponsibles(r);
        setQueue(q);
        setTracking(t);
        setChartData(c);
      } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [period]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-cyan-400" />
          <p className="text-sm text-slate-400 font-medium animate-pulse">Carregando indicadores...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 overflow-y-auto h-full bg-slate-950 text-slate-50 custom-scrollbar">
      <OnboardingBanner onOpenWizard={() => setShowOnboarding(true)} />
      <SystemHealthCard />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Dashboard</h2>
          <p className="text-slate-400 mt-1">
            Acompanhamento operacional {period === 'today' ? 'de hoje' : `dos últimos ${periodLabels[period]}`}.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-lg border border-slate-800">
          {(['today', '7days', '30days'] as PeriodFilter[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                period === p ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>

      {overview && <OverviewCards metrics={overview} periodLabel={periodLabels[period]} />}

      <AttentionQueue items={queue} />

      <ResponsibleTable rows={responsibles} periodLabel={periodLabels[period]} />

      {tracking && <TrackingBlock metrics={tracking} periodLabel={periodLabels[period]} />}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-lg">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white">Volume de mensagens</h3>
          <p className="text-sm text-slate-400">Mensagens trocadas por dia</p>
        </div>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorChats" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tickMargin={10} fontSize={12} stroke="#64748b" />
              <YAxis axisLine={false} tickLine={false} fontSize={12} stroke="#64748b" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderRadius: '12px',
                  border: '1px solid #1e293b',
                  color: '#f8fafc',
                }}
                itemStyle={{ color: '#06b6d4' }}
              />
              <Area
                type="monotone"
                dataKey="chats"
                stroke="#06b6d4"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorChats)"
                activeDot={{ r: 6, strokeWidth: 0, fill: '#fff' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
