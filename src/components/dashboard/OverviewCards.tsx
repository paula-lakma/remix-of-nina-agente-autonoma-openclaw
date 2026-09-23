import React from 'react';
import { Bot, CheckCircle2, MessageSquare, Share2, UserCheck, Users } from 'lucide-react';
import type { OverviewMetrics } from '@/services/dashboardMetrics';

interface Props {
  metrics: OverviewMetrics;
  periodLabel: string;
}

export const OverviewCards: React.FC<Props> = ({ metrics, periodLabel }) => {
  const cards = [
    { label: `Conversas recebidas (${periodLabel})`, value: metrics.received, icon: <MessageSquare className="h-5 w-5 text-cyan-400" />, tone: 'from-cyan-500/20 to-cyan-500/5 border-cyan-500/20' },
    { label: 'Conversas com a Nina agora', value: metrics.withNina, icon: <Bot className="h-5 w-5 text-violet-400" />, tone: 'from-violet-500/20 to-violet-500/5 border-violet-500/20' },
    { label: 'Atendimentos humanos ativos', value: metrics.humanActive, icon: <UserCheck className="h-5 w-5 text-amber-400" />, tone: 'from-amber-500/20 to-amber-500/5 border-amber-500/20' },
    { label: `Encaminhamentos (${periodLabel})`, value: metrics.handoffs, icon: <Share2 className="h-5 w-5 text-orange-400" />, tone: 'from-orange-500/20 to-orange-500/5 border-orange-500/20' },
    { label: `Atendimentos finalizados (${periodLabel})`, value: metrics.finished, icon: <CheckCircle2 className="h-5 w-5 text-emerald-400" />, tone: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/20' },
    { label: `Novos leads (${periodLabel})`, value: metrics.newLeads, icon: <Users className="h-5 w-5 text-sky-400" />, tone: 'from-sky-500/20 to-sky-500/5 border-sky-500/20' },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${c.tone} bg-slate-900/50 p-5 shadow-lg`}
        >
          <div className="flex items-center justify-between pb-3">
            <span className="text-sm font-medium text-slate-400">{c.label}</span>
            <div className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/50">{c.icon}</div>
          </div>
          <div className="text-3xl font-bold text-white tracking-tight">{c.value}</div>
        </div>
      ))}
    </div>
  );
};
