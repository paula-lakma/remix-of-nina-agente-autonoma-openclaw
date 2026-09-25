import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { listReturns, userNames, type CrmFollowup } from '@/services/crm';
import { followupBucket, FOLLOWUP_BUCKET_LABEL, type FollowupBucket } from '@/lib/crm';

const ORDER: FollowupBucket[] = ['overdue', 'today', 'week', 'done'];

const CrmReturns: React.FC<{ onOpenContact: (id: string) => void }> = ({ onOpenContact }) => {
  const [items, setItems] = useState<(CrmFollowup & { contactName: string })[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await listReturns();
        setItems(r);
        setNames(await userNames(r.map((f) => f.assigned_user_id)));
      } catch (e) {
        console.error('[CRM] returns', e);
        setError('Não foi possível carregar os retornos.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-cyan-500" /></div>;
  if (error) return <div className="text-red-400 text-sm py-10 text-center">{error}</div>;

  const grouped: Record<FollowupBucket, typeof items> = { overdue: [], today: [], week: [], later: [], done: [], canceled: [] };
  for (const f of items) grouped[followupBucket(f)].push(f);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {ORDER.map((b) => (
        <section key={b} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <h3 className={`font-semibold mb-3 ${b === 'overdue' ? 'text-red-400' : b === 'today' ? 'text-amber-400' : 'text-slate-200'}`}>
            {FOLLOWUP_BUCKET_LABEL[b]} <span className="text-slate-500 font-normal">({grouped[b].length})</span>
          </h3>
          {grouped[b].length === 0 ? (
            <p className="text-sm text-slate-500">Nada por aqui.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 uppercase"><tr><th className="text-left py-1">Cliente</th><th className="text-left">Responsável</th><th className="text-left">Motivo</th><th className="text-left">Prazo</th></tr></thead>
              <tbody className="divide-y divide-slate-800/50">
                {grouped[b].map((f) => (
                  <tr key={f.id} className="hover:bg-slate-800/40 cursor-pointer" onClick={() => onOpenContact(f.contact_id)}>
                    <td className="py-2 text-slate-200">{f.contactName}</td>
                    <td className="text-slate-400">{names[f.assigned_user_id] ?? '—'}</td>
                    <td className="text-slate-400 truncate max-w-[180px]">{f.reason}</td>
                    <td className="text-slate-400 whitespace-nowrap">
                      {new Date(b === 'done' && f.completed_at ? f.completed_at : f.due_at).toLocaleDateString('pt-BR')}
                      {f.has_time && b !== 'done' ? ` ${new Date(f.due_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </div>
  );
};

export default CrmReturns;
