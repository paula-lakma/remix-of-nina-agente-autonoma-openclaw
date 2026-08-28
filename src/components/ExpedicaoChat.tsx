import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, MessageSquare, RefreshCw, CheckCircle2, Send, Bot, User, Headset, ChevronDown, ChevronRight, Info, FileText, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSignedMediaUrls } from '@/hooks/useSignedMediaUrls';

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
  type: string | null;
  media_url: string | null;
  media_type: string | null;
  sent_at: string;
}

// Motivos amigáveis (leitura apenas — não altera classificação nem allowlist)
const EXPEDICAO_REASON_LABELS: Record<string, string> = {
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

export const DERMO_REASON_LABELS: Record<string, string> = {
  technical_question: 'Dúvida técnica',
  sensitive_case: 'Caso sensível',
  contraindication: 'Contraindicação',
  reaction: 'Reação ao produto',
  allergy: 'Alergia',
  pregnancy_breastfeeding: 'Gestante / lactante',
  sensitized_or_injured_skin: 'Pele sensibilizada ou lesionada',
  medication_or_dermatological_treatment: 'Medicamento / tratamento dermatológico',
  recent_procedure: 'Procedimento recente',
  protocol_adaptation: 'Adaptação de protocolo',
  protocol_product_substitution: 'Substituição de produto do protocolo',
  missing_technical_information: 'Informação técnica ausente',
  product_link_not_found_after_search: 'Link de produto não localizado',
};

export interface RestrictedChatConfig {
  /** Nome da edge function de backend (expedicao-chat | dermo-chat) */
  edgeFunction: string;
  reasonLabels: Record<string, string>;
  fallbackReasonLabel: string;
}

type Author = 'client' | 'nina' | 'human';

const authorOf = (fromType: string): Author => {
  if (fromType === 'nina') return 'nina';
  if (fromType === 'human') return 'human';
  return 'client';
};


const isMediaMessage = (m: ExpedicaoMessage) =>
  !!m.type && m.type !== 'text';

const HANDOFF_WINDOW_MS = 5 * 60 * 1000;
const HANDOFF_AFTER_MS = 2 * 60 * 1000;

const isWithinHandoffWindow = (handoffAt: number, sentAt: number) =>
  sentAt >= handoffAt - HANDOFF_WINDOW_MS && sentAt <= handoffAt + HANDOFF_AFTER_MS;

// Renderiza a mídia real da mensagem (bucket privado, URL assinada sob demanda)
const MediaBlock: React.FC<{
  message: ExpedicaoMessage;
  url: string | null;
  onOpenImage: (url: string) => void;
}> = ({ message, url, onOpenImage }) => {
  const kind = message.type;
  if (!kind || kind === 'text') return null;

  if (!url) {
    return <p className="text-xs text-muted-foreground italic">Mídia indisponível</p>;
  }

  if (kind === 'image') {
    return (
      <button type="button" onClick={() => onOpenImage(url)} className="block w-full text-left">
        <img
          src={url}
          alt="Anexo do cliente"
          loading="lazy"
          className="rounded-lg max-w-full h-auto max-h-64 object-contain border border-border/50 cursor-zoom-in"
        />
      </button>
    );
  }

  if (kind === 'audio') {
    return <audio src={url} controls preload="metadata" className="w-full max-w-[260px]" />;
  }

  if (kind === 'video') {
    return <video src={url} controls preload="metadata" className="rounded-lg max-w-full max-h-64" />;
  }

  const name = url.split('/').pop()?.split('?')[0] || 'documento';
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 text-xs underline text-primary break-all"
    >
      <FileText className="w-4 h-4 shrink-0" /> {name}
    </a>
  );
};

