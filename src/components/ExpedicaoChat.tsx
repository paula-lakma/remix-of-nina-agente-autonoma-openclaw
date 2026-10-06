import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageSquare, RefreshCw, CheckCircle2, Send, Bot, User, Headset, ChevronDown, ChevronRight, Info, FileText, Paperclip, X, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSignedMedia } from '@/hooks/useSignedMediaUrls';
import { MediaUnavailable } from './MediaUnavailable';
import { formatBubbleTime, formatDayLabel, daySeparatorIndexes } from '@/lib/chatTime';
import { useMinuteTick } from '@/hooks/useMinuteTick';
import { resolveComposerWindow, isWindowClosedError, WINDOW_CLOSED_TITLE, WINDOW_CLOSED_BODY, type ServerRefusal } from '@/lib/whatsappWindow';
import { WindowClosedNotice, WindowOpenHint } from './WindowClosedNotice';
import { PriorityBadge } from './PriorityBadge';
import { sortByPriority, type PriorityInfo } from '@/lib/priorityDisplay';
import { RESUME_TEMPLATE_NAME, resumeErrorText } from '../../supabase/functions/_shared/resumeTemplate';


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
  priority?: PriorityInfo | null;
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
  status?: string | null;
  template_name?: string | null;
  template_source?: string | null;
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
  /** Liga o botão "Enviar modelo de retomada" (somente Expedição). */
  resumeTemplate?: boolean;
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
    return <MediaUnavailable kind={kind} className="max-w-[260px]" />;
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
  if (error) {
    // Respostas 4xx: lê o corpo para preservar o código do erro (ex.: whatsapp_window_closed).
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const b = await ctx.clone().json();
        if (b?.error) throw new Error(String(b.error));
      } catch (inner) {
        if (inner instanceof Error && inner.message && !(inner instanceof SyntaxError)) throw inner;
      }
    }
    throw error;
  }
  if (data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}

// Comparação por conteúdo real: evita substituir o estado (e remontar o DOM)
// quando a atualização silenciosa traz exatamente os mesmos dados.
const sameMessage = (a: ExpedicaoMessage, b: ExpedicaoMessage) =>
  a.id === b.id &&
  a.content === b.content &&
  a.from_type === b.from_type &&
  a.type === b.type &&
  a.media_url === b.media_url &&
  a.media_type === b.media_type &&
  a.sent_at === b.sent_at &&
  a.status === b.status &&
  a.template_name === b.template_name;

const sameMessageList = (a: ExpedicaoMessage[], b: ExpedicaoMessage[]) =>
  a.length === b.length && a.every((m, i) => sameMessage(m, b[i]));

const sameConversation = (a: ExpedicaoConversation, b: ExpedicaoConversation) =>
  a.conversation_id === b.conversation_id &&
  a.contact_name === b.contact_name &&
  a.contact_phone_masked === b.contact_phone_masked &&
  a.reason === b.reason &&
  a.granted_at === b.granted_at &&
  a.last_message_at === b.last_message_at &&
  a.human_status === b.human_status &&
  a.attendance_finished === b.attendance_finished &&
  a.handoff_at === b.handoff_at &&
  a.trigger_message_id === b.trigger_message_id &&
  a.trigger_snippet === b.trigger_snippet &&
  JSON.stringify(a.priority ?? null) === JSON.stringify(b.priority ?? null);

const sameConversationList = (a: ExpedicaoConversation[], b: ExpedicaoConversation[]) =>
  a.length === b.length && a.every((c, i) => sameConversation(c, b[i]));

// Erros que significam perda real de acesso (única situação em que a seleção
// pode ser descartada automaticamente).
const isAccessLoss = (e: unknown) => {
  const msg = String((e as { message?: string })?.message ?? e ?? '').toLowerCase();
  return ['forbidden', 'not_found', 'no_access', 'unauthorized', 'denied', 'permission'].some((k) =>
    msg.includes(k),
  );
};

