import React from 'react';
import type { PeriodKind } from '@/lib/ecommercePeriod';

const LABELS: Record<PeriodKind, string> = { today: 'Hoje', '7days': '7 dias', '30days': '30 dias', '90days': '90 dias', custom: 'Personalizado' };

interface Props {
  kind: PeriodKind;
  onKind: (k: PeriodKind) => void;
  custom: { from: string; to: string };
  onCustom: (c: { from: string; to: string }) => void;
  minDay: string;
  maxDay: string;
}

export const PeriodFilter: React.FC<Props> = ({ kind, onKind, custom, onCustom, minDay, maxDay }) => (
  <div className="flex flex-col gap-2 items-stretch sm:items-end">
    <div className="flex flex-wrap items-center gap-1 bg-card p-1 rounded-lg border border-border">
      {(Object.keys(LABELS) as PeriodKind[]).map((k) => (
        <button key={k} onClick={() => onKind(k)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${kind === k ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          {LABELS[k]}
        </button>
      ))}
    </div>
    {kind === 'custom' && (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="date" aria-label="Data inicial" value={custom.from} min={minDay} max={maxDay}
          onChange={(e) => e.target.value && onCustom({ ...custom, from: e.target.value < minDay ? minDay : e.target.value })}
          className="bg-card border border-border rounded-md px-2 py-1 text-foreground" />
        até
        <input type="date" aria-label="Data final" value={custom.to} min={minDay} max={maxDay}
          onChange={(e) => e.target.value && onCustom({ ...custom, to: e.target.value < minDay ? minDay : e.target.value })}
          className="bg-card border border-border rounded-md px-2 py-1 text-foreground" />
      </div>
    )}
  </div>
);

export const periodLabel = (k: PeriodKind) => LABELS[k];