async function callRestrictedChat<T>(edgeFunction: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(edgeFunction, { body });
  if (error) throw error;
  if (data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}

export const RestrictedHandoffChat: React.FC<{ config: RestrictedChatConfig }> = ({ config }) => {
  const reasonLabel = (reason: string) =>
    config.reasonLabels[(reason || '').toLowerCase()] || config.fallbackReasonLabel;
  const callBackend = <T,>(body: Record<string, unknown>) => callRestrictedChat<T>(config.edgeFunction, body);
  const [conversations, setConversations] = useState<ExpedicaoConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ExpedicaoMessage[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);


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
    setShowHistory(false);
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

  const signedMedia = useSignedMediaUrls(
    messages.map((m) => ({
      id: m.id,
      conversationId: m.conversation_id,
      hasMedia: isMediaMessage(m),
    })),
  );
  const mediaSrc = (m: ExpedicaoMessage) => signedMedia[m.id] || m.media_url || null;

  const handoffAt = selected?.handoff_at ? new Date(selected.handoff_at).getTime() : null;

  // Mensagem que originou o handoff: id explícito > última fala do cliente antes
  // do encaminhamento > trecho registrado na concessão.
  const triggerMessage = useMemo(() => {
    if (!selected) return null;
    if (selected.trigger_message_id) {
      const m = messages.find((x) => x.id === selected.trigger_message_id);
      if (m) return m;
    }
    if (handoffAt) {
      const last = [...messages]
        .filter((m) => m.from_type === 'user' && new Date(m.sent_at).getTime() <= handoffAt)
        .pop();
      if (last) return last;
    }
    return null;
  }, [selected, messages, handoffAt]);

  const triggerText = triggerMessage?.content || selected?.trigger_snippet || null;

  // Âncora do corte: a fala real do cliente que originou o caso (importante nos
  // backfills, onde a concessão foi criada muito depois da conversa).
  const anchorAt = triggerMessage ? new Date(triggerMessage.sent_at).getTime() : handoffAt;

  // Contexto mínimo: só quando o gatilho é curto/ambíguo, até 3 falas do cliente
  // imediatamente anteriores.
  const AMBIGUOUS = /^(sim|não|nao|ok|isso|dificuldade|não chegou|nao chegou|ainda não|ainda nao|e aí|oi|olá|ola)[.!?]*$/i;
  const contextIds = useMemo(() => {
    const ids = new Set<string>();
    if (!triggerMessage || !anchorAt) return ids;
    const text = (triggerMessage.content || '').trim();
    const needsContext = isMediaMessage(triggerMessage) || text.length < 25 || AMBIGUOUS.test(text);
    if (!needsContext) return ids;
    const before = messages
      .filter((m) => m.from_type === 'user' && new Date(m.sent_at).getTime() < anchorAt)
      .slice(-3);
    before.forEach((m) => ids.add(m.id));
    return ids;
  }, [triggerMessage, messages, anchorAt]);

  const { history, current } = useMemo(() => {
    if (!anchorAt) return { history: [] as ExpedicaoMessage[], current: messages };
    const h: ExpedicaoMessage[] = [];
    const c: ExpedicaoMessage[] = [];
    for (const m of messages) {
      const t = new Date(m.sent_at).getTime();
      (t >= anchorAt || contextIds.has(m.id) ? c : h).push(m);
    }
    return { history: h, current: c };
  }, [messages, anchorAt, contextIds]);

  // Mídias do cliente próximas à âncora (até 5 min antes e 2 min depois)
  const clientMediaWindow = useMemo(() => {
    if (!anchorAt) return [];
    return messages.filter((m) => {
      if (m.from_type !== 'user' || !isMediaMessage(m)) return false;
      const t = new Date(m.sent_at).getTime();
      return isWithinHandoffWindow(anchorAt, t);
    });
  }, [messages, anchorAt]);

  // Mídia exibida dentro do bloco "Motivo do encaminhamento"
  const motivoMedia = useMemo(() => {
    if (triggerMessage && isMediaMessage(triggerMessage)) return triggerMessage;
    // Se o gatilho for texto, anexa a mídia do cliente mais próxima ao handoff
    return clientMediaWindow[0] ?? null;
  }, [triggerMessage, clientMediaWindow]);

  const motivoShownIds = useMemo(() => {
    const ids = new Set<string>();
    if (triggerMessage && isMediaMessage(triggerMessage)) ids.add(triggerMessage.id);
    if (motivoMedia && motivoMedia.id !== triggerMessage?.id) ids.add(motivoMedia.id);
    return ids;
  }, [triggerMessage, motivoMedia]);

  const recentAttachments = useMemo(() => {
    return clientMediaWindow.filter((m) => !motivoShownIds.has(m.id));
  }, [clientMediaWindow, motivoShownIds]);

  const historyMediaCount = useMemo(() => history.filter(isMediaMessage).length, [history]);

  const renderMessage = (m: ExpedicaoMessage) => {
    const author = authorOf(m.from_type);
    const meta = {
      client: {
        label: selected?.contact_name || 'Cliente',
        Icon: User,
        bubble: 'bg-secondary/70 border border-border/60 text-foreground',
        align: '',
      },
      nina: {
        label: 'NINA',
        Icon: Bot,
        bubble: 'bg-muted/40 border border-dashed border-border text-muted-foreground',
        align: 'ml-auto',
      },
      human: {
        label: 'Atendimento',
        Icon: Headset,
        bubble: 'bg-primary/20 border border-primary/40 text-foreground',
        align: 'ml-auto',
      },
    }[author];

    return (
      <div key={m.id} className={`max-w-[75%] ${meta.align}`}>
        <div className={`flex items-center gap-1.5 mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground ${author === 'client' ? '' : 'justify-end'}`}>
          <meta.Icon className="w-3 h-3" />
          <span>{meta.label}</span>
        </div>
        <div className={`rounded-2xl px-4 py-2 text-sm ${meta.bubble} space-y-2`}>
          {isMediaMessage(m) && (
            <MediaBlock message={m} url={mediaSrc(m)} onOpenImage={setLightboxUrl} />
          )}
          {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
          <span className="block mt-1 text-[10px] text-muted-foreground">
            {new Date(m.sent_at).toLocaleString('pt-BR')}
          </span>
        </div>
      </div>
    );
  };


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
                <span className="inline-block mt-1 text-[10px] uppercase tracking-wide text-primary">{reasonLabel(c.reason)}</span>
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
                <>
                  {/* Motivo do encaminhamento */}
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Info className="w-4 h-4 text-primary" />
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                        Motivo do encaminhamento
                      </p>
                    </div>
                    <p className="text-sm font-medium text-foreground">{reasonLabel(selected.reason)}</p>
                    {(triggerText || motivoMedia) && (
                      <div className="mt-3 rounded-lg bg-background/60 border border-border/50 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                          Mensagem do cliente
                        </p>
                        {motivoMedia && (
                          <div className="mb-2">
                            <MediaBlock
                              message={motivoMedia}
                              url={mediaSrc(motivoMedia)}
                              onOpenImage={setLightboxUrl}
                            />
                          </div>
                        )}
                        {triggerText && (
                          <p className="text-sm text-foreground whitespace-pre-wrap break-words">{triggerText}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Histórico anterior com a NINA */}
                  {history.length > 0 && (
                    <div className="rounded-xl border border-border/50 bg-card/40">
                      <button
                        onClick={() => setShowHistory((v) => !v)}
                        className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showHistory ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <span className="flex-1">
                          Ver conversa anterior com a NINA ({history.length})
                          {historyMediaCount > 0 && (
                            <span className="ml-2 text-[10px] text-primary">
                              • {historyMediaCount} anexo{historyMediaCount > 1 ? 's' : ''}
                            </span>
                          )}
                        </span>
                      </button>
                      {showHistory && (
                        <div className="px-4 pb-4 space-y-3">
                          {history.map(renderMessage)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Faixa de anexos recentes do cliente (sem duplicar o motivo) */}
                  {recentAttachments.length > 0 && (
                    <div className="rounded-xl border border-border/50 bg-card/40 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Paperclip className="w-3 h-3" /> Anexos do cliente ({recentAttachments.length})
                      </p>
                      <div className="flex flex-wrap gap-3">
                        {recentAttachments.map((m) => (
                          <div key={m.id} className="max-w-[200px]">
                            <MediaBlock message={m} url={mediaSrc(m)} onOpenImage={setLightboxUrl} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {current.map(renderMessage)}
                </>
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

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-lg bg-black/50 text-white"
            onClick={() => setLightboxUrl(null)}
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
          <img src={lightboxUrl} alt="Anexo ampliado" className="max-h-full max-w-full object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
};

export default ExpedicaoChat;