export const RestrictedHandoffChat: React.FC<{ config: RestrictedChatConfig }> = ({ config }) => {
  const nowTick = useMinuteTick();
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
  const [hasNewBelow, setHasNewBelow] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  const didInitialScrollRef = useRef(false);
  const lastMessageIdRef = useRef<string | null>(null);

  const loadList = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setLoadingList(true);
    try {
      const res = await callBackend<{ conversations: ExpedicaoConversation[] }>({ action: 'list' });
      const list = res.conversations ?? [];
      setConversations((prev) => (sameConversationList(prev, list) ? prev : list));
      // A seleção só é descartada em atualização explícita; nunca no polling.
      if (!silent) {
        setSelectedId((prev) => (prev && list.some((c) => c.conversation_id === prev) ? prev : null));
      }
    } catch (e) {
      if (!silent) {
        setConversations([]);
        toast.error('Não foi possível carregar seus atendimentos');
      }
    } finally {
      if (!silent) setLoadingList(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string, opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setLoadingMessages(true);
    try {
      const res = await callBackend<{ messages: ExpedicaoMessage[] }>({
        action: 'messages',
        conversation_id: conversationId,
      });
      const next = res.messages ?? [];
      setMessages((prev) => (sameMessageList(prev, next) ? prev : next));
    } catch (e) {
      // No polling, um erro passageiro não pode limpar a tela nem a seleção.
      if (!silent || isAccessLoss(e)) {
        setMessages([]);
        toast.error('Conversa indisponível ou sem permissão');
        setSelectedId(null);
        loadList({ silent: true });
      }
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  }, [loadList]);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    setShowHistory(false);
    setHasNewBelow(false);
    didInitialScrollRef.current = false;
    lastMessageIdRef.current = null;
    nearBottomRef.current = true;
    if (!selectedId) { setMessages([]); return; }

    loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  // Atualização periódica silenciosa (sem realtime direto em tabelas)
  useEffect(() => {
    const t = setInterval(() => {
      loadList({ silent: true });
      if (selectedId) loadMessages(selectedId, { silent: true });
    }, 20000);
    return () => clearInterval(t);
  }, [loadList, loadMessages, selectedId]);

  const scrollToBottom = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    nearBottomRef.current = true;
    setHasNewBelow(false);
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    nearBottomRef.current = near;
    if (near) setHasNewBelow(false);
  }, []);

  // Rolagem: fim uma única vez ao abrir; depois só acompanha se já estiver no fim.
  useEffect(() => {
    if (!messages.length) return;
    const el = messagesContainerRef.current;
    if (!el) return;
    const lastId = messages[messages.length - 1].id;

    if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
      lastMessageIdRef.current = lastId;
      el.scrollTop = el.scrollHeight;
      return;
    }

    if (lastId === lastMessageIdRef.current) return;
    lastMessageIdRef.current = lastId;

    if (nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    } else {
      setHasNewBelow(true);
    }
  }, [messages]);

  const [refusal, setRefusal] = useState<ServerRefusal | null>(null);
  const composer = resolveComposerWindow(selectedId, messages, nowTick, refusal);

  // Modelo de retomada (só Expedição): disponibilidade sempre confirmada pelo servidor.
  const [resumeStatus, setResumeStatus] = useState<{ available: boolean; reason: string | null } | null>(null);
  const [resumeSending, setResumeSending] = useState(false);
  const lastMsgId = messages.length ? messages[messages.length - 1].id : null;
  const refreshResume = useCallback(async (conversationId: string) => {
    try {
      const r = await callBackend<{ available: boolean; reason: string | null }>({ action: 'resume_status', conversation_id: conversationId });
      setResumeStatus({ available: !!r.available, reason: r.reason ?? null });
    } catch { setResumeStatus(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.edgeFunction]);
  useEffect(() => {
    if (!config.resumeTemplate || !selectedId || composer.canSendFreeform) { setResumeStatus(null); return; }
    refreshResume(selectedId);
  }, [config.resumeTemplate, selectedId, composer.canSendFreeform, lastMsgId, refreshResume]);

  const handleResume = async () => {
    if (!selectedId || resumeSending || !resumeStatus?.available) return;
    setResumeSending(true);
    try {
      await callBackend({ action: 'resume_template', conversation_id: selectedId });
      toast.success('Modelo de retomada enviado');
      await loadMessages(selectedId);
    } catch (e) {
      toast.error(resumeErrorText(e instanceof Error ? e.message : null));
    } finally {
      setResumeSending(false);
      refreshResume(selectedId);
    }
  };

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || !selectedId || sending || !composer.canSendFreeform) return;
    setSending(true);
    try {
      await callBackend({ action: 'reply', conversation_id: selectedId, content });
      setDraft('');
      await loadMessages(selectedId);
    } catch (e) {
      if (isWindowClosedError(e)) {
        setRefusal({ conversationId: selectedId, lastCustomerAt: composer.last_customer_message_at });
        toast.error(WINDOW_CLOSED_TITLE, { description: WINDOW_CLOSED_BODY });
      } else {
        toast.error('Não foi possível enviar a mensagem');
      }
    } finally {
      setSending(false);
    }
  };

  const handleFinish = async () => {
    if (!selectedId) return;
    try {
      await callBackend({ action: 'finish', conversation_id: selectedId });
      toast.success('Atendimento finalizado');
      setSelectedId(null);
      await loadList();
    } catch (e) {
      toast.error('Não foi possível finalizar o atendimento');
    }
  };

  const selected = conversations.find((c) => c.conversation_id === selectedId) || null;
  // Só ordenação visual do que o servidor devolveu; sem prioridade, a ordem fica igual.
  const sortedConversations = useMemo(() => sortByPriority(conversations), [conversations]);
  const priorityCounts = useMemo(
    () => ({
      critical: conversations.filter((c) => c.priority?.priority_level === 'CRITICAL').length,
      high: conversations.filter((c) => c.priority?.priority_level === 'HIGH').length,
    }),
    [conversations],
  );

  const { urls: signedMedia } = useSignedMedia(
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

  // Mensagens em ordem com separador de dia (São Paulo) onde a data muda.
  const renderWithDays = (list: ExpedicaoMessage[]) => {
    const seps = daySeparatorIndexes(list.map((m) => m.sent_at));
    return list.map((m, i) => (
      <React.Fragment key={m.id}>
        {seps.has(i) && (
          <div className="flex justify-center my-3" role="separator" aria-label={formatDayLabel(m.sent_at, nowTick)}>
            <span className="px-3 py-1 rounded-full border border-border/50 bg-secondary/40 text-[11px] text-muted-foreground">
              {formatDayLabel(m.sent_at, nowTick)}
            </span>
          </div>
        )}
        {renderMessage(m)}
      </React.Fragment>
    ));
  };

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
        {m.template_name === RESUME_TEMPLATE_NAME && (
          <p className="text-[11px] font-medium text-muted-foreground text-right mb-1">
            Modelo de retomada enviado pela equipe{m.status === 'failed' ? ' — falhou' : ''}
          </p>
        )}
        <div className={`rounded-2xl px-4 py-2 text-sm ${meta.bubble} space-y-2`}>
          {isMediaMessage(m) && (
            <MediaBlock message={m} url={mediaSrc(m)} onOpenImage={setLightboxUrl} />
          )}
          {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
          <span className="block mt-1 text-[10px] text-muted-foreground">
            {formatBubbleTime(m.sent_at, nowTick)}
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
            {(priorityCounts.critical > 0 || priorityCounts.high > 0) && (
              <p className="text-[11px] mt-1 font-medium">
                {priorityCounts.critical > 0 && <span className="text-destructive-foreground">Críticos: {priorityCounts.critical}</span>}
                {priorityCounts.critical > 0 && priorityCounts.high > 0 && <span className="text-muted-foreground"> · </span>}
                {priorityCounts.high > 0 && <span className="text-warning">Altos: {priorityCounts.high}</span>}
              </p>
            )}
          </div>
          <button
            onClick={() => loadList()}
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
            sortedConversations.map((c) => (
              <button
                key={c.conversation_id}
                onClick={() => setSelectedId(c.conversation_id)}
                className={`w-full text-left px-4 py-3 border-b border-border/30 border-l-4 transition-colors ${
                  c.priority?.priority_level === 'CRITICAL'
                    ? 'border-l-destructive bg-destructive/15'
                    : c.priority?.priority_level === 'HIGH'
                      ? 'border-l-warning bg-warning/5'
                      : 'border-l-transparent'
                } ${selectedId === c.conversation_id ? 'bg-secondary/60' : 'hover:bg-secondary/30'}`}
              >
                <p className="text-sm font-medium text-foreground truncate">{c.contact_name || 'Cliente'}</p>
                <p className="text-xs text-muted-foreground truncate">{c.contact_phone_masked || '—'}</p>
                <span className="inline-block mt-1 text-[10px] uppercase tracking-wide text-primary">{reasonLabel(c.reason)}</span>
                <PriorityBadge priority={c.priority} now={nowTick.getTime()} />
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
                <PriorityBadge priority={selected.priority} now={nowTick.getTime()} />
              </div>
              <button
                onClick={handleFinish}
                className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-secondary/60 hover:bg-secondary transition-colors text-foreground"
              >
                <CheckCircle2 className="w-4 h-4" /> Finalizar atendimento
              </button>
            </header>

            <div className="flex-1 relative min-h-0">
            <div
              ref={messagesContainerRef}
              onScroll={handleMessagesScroll}
              className="absolute inset-0 overflow-y-auto p-4 space-y-3"
            >
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
                          {renderWithDays(history)}
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

                  {renderWithDays(current)}
                </>
              )}
            </div>

            {hasNewBelow && (
              <button
                onClick={scrollToBottom}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-primary text-primary-foreground shadow-lg"
              >
                <ArrowDown className="w-3.5 h-3.5" /> Novas mensagens
              </button>
            )}
            </div>

            <footer className="p-4 border-t border-border/50 space-y-2">
              {composer.canSendFreeform
                ? <WindowOpenHint until={composer.freeform_safe_until} now={nowTick} />
                : <WindowClosedNotice>
                    {config.resumeTemplate && resumeStatus && resumeStatus.reason !== 'resume_window_open' && (
                      <div className="mt-2 space-y-1">
                        <button
                          type="button"
                          onClick={handleResume}
                          disabled={!resumeStatus.available || resumeSending}
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {resumeSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          Enviar modelo de retomada
                        </button>
                        {!resumeStatus.available && resumeStatus.reason && (
                          <p className="text-[11px] text-muted-foreground">{resumeErrorText(resumeStatus.reason)}</p>
                        )}
                      </div>
                    )}
                  </WindowClosedNotice>}
              <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                disabled={!composer.canSendFreeform}
                aria-disabled={!composer.canSendFreeform}
                placeholder={composer.canSendFreeform ? 'Escreva sua resposta...' : 'Texto livre indisponível: janela encerrada'}
                className="flex-1 bg-secondary/40 border border-border/50 rounded-xl px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <button
                onClick={handleSend}
                disabled={!draft.trim() || sending || !composer.canSendFreeform}
                className="p-2.5 rounded-xl bg-primary/80 hover:bg-primary disabled:opacity-40 transition-colors"
                title="Enviar"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
              </div>
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

const ExpedicaoChat: React.FC = () => (
  <RestrictedHandoffChat config={{ edgeFunction: 'expedicao-chat', reasonLabels: EXPEDICAO_REASON_LABELS, fallbackReasonLabel: 'Atendimento financeiro / expedição', resumeTemplate: true }} />
);

export default ExpedicaoChat;
