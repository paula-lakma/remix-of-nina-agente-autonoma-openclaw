import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatStaleTime, STALE_BUCKET_LABEL, type QueueItem, type StaleBucket } from '@/services/dashboardMetrics';

const bucketStyle: Record<StaleBucket, string> = {
  lt30m: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  lt1h: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  lt4h: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  lt24h: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  gt24h: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export const AttentionQueue: React.FC<{ items: QueueItem[] }> = ({ items }) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-lg">
    <div className="flex items-center gap-2 mb-4">
      <AlertTriangle className="w-5 h-5 text-amber-400" />
      <h3 className="text-lg font-semibold text-white">Atendimentos que precisam de atenção</h3>
    </div>
    {items.length === 0 ? (
      <p className="text-sm text-slate-500">Nenhum atendimento humano ativo no momento.</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-800">
              <th className="py-2 pr-4 font-medium">Cliente</th>
              <th className="py-2 pr-4 font-medium">Responsável</th>
              <th className="py-2 pr-4 font-medium">Motivo</th>
              <th className="py-2 pr-4 font-medium">Última atividade</th>
              <th className="py-2 pr-4 font-medium">Parado há</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.conversationId} className="border-b border-slate-800/50 last:border-0">
                <td className="py-2 pr-4 text-slate-200">{i.contactName}</td>
                <td className="py-2 pr-4 text-slate-300">{i.responsible}</td>
                <td className="py-2 pr-4 text-slate-400">{i.reason ?? '—'}</td>
                <td className="py-2 pr-4 text-slate-400">
                  {i.lastActivity ? new Date(i.lastActivity).toLocaleString('pt-BR') : '—'}
                </td>
                <td className="py-2 pr-4">
                  <span className={`px-2 py-1 rounded-full border text-xs font-medium ${bucketStyle[i.bucket]}`}>
                    {formatStaleTime(i.staleMinutes)} · {STALE_BUCKET_LABEL[i.bucket]}
                  </span>
                </td>
                <td className="py-2 text-slate-400">{i.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);
