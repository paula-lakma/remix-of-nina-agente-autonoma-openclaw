// Contexto de conversa enviado ao cérebro da Nina.
//
// Dois problemas distintos, resolvidos separadamente:
//  1. AUTOR da mensagem — rótulo neutro por from_type (Lead / Nina / Atendente humano).
//  2. ESTADO ATUAL do atendimento — bloco condicional, nunca embutido no rótulo.

export type ContextMessage = {
  from_type?: string | null;
  content?: string | null;
};

export type ConversationStateInput = {
  status?: string | null;
  assigned_user_id?: string | null;
  human_takeover_required?: boolean | null;
  handoff_type?: string | null;
};

/** Rótulo neutro do autor da mensagem — não diz nada sobre o estado do atendimento. */
export function historyLabel(fromType?: string | null): string {
  if (fromType === "user") return "Lead";
  if (fromType === "human") return "Atendente humano";
  return "Nina";
}

/** Bloco "## Conversa recente" com autores corretamente identificados. */
export function buildHistoryText(messages: ContextMessage[]): string {
  return messages
    .map((m) => `${historyLabel(m.from_type)}: ${m.content || "[media]"}`)
    .join("\n");
}

export const HUMAN_ATTENDANCE_ENDED_BLOCK =
  "## Estado atual do atendimento\n" +
  "O atendimento humano anterior foi ENCERRADO. Você (Nina) é a responsável agora. " +
  "Nunca diga que um profissional anterior está atendendo, nem prometa chamá-lo de volta, " +
  "a menos que um novo encaminhamento aconteça. Use o histórico apenas para entender o assunto.";

/**
 * O bloco só aparece quando a conversa está com a Nina, sem responsável nem handoff
 * humano ativo, E houve de fato atendimento humano anterior. Sem evidência de humano,
 * nenhum texto é adicionado (evita inventar um "atendimento anterior" inexistente).
 */
export function buildAttendanceStateBlock(
  conversation: ConversationStateInput,
  messages: ContextMessage[],
  hadPreviousHumanHandoff = false,
): string {
  const ninaInControl = (conversation.status ?? "nina") === "nina";
  const noAssignee = !conversation.assigned_user_id;
  const noActiveHandoff = !conversation.human_takeover_required && !conversation.handoff_type;
  const humanEvidence =
    hadPreviousHumanHandoff || messages.some((m) => m.from_type === "human");

  if (ninaInControl && noAssignee && noActiveHandoff && humanEvidence) {
    return HUMAN_ATTENDANCE_ENDED_BLOCK;
  }
  return "";
}
