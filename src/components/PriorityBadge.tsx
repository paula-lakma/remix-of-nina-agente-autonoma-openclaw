import React from 'react';
import { AlertOctagon, AlertTriangle } from 'lucide-react';
import { LEVEL_LABEL, isHighlighted, reasonTexts, type PriorityInfo } from '@/lib/priorityDisplay';

export const PriorityBadge: React.FC<{ priority?: PriorityInfo | null; now: number; inline?: boolean }> = ({
  priority,
  now,
  inline,
}) => {
  if (!priority || !isHighlighted(priority)) return null;
  const critical = priority.priority_level === 'CRITICAL';
  const Icon = critical ? AlertOctagon : AlertTriangle;
  const reasons = reasonTexts(priority, now).join(' · ');
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${inline ? '' : 'mt-1.5'}`}>
      <span
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${
          critical ? 'bg-destructive text-destructive-foreground' : 'bg-warning text-warning-foreground'
        }`}
      >
        <Icon className="w-3 h-3" />
        {LEVEL_LABEL[priority.priority_level]}
      </span>
      {reasons && (
        <span className={`text-[11px] font-medium break-words ${critical ? 'text-destructive-foreground' : 'text-warning'}`}>
          {reasons}
        </span>
      )}
    </div>
  );
};
