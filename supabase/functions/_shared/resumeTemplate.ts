// Modelo de retomada da Expedição (Letícia). Regras puras, espelho da regra do banco
// `resume_safe_name` — o servidor é sempre quem decide; isto serve a testes e textos.

export const RESUME_TEMPLATE_NAME = "retomada_atendimento_lakma";
export const RESUME_TEMPLATE_LANGUAGE = "pt_BR";

const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ]+([ '-][A-Za-zÀ-ÖØ-öø-ÿ]+)*$/;

function ok(v: string): boolean {
  return v.length >= 2 && v.length <= 30 && NAME_RE.test(v);
}

/** call_name válido; senão primeiro nome de name; senão null (nunca inventa). */
export function resumeSafeName(callName: string | null | undefined, name: string | null | undefined): string | null {
  const c = String(callName ?? "").replace(/\s+/g, " ").trim();
  if (ok(c)) return c;
  const f = String(name ?? "").replace(/\s+/g, " ").trim().split(" ")[0] ?? "";
  return ok(f) ? f : null;
}

export function resumeBody(name: string): string {
  return `Olá, ${name}! Aqui é a equipe da Lakma Dermocosméticos. Estamos retornando o seu atendimento. Quando puder, responda esta mensagem para continuarmos por aqui.`;
}

export const RESUME_ERROR_CODES = [
  "resume_window_open", "resume_template_not_approved", "resume_conversation_finished",
  "resume_invalid_name", "resume_recent_duplicate", "forbidden",
] as const;
export type ResumeErrorCode = typeof RESUME_ERROR_CODES[number];

/** Extrai o código conhecido da exceção do banco. */
export function resumeErrorCode(message: string | null | undefined): ResumeErrorCode | null {
  const m = String(message ?? "");
  return RESUME_ERROR_CODES.find((c) => m.includes(c)) ?? null;
}

export const RESUME_ERROR_TEXT: Record<string, string> = {
  resume_window_open: "O cliente respondeu e a janela reabriu — responda por texto normalmente.",
  resume_template_not_approved: "O modelo de retomada não está aprovado pela Meta no momento.",
  resume_conversation_finished: "Esta conversa já foi finalizada.",
  resume_invalid_name: "Nome do cliente inválido para o modelo — peça a um gerente para corrigir o nome do contato.",
  resume_recent_duplicate: "O modelo de retomada já foi enviado há menos de 10 minutos nesta conversa.",
  forbidden: "Você não tem mais acesso a esta conversa.",
  unauthorized: "Sessão expirada. Entre novamente.",
};

export function resumeErrorText(code: string | null | undefined): string {
  return RESUME_ERROR_TEXT[String(code ?? "")] ?? "Não foi possível enviar o modelo de retomada. Tente novamente.";
}
