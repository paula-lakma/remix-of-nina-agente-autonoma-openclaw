import React from 'react';
import { Clock } from 'lucide-react';
import { WINDOW_CLOSED_BODY, WINDOW_CLOSED_TITLE } from '@/lib/whatsappWindow';
import { formatBubbleTime } from '@/lib/chatTime';

export const WindowClosedNotice: React.FC = () => (
  <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
    <Clock className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" aria-hidden />
    <div>
      <p className="font-semibold text-foreground">{WINDOW_CLOSED_TITLE}</p>
      <p className="text-muted-foreground text-xs">{WINDOW_CLOSED_BODY}</p>
    </div>
  </div>
);

export const WindowOpenHint: React.FC<{ until: string | null; now: Date }> = ({ until, now }) =>
  until ? <p className="text-[11px] text-muted-foreground">Texto livre disponível até {formatBubbleTime(until, now)}</p> : null;
