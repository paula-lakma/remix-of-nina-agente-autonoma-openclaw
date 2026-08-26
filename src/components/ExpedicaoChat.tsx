import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, MessageSquare, RefreshCw, CheckCircle2, Send, Bot, User, Headset, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

// Chat ao Vivo restrito do papel `expedicao`.
// Todo acesso passa EXCLUSIVAMENTE pela edge function `expedicao-chat`
// (que revalida sessão, papel, atribuição e concessão ativa no servidor).
// Nenhuma consulta direta do navegador a tabelas operacionais.

interface ExpedicaoConversation {
  conversation_id: string;
  contact_name: string | null;
  contact_phone_masked: string | null;
  reason: string;
  granted_at: string;
  last_message_at: string | null;
  human_status: string | null;
  attendance_finished: boolean | null;
  handoff_at: string | null;
  trigger_message_id: string | null;
  trigger_snippet: string | null;
}

interface ExpedicaoMessage {
  id: string;
  conversation_id: string;
  content: string | null;
  from_type: string;
  media_url: string | null;
  media_type: string | null;
  sent_at: string;
}

// Motivos amigáveis (leitura apenas — não altera classificação nem allowlist)
const REASON_LABELS: Record<string, string> = {
  where_is_my_order: 'Onde está meu pedido',
  tracking_not_received: 'Pedido atrasado / rastreio',
  tracking_no_update: 'Pedido enviado sem atualização',
  tracking_code_invalid: 'Código de rastreio inválido',
  tracking_help: 'Ajuda com rastreio',
  tracking_link_issue: 'Problema no link de rastreio',
  carrier_question: 'Transportadora',
  shipped_no_info: 'Pedido enviado sem atualização',
  payment_unidentified: 'Pagamento não identificado',
  payment_pending: 'Pagamento pendente',
  payment_declined: 'Pagamento recusado',
  charge_issue: 'Problema na cobrança',
  duplicate_charge: 'Cobrança duplicada',
  boleto_issue: 'Problema com boleto',
  pix_issue: 'Problema com Pix',
  card_issue: 'Problema com cartão',
  payment_receipt: 'Comprovante de pagamento',
  invoice_request: 'Solicitação de nota fiscal',
  refund_request: 'Solicitação de reembolso',
  order_financial_question: 'Dúvida financeira do pedido',
};

const reasonLabel = (reason: string) =>
  REASON_LABELS[(reason || '').toLowerCase()] || 'Atendimento financeiro / expedição';

type Author = 'client' | 'nina' | 'human';

const authorOf = (fromType: string): Author => {
  if (fromType === 'nina') return 'nina';
  if (fromType === 'human') return 'human';
  return 'client';
};


async function callExpedicaoChat<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('expedicao-chat', { body });
  if (error) throw error;
  if (data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}

const ExpedicaoChat: React.FC = () => {
  const [conversations, setConversations] = useState<ExpedicaoConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ExpedicaoMessage[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await callExpedicaoChat<{ conversations: ExpedicaoConversation[] }>({ action: 'list' });
      const list = res.conversations ?? [];
      setConversations(list);
      setSelectedId((prev) => (prev && list.some((c) => c.conversation_id === prev) ? prev : null));
    } catch (e) {
      setConversations([]);
      toast.error('Não foi possível carregar seus atendimentos');
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    try {
      const res = await callExpedicaoChat<{ messages: ExpedicaoMessage[] }>({
        action: 'messages',
        conversation_id: conversationId,
      });
      setMessages(res.messages ?? []);
    } catch (e) {
      setMessages([]);
      toast.error('Conversa indisponível ou sem permissão');
      setSelectedId(null);
      loadList();
    } finally {
      setLoadingMessages(false);
    }
  }, [loadList]);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  // Atualização periódica leve (sem realtime direto em tabelas)
  useEffect(() => {
    const t = setInterval(() => {
      loadList();
      if (selectedId) loadMessages(selectedId);
    }, 20000);
    return () => clearInterval(t);
  }, [loadList, loadMessages, selectedId]);

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || !selectedId || sending) return;
    setSending(true);
    try {
      await callExpedicaoChat({ action: 'reply', conversation_id: selectedId, content });
      setDraft('');
      await loadMessages(selectedId);
    } catch (e) {
      toast.error('Não foi possível enviar a mensagem');
    } finally {
      setSending(false);
    }
  };

  const handleFinish = async () => {
    if (!selectedId) return;
    try {
      await callExpedicaoChat({ action: 'finish', conversation_id: selectedId });
      toast.success('Atendimento finalizado');
      setSelectedId(null);
      await loadList();
    } catch (e) {
      toast.error('Não foi possível finalizar o atendimento');
    }
  };

  const selected = conversations.find((c) => c.conversation_id === selectedId) || null;

  return (
    <div className="flex h-full w-full">
      {/* Lista */}
      <aside className="w-80 border-r border-border/50 flex flex-col bg-card/30">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-foreground">Chat ao Vivo</h1>
            <p className="text-xs text-muted-foreground">Atendimentos encaminhados para você</p>
          </div>
          <button
            onClick={loadList}
            className="p-2 rounded-lg hover:bg-secondary/60 transition-colors"
            title="Atualizar"
          >
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${loadingList ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingList && conversations.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 text-center p-8">
              <MessageSquare className="w-10 h-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhum atendimento encaminhado no momento.</p>
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.conversation_id}
                onClick={() => setSelectedId(c.conversation_id)}
                className={`w-full text-left px-4 py-3 border-b border-border/30 transition-colors ${
                  selectedId === c.conversation_id ? 'bg-secondary/60' : 'hover:bg-secondary/30'
                }`}
              >
                <p className="text-sm font-medium text-foreground truncate">{c.contact_name || 'Cliente'}</p>
                <p className="text-xs text-muted-foreground truncate">{c.contact_phone_masked || '—'}</p>
                <span className="inline-block mt-1 text-[10px] uppercase tracking-wide text-primary">{c.reason}</span>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Conversa */}
      <section className="flex-1 flex flex-col min-w-0">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-8">
            <MessageSquare className="w-12 h-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Selecione um atendimento para começar.</p>
          </div>
        ) : (
          <>
            <header className="p-4 border-b border-border/50 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{selected.contact_name || 'Cliente'}</p>
                <p className="text-xs text-muted-foreground truncate">{selected.contact_phone_masked || '—'}</p>
              </div>
              <button
                onClick={handleFinish}
                className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-secondary/60 hover:bg-secondary transition-colors text-foreground"
              >
                <CheckCircle2 className="w-4 h-4" /> Finalizar atendimento
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMessages ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">Sem mensagens.</p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${
                      m.from_type === 'contact'
                        ? 'bg-secondary/60 text-foreground'
                        : 'bg-primary/20 text-foreground ml-auto'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    <span className="block mt-1 text-[10px] text-muted-foreground">
                      {new Date(m.sent_at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                ))
              )}
            </div>

            <footer className="p-4 border-t border-border/50 flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Escreva sua resposta..."
                className="flex-1 bg-secondary/40 border border-border/50 rounded-xl px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                onClick={handleSend}
                disabled={!draft.trim() || sending}
                className="p-2.5 rounded-xl bg-primary/80 hover:bg-primary disabled:opacity-40 transition-colors"
                title="Enviar"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
};

export default ExpedicaoChat;
