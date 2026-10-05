/**
 * Passo B — lista de exceções "Prometido à Letícia sem atribuição".
 * Somente leitura/diagnóstico. Reaproveita EXATAMENTE `isLeticiaPromise`
 * do Passo A (sem segunda lista de frases).
 */
import { isLeticiaPromise, REASON_DESTINATIONS } from "../../supabase/functions/_shared/handoff";

export const LETICIA_EXCEPTION_GRACE_MS = 2 * 60 * 1000;

export interface ExcMessage { id: string; conversation_id: string; from_type: string; content: string | null; sent_at: string; }
export interface ExcGrant { conversation_id: string; team_member_id: string; is_active: boolean; created_at: string; revoked_at: string | null; }
export interface ExcHandoffEvent { conversation_id: string; handoff_reason: string | null; created_at: string; }
export interface ExcConversation { id: string; status: string | null; assigned_user_id: string | null; handoff_reason: string | null; contact_name: string | null; }

export interface LeticiaException {
  conversationId: string;
  contactName: string | null;
  promiseAt: string;
  snippet: string;
  assignedUserId: string | null;
  status: string | null;
  reason: string | null;
}

const OTHER_DESTINATIONS = new Set(["comercial", "parcerias", "dermoconsultant"]);
const isOtherDestinationReason = (r: string | null | undefined) =>
  !!r && OTHER_DESTINATIONS.has((REASON_DESTINATIONS as Record<string, string>)[r] ?? "");

export function computeLeticiaExceptions(input: {
  messages: ExcMessage[];
  grants: ExcGrant[];
  events: ExcHandoffEvent[];
  conversations: ExcConversation[];
  leticiaId: string;
  now: Date;
}): LeticiaException[] {
  const now = input.now.getTime();
  const convById = new Map(input.conversations.map((c) => [c.id, c]));
  const out = new Map<string, LeticiaException>();

  const promises = input.messages
    .filter((m) => m.from_type === "nina" && isLeticiaPromise(m.content))
    .sort((a, b) => a.sent_at.localeCompare(b.sent_at));

  for (const m of promises) {
    const t = new Date(m.sent_at).getTime();
    if (now < t + LETICIA_EXCEPTION_GRACE_MS) continue; // janela de 2 min

    // Letícia teve acesso em algum momento a partir da promessa (ativo agora,
    // ou concedido e depois encerrado normalmente) => não é falha.
    const leticiaGot = input.grants.some((g) =>
      g.conversation_id === m.conversation_id &&
      g.team_member_id === input.leticiaId &&
      (g.is_active || (g.revoked_at !== null && new Date(g.revoked_at).getTime() >= t)),
    );
    if (leticiaGot) continue;

    // Resolvida depois por handoff válido para outro destino de precedência.
    const otherHandoff = input.events.some((e) =>
      e.conversation_id === m.conversation_id &&
      new Date(e.created_at).getTime() >= t &&
      isOtherDestinationReason(e.handoff_reason),
    );
    const otherGrant = input.grants.some((g) =>
      g.conversation_id === m.conversation_id &&
      g.team_member_id !== input.leticiaId &&
      new Date(g.created_at).getTime() >= t,
    );
    const conv = convById.get(m.conversation_id);
    const assignedElsewhere = !!conv?.assigned_user_id && conv.assigned_user_id !== input.leticiaId;
    if (otherHandoff || otherGrant || assignedElsewhere) continue;

    const text = (m.content ?? "").replace(/\s+/g, " ").trim();
    out.set(m.conversation_id, {
      conversationId: m.conversation_id,
      contactName: conv?.contact_name ?? null,
      promiseAt: m.sent_at,
      snippet: text.length > 140 ? `${text.slice(0, 140)}…` : text,
      assignedUserId: conv?.assigned_user_id ?? null,
      status: conv?.status ?? null,
      reason: conv?.handoff_reason ?? null,
    });
  }
  return [...out.values()].sort((a, b) => b.promiseAt.localeCompare(a.promiseAt));
}
