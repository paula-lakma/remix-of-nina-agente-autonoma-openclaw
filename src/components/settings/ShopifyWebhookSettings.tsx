import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, RefreshCw, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';

interface ShopifyEvent {
  id: string;
  topic: string;
  order_number: string | null;
  phone_number: string | null;
  send_status: string;
  error_message: string | null;
  created_at: string;
  raw_payload: unknown;
  normalized: unknown;
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  queued: { label: 'Enviado à fila', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  pending: { label: 'Processando', className: 'bg-sky-500/10 text-sky-400 border-sky-500/30' },
  awaiting_template: { label: 'Aguardando template', className: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  no_phone: { label: 'Sem telefone', className: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  no_template: { label: 'Sem template', className: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  ignored: { label: 'Ignorado', className: 'bg-muted text-muted-foreground border-border' },
  error: { label: 'Erro', className: 'bg-destructive/10 text-destructive border-destructive/30' },
};

const ShopifyWebhookSettings: React.FC = () => {
  const [events, setEvents] = useState<ShopifyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const webhookUrl = `https://${projectId}.supabase.co/functions/v1/shopify-webhook`;

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('shopify_events')
      .select('id, topic, order_number, phone_number, send_status, error_message, created_at, raw_payload, normalized')
      .order('created_at', { ascending: false })
      .limit(50);
    setEvents((data as ShopifyEvent[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const copyUrl = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold text-foreground">Webhook da Shopify</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Cadastre esta URL na Shopify (Configurações → Notificações → Webhooks) para os eventos
          <span className="text-foreground"> orders/create</span>,
          <span className="text-foreground"> orders/paid</span>,
          <span className="text-foreground"> fulfillments/create</span> e
          <span className="text-foreground"> fulfillments/update</span>. A assinatura HMAC da Shopify é validada em todas as requisições.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <code className="flex-1 truncate rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
            {webhookUrl}
          </code>
          <button
            onClick={copyUrl}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Últimos eventos recebidos</h3>
            <p className="text-sm text-muted-foreground">Use o JSON bruto para ajustar o mapeamento dos campos.</p>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : events.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Nenhum evento recebido ainda.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {events.map((ev) => {
              const status = STATUS_LABEL[ev.send_status] || {
                label: ev.send_status,
                className: 'bg-muted text-muted-foreground border-border',
              };
              const isOpen = expanded === ev.id;
              return (
                <li key={ev.id} className="px-6 py-4">
                  <button
                    onClick={() => setExpanded(isOpen ? null : ev.id)}
                    className="flex w-full items-center gap-3 text-left"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="w-40 shrink-0 text-xs text-muted-foreground">
                      {new Date(ev.created_at).toLocaleString('pt-BR')}
                    </span>
                    <span className="w-44 shrink-0 truncate text-sm text-foreground">{ev.topic}</span>
                    <span className="w-28 shrink-0 truncate text-sm text-muted-foreground">
                      {ev.order_number ? `#${ev.order_number}` : '—'}
                    </span>
                    <span className="flex-1 truncate text-sm text-muted-foreground">
                      {ev.phone_number || '—'}
                    </span>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${status.className}`}>
                      {status.label}
                    </span>
                  </button>

                  {ev.error_message && (
                    <p className="mt-2 pl-7 text-xs text-destructive">{ev.error_message}</p>
                  )}

                  {isOpen && (
                    <pre className="mt-3 max-h-80 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
{JSON.stringify({ normalized: ev.normalized, raw_payload: ev.raw_payload }, null, 2)}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ShopifyWebhookSettings;
