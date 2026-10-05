/**
 * Prioridade das conversas da Letícia (CRITICAL / HIGH / NORMAL).
 * Função pura e canônica: servidor calcula, a tela só exibe. Nada é gravado.
 */

export type PriorityLevel = "CRITICAL" | "HIGH" | "NORMAL";
export type PriorityReason = "legal_escalation" | "angry_customer" | "repeated_contact" | "waiting_over_7_days";

export interface PriorityMessage {
  from_type: string;
  content: string | null;
  sent_at: string;
  status?: string | null;
  template_name?: string | null;
}

export interface ConversationPriority {
  priority_level: PriorityLevel;
  priority_reasons: PriorityReason[];
  waiting: boolean;
  waiting_since: string | null;
  waiting_minutes: number | null;
  contact_attempt_number: number | null;
  last_valid_human_reply_at: string | null;
  last_customer_message_at: string | null;
}

export const REPEATED_CONTACT_GAP_MS = 2 * 60 * 60 * 1000;
export const WAITING_HIGH_MS = 7 * 24 * 60 * 60 * 1000;

/** Humano de verdade: não é aviso automático (template) e o envio não falhou. */
export function isValidHumanReply(m: PriorityMessage): boolean {
  return m.from_type === "human" && !m.template_name && m.status !== "failed";
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const sentencesOf = (t: string) => norm(t).replace(/consumidor\s*\.\s*gov(\.br)?/g, "consumidorgov").match(/[^.!?\n]+[.!?]*/g) ?? [];

// ── CRÍTICO: intenção jurídica/formal ──────────────────────────────────────
const LEGAL_PATTERNS: RegExp[] = [
  /\b(entrar|ir|recorrer|procurar|acionar|levar)\b[^.!?]{0,25}\bjustica\b/,
  /\b(vai|vou levar|isso vai)\b[^.!?]{0,15}\b(para|pra)\s+(a\s+)?justica\b/,
  /\b(vou|irei|vamos|ja|quero)\s+(te\s+|voces\s+|vcs\s+)?process(ar|ei)\b/,
  /\bprocessar\s+(voces|vcs|a\s+(empresa|loja))\b/,
  /\b(abrir|abri|entrar com|entrei com)\s+(um\s+)?processo\b/,
  /\b(procurar|falar com|falei com|chamar|acionar|contratar|consultar|consultei|meu|minha)\s+(um\s+|o\s+|a\s+|meu\s+|minha\s+)?advogad[oa]\b/,
  /\bjudicialmente\b/,
  /\b(medidas|providencias|acoes)\s+(legais|judiciais|cabiveis)\b/,
  /\b(procurar|atras|buscar|recorrer a|recorrer aos)\s+(d?os\s+)?meus\s+direitos\b/,
  /\b(vou|irei|vou ter que|vou precisar|ja|abrir|abri|registrar|registrei|fazer|fiz|reclamar|reclamei|recorrer|acionar|denunciar|entrar|postar|colocar|ir ao|ir no|ir para o|levar ao|levar pro)\b[^.!?]{0,40}\b(procon|consumidor\s*\.?\s*gov|reclame\s*aqui)\b/,
  /\b(fazer|registrar|abrir|fiz|registrei|abri)\s+(um\s+|uma\s+)?(boletim de ocorrencia|b\.?\s?o\b|ocorrencia)/,
  /\b(vou|irei|ja)\s+(fazer\s+uma\s+|registrar\s+uma\s+)?denuncia(r)?\b/,
];
const LEGAL_NEGATION = /\b(nao\s+(quero|queria|vou|pretendo|gostaria|gostaria de|desejo)|espero\s+nao|sem\s+precisar|para\s+nao\s+precisar|pra\s+nao\s+precisar)\b/;
const THIRD_PARTY = /\b(ele|ela|eles|elas|minha\s+(amiga|mae|irma|vizinha|colega)|meu\s+(amigo|marido|irmao|pai|vizinho|colega)|uma\s+(cliente|pessoa)|outra\s+pessoa|disseram|falaram\s+que|disse\s+que|vi\s+(que|alguem))\b/;
const NEUTRAL_QUESTION = /^\s*(quais|qual|como|o que)\b/;

export function isLegalEscalation(text: string | null | undefined): boolean {
  if (!text) return false;
  return sentencesOf(text).some((s) => {
    if (!LEGAL_PATTERNS.some((p) => p.test(s))) return false;
    if (LEGAL_NEGATION.test(s)) return false;
    if (THIRD_PARTY.test(s) && !/\b(eu|vou|irei|meu advogado)\b/.test(s)) return false;
    if (s.trim().endsWith("?") && NEUTRAL_QUESTION.test(s)) return false;
    return true;
  });
}

// ── ALTO: cliente irritado ─────────────────────────────────────────────────
const ANGRY_STRONG: RegExp[] = [
  /\b(isso e|que|um|uma)\s+(absurdo|palhacada|vergonha|descaso|falta de respeito)\b/,
  /\b(absurdo|palhacada|descaso|falta de respeito)\b/,
  /\bpessimo\s+(atendimento|servico|empresa|loja)\b/,
  /\bpior\s+(atendimento|loja|empresa|servico)\b/,
  /\bninguem\s+(me\s+)?(responde|atende|resolve|da\s+retorno)\b/,
  /\b(cansad[oa]|cansei)\s+de\s+(esperar|pedir|cobrar|mandar)\b/,
  /\bperdi\s+(a|minha)\s+paciencia\b/,
  /\bvoces\s+nao\s+resolvem\b|\bvcs\s+nao\s+resolvem\b/,
  /\bquero\s+(uma\s+)?solucao\s+(agora|ja|imediata)\b/,
  /\bestou\s+(muito\s+)?(indignad[oa]|revoltad[oa]|furios[oa])\b/,
  /\bridiculo\b/,
];
const ANGRY_WEAK: RegExp[] = [
  /\bate\s+agora\s+nada\b|\bnada\s+ainda\b/,
  /\b(demorando|demora|demorou)\s+(muito|demais|tanto)\b|\btanto\s+tempo\b/,
  /\bde\s+novo\b|\bmais\s+uma\s+vez\b|\bnovamente\b/,
  /\bcade\b/,
  /\bninguem\b/,
  /\bvao\s+me\s+responder\b|\bsem\s+resposta\b|\bsem\s+retorno\b/,
  /!{2,}|\?{2,}/,
  /[🙄😡😠🤬😤]/u,
];

export function angrySignals(texts: string[]): { strong: number; weak: number } {
  let strong = 0;
  const weakHit = new Set<number>();
  for (const t of texts) {
    const n = norm(t ?? "");
    if (ANGRY_STRONG.some((p) => p.test(n))) strong++;
    ANGRY_WEAK.forEach((p, i) => { if (p.test(n) || p.test(t ?? "")) weakHit.add(i); });
    // palavras longas em caixa alta (gritando)
    if (/\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{5,}\b.*\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{4,}\b/.test(t ?? "")) weakHit.add(99);
  }
  return { strong, weak: weakHit.size };
}

export function isAngryCustomer(texts: string[]): boolean {
  const { strong, weak } = angrySignals(texts);
  return strong >= 1 || weak >= 2;
}

/** Agrupa mensagens do cliente em contatos: nova tentativa quando > 2 h da anterior. */
export function countContactAttempts(customerTimes: string[]): number {
  let attempts = 0;
  let prev: number | null = null;
  for (const iso of customerTimes) {
    const t = new Date(iso).getTime();
    if (prev === null || t - prev > REPEATED_CONTACT_GAP_MS) attempts++;
    prev = t;
  }
  return attempts;
}

export function computeConversationPriority(input: {
  messages: PriorityMessage[];
  finishedAt?: string | null;
  now: Date;
}): ConversationPriority {
  const msgs = [...input.messages].sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  const finishedMs = input.finishedAt ? new Date(input.finishedAt).getTime() : -Infinity;
  const lastHuman = [...msgs].reverse().find(isValidHumanReply) ?? null;
  const lastCustomer = [...msgs].reverse().find((m) => m.from_type === "user") ?? null;
  const boundary = Math.max(lastHuman ? new Date(lastHuman.sent_at).getTime() : -Infinity, finishedMs);

  const pending = msgs.filter((m) => m.from_type === "user" && new Date(m.sent_at).getTime() > boundary);
  const base = {
    last_valid_human_reply_at: lastHuman?.sent_at ?? null,
    last_customer_message_at: lastCustomer?.sent_at ?? null,
  };
  if (pending.length === 0) {
    return { priority_level: "NORMAL", priority_reasons: [], waiting: false, waiting_since: null, waiting_minutes: null, contact_attempt_number: null, ...base };
  }

  const waitingSince = pending[0].sent_at;
  const waitedMs = input.now.getTime() - new Date(waitingSince).getTime();
  const attempts = countContactAttempts(pending.map((m) => m.sent_at));
  const texts = pending.map((m) => m.content ?? "");

  const reasons: PriorityReason[] = [];
  if (texts.some(isLegalEscalation)) reasons.push("legal_escalation");
  if (isAngryCustomer(texts)) reasons.push("angry_customer");
  if (attempts >= 2) reasons.push("repeated_contact");
  if (waitedMs > WAITING_HIGH_MS) reasons.push("waiting_over_7_days"); // exatamente 7d ainda não

  const level: PriorityLevel = reasons.includes("legal_escalation") ? "CRITICAL" : reasons.length ? "HIGH" : "NORMAL";
  return {
    priority_level: level,
    priority_reasons: reasons,
    waiting: true,
    waiting_since: waitingSince,
    waiting_minutes: Math.max(0, Math.floor(waitedMs / 60000)),
    contact_attempt_number: attempts,
    ...base,
  };
}
