/**
 * Regras puras da inscrição pública (página Shopify → Nina).
 * Sem acesso a rede ou banco: validação, normalização e textos.
 */

export const CONSENT_TEXTS: Record<string, string> = {
  v1: "Quero receber novidades, lançamentos, promoções e conteúdos da Lakma Dermocosméticos pelo WhatsApp.",
};

export const SIGNUP_CONTACT_TYPES = ["profissional_estetica", "cliente_final"] as const;
export type SignupContactType = (typeof SIGNUP_CONTACT_TYPES)[number];

export const VALID_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export const GENERIC_OK = "Inscrição recebida.";
export const INVALID_PHONE_MSG = "Informe um WhatsApp válido.";

export interface NormalizedPhone { canonical: string; legacy: string }

/**
 * Celular brasileiro → 55 + DDD + 9 + 8 dígitos.
 * Aceita +55, 55, espaços, parênteses, hífen, número nacional e 0 de longa distância.
 * Fixo (8 dígitos sem o 9) é recusado. `legacy` é a mesma linha sem o 9 (formato antigo da base).
 */
export function normalizeBrMobile(raw: unknown): NormalizedPhone | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  let d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  d = d.replace(/^0+/, "");
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  else if (d.length === 12 && d.startsWith("55")) return null; // 55 + DDD + 8 dígitos = fixo/sem o 9
  if (d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (!VALID_DDDS.has(ddd)) return null;
  if (d[2] !== "9") return null;
  const local = d.slice(3);
  if (!/^[6-9]\d{7}$/.test(local)) return null; // celular: 9 + [6-9]xxxxxxx
  return { canonical: `55${d}`, legacy: `55${d.slice(0, 2)}${local}` };
}

export type SignupValidation =
  | { ok: true; name: string; phone: NormalizedPhone; contact_type: SignupContactType; consent_version: string; consent_text: string; turnstile_token: string }
  | { ok: false; error: "invalid_name" | "invalid_phone" | "invalid_contact_type" | "consent_required" | "invalid_consent_version" | "turnstile_missing" | "invalid_payload" };

export function validateSignup(body: unknown): SignupValidation {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_payload" };
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 80 || /[<>{}]/.test(name)) return { ok: false, error: "invalid_name" };
  const phone = normalizeBrMobile(b.phone);
  if (!phone) return { ok: false, error: "invalid_phone" };
  if (!SIGNUP_CONTACT_TYPES.includes(b.contact_type as SignupContactType)) return { ok: false, error: "invalid_contact_type" };
  if (b.consent_accepted !== true) return { ok: false, error: "consent_required" };
  const version = typeof b.consent_version === "string" ? b.consent_version : "";
  if (version !== "v1" || !CONSENT_TEXTS[version]) return { ok: false, error: "invalid_consent_version" };
  const token = typeof b.turnstile_token === "string" ? b.turnstile_token.trim() : "";
  if (!token || token.length > 4096) return { ok: false, error: "turnstile_missing" };
  return {
    ok: true, name, phone, contact_type: b.contact_type as SignupContactType,
    consent_version: version, consent_text: CONSENT_TEXTS[version], turnstile_token: token,
  };
}

/** Origens permitidas vindas de configuração (lista separada por vírgula). */
export function parseAllowedOrigins(raw: string | undefined | null): string[] {
  return (raw ?? "").split(",").map((s) => s.trim().replace(/\/+$/, "").toLowerCase()).filter(Boolean);
}
export function isAllowedOrigin(origin: string | null, allowed: string[]): boolean {
  if (!origin) return false;
  return allowed.includes(origin.replace(/\/+$/, "").toLowerCase());
}

/** Mensagem pública por erro (nunca revela se o número existe). */
export function publicErrorMessage(err: string): string {
  if (err === "invalid_phone") return INVALID_PHONE_MSG;
  if (err === "invalid_name") return "Informe seu nome.";
  if (err === "consent_required") return "É preciso aceitar receber mensagens pelo WhatsApp.";
  if (err === "rate_limited") return "Muitas tentativas. Tente novamente mais tarde.";
  if (err === "turnstile_failed" || err === "turnstile_missing") return "Não foi possível confirmar que você não é um robô.";
  return "Não foi possível concluir a inscrição.";
}
