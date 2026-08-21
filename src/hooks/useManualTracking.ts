import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type Carrier = 'correios' | 'jadlog';

export const CARRIERS: Record<Carrier, { label: string; template: string; link: string }> = {
  correios: {
    label: 'Correios',
    template: 'pedido_enviado_correios',
    link: 'https://rastreamento.correios.com.br/',
  },
  jadlog: {
    label: 'Jadlog',
    template: 'pedido_enviado_jadlog',
    link: 'https://www.jadlog.com.br/jadlog/rastreie',
  },
};

export type CarrierSelection = Carrier | '';

export interface ManualTrackingInput {
  customer_name: string;
  phone_number: string;
  order_number: string;
  tracking_number: string;
  carrier: Carrier;
}

/** Estado do formulário: a transportadora começa vazia (escolha consciente). */
export interface ManualTrackingForm extends Omit<ManualTrackingInput, 'carrier'> {
  carrier: CarrierSelection;
}

export interface ManualTrackingLog {
  id: string;
  tracking_number: string;
  carrier: string;
  order_number: string;
  phone_number: string;
  customer_name: string;
  status: string;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
}

/** Retorna null enquanto o formulário estiver incompleto. */
export function buildTemplatePreview(input: ManualTrackingForm): string | null {
  const name = input.customer_name.trim();
  const order = input.order_number.trim().replace(/^#/, '');
  const code = input.tracking_number.trim().toUpperCase();
  if (!name || !order || !code || !input.carrier || !CARRIERS[input.carrier]) return null;
  const first = name.split(/\s+/)[0];
  const c = CARRIERS[input.carrier];
  const via = input.carrier === 'correios' ? 'pelos Correios' : 'pela Jadlog';
  return `Boa notícia, ${first}! Seu pedido #${order} foi enviado ${via}.\n\nCódigo de rastreio: ${code}\n\nAcompanhe sua entrega em:\n${c.link}`;
}


export function useManualTracking() {
  const [logs, setLogs] = useState<ManualTrackingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendingEnabled, setSendingEnabled] = useState<boolean | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('manual_tracking_logs')
      .select('id, tracking_number, carrier, order_number, phone_number, customer_name, status, error_message, created_at, sent_at')
      .order('created_at', { ascending: false })
      .limit(50);
    setLogs((data as ManualTrackingLog[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Sonda de estado do interruptor (sem efeitos colaterais no backend)
  useEffect(() => {
    let alive = true;
    supabase.functions
      .invoke('send-manual-tracking', { body: { probe: true } })
      .then(({ data }) => {
        if (alive) setSendingEnabled(!!(data as { sending_enabled?: boolean })?.sending_enabled);
      })
      .catch(() => alive && setSendingEnabled(false));
    return () => { alive = false; };
  }, []);

  // Atualização assíncrona do histórico (status muda depois do envio real)
  useEffect(() => {
    const channel = supabase
      .channel('manual-tracking-logs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'manual_tracking_logs' },
        () => { fetchLogs(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchLogs]);

  const send = useCallback(async (input: ManualTrackingInput) => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-manual-tracking', {
        body: input,
      });
      if (error) throw error;
      await fetchLogs();
      return data as {
        ok?: boolean;
        disabled?: boolean;
        code?: string;
        message?: string;
        error?: string;
        fields?: Record<string, string>;
        existing_status?: string | null;
        log_id?: string | null;
      };
    } finally {
      setSending(false);
    }
  }, [fetchLogs]);

  return { logs, loading, sending, sendingEnabled, send, refetch: fetchLogs };
}
