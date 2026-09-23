import React from 'react';
import type { ResponsibleRow } from '@/services/dashboardMetrics';

interface Props {
  rows: ResponsibleRow[];
  periodLabel: string;
}

const cell = (n: number) => (n === 0 ? <span className="text-slate-600">—</span> : n);

export const ResponsibleTable: React.FC<Props> = ({ rows, periodLabel }) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-lg">
    <h3 className="text-lg font-semibold text-white mb-1">Atendimentos por responsável</h3>
    <p className="text-sm text-slate-400 mb-4">Período: {periodLabel}</p>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-400 border-b border-slate-800">
            <th className="py-2 pr-4 font-medium">Responsável</th>
            <th className="py-2 pr-4 font-medium text-right">Ativos agora</th>
            <th className="py-2 pr-4 font-medium text-right">Recebidos</th>
            <th className="py-2 font-medium text-right">Finalizados</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.teamMemberId} className="border-b border-slate-800/50 last:border-0">
              <td className="py-2 pr-4 text-slate-200">{r.name}</td>
              <td className="py-2 pr-4 text-right text-white font-medium">{cell(r.active)}</td>
              <td className="py-2 pr-4 text-right text-slate-300">{cell(r.received)}</td>
              <td className="py-2 text-right text-slate-300">{cell(r.finished)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-slate-500">
                Nenhum responsável ativo cadastrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);
