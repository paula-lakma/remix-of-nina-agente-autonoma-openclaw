import { describe, expect, it } from "vitest";
import { CONSENT_TEXTS, isAllowedOrigin, isAllowedTurnstileHostname, normalizeBrMobile, originHostnames, parseAllowedOrigins, publicErrorMessage, validateSignup } from "../../supabase/functions/_shared/signup";

const ok = { name: "Maria Silva", phone: "(11) 98765-4321", contact_type: "cliente_final", consent_accepted: true, consent_version: "v1", turnstile_token: "tok" };

describe("telefone", () => {
  it("+55 formatado", () => expect(normalizeBrMobile("+55 (11) 98765-4321")).toEqual({ canonical: "5511987654321", legacy: "551187654321" }));
  it("espaços e símbolos", () => expect(normalizeBrMobile(" 11 9 8765.4321 ")?.canonical).toBe("5511987654321"));
  it("55 sem +", () => expect(normalizeBrMobile("5521998887777")?.canonical).toBe("5521998887777"));
  it("0 de longa distância", () => expect(normalizeBrMobile("011987654321")?.canonical).toBe("5511987654321"));
  it("fixo recusado", () => { expect(normalizeBrMobile("(11) 3456-7890")).toBeNull(); expect(normalizeBrMobile("551134567890")).toBeNull(); });
  it("DDD inválido recusado", () => expect(normalizeBrMobile("(20) 98765-4321")).toBeNull());
  it("curto/longo recusado", () => { expect(normalizeBrMobile("98765-4321")).toBeNull(); expect(normalizeBrMobile("55119876543210")).toBeNull(); });
  it("forma legada sem o 9 para achar contato antigo", () => expect(normalizeBrMobile("11987654321")?.legacy).toBe("551187654321"));
});

describe("validação do envio", () => {
  it("válido", () => { const v = validateSignup(ok); expect(v.ok).toBe(true); if (v.ok) expect(v.consent_text).toBe(CONSENT_TEXTS.v1); });
  it("texto v1 é o aprovado", () => expect(CONSENT_TEXTS.v1).toBe("Quero receber novidades, lançamentos, promoções e conteúdos da Lakma Dermocosméticos pelo WhatsApp."));
  it("nome inválido", () => { expect(validateSignup({ ...ok, name: " a " })).toEqual({ ok: false, error: "invalid_name" }); expect(validateSignup({ ...ok, name: "x".repeat(81) })).toEqual({ ok: false, error: "invalid_name" }); });
  it("telefone inválido", () => expect(validateSignup({ ...ok, phone: "123" })).toEqual({ ok: false, error: "invalid_phone" }));
  it("telefone fixo", () => expect(validateSignup({ ...ok, phone: "1134567890" })).toEqual({ ok: false, error: "invalid_phone" }));
  it("aceite false", () => expect(validateSignup({ ...ok, consent_accepted: false })).toEqual({ ok: false, error: "consent_required" }));
  it("aceite 'true' texto não vale", () => expect(validateSignup({ ...ok, consent_accepted: "true" })).toEqual({ ok: false, error: "consent_required" }));
  it("versão inválida", () => expect(validateSignup({ ...ok, consent_version: "v2" })).toEqual({ ok: false, error: "invalid_consent_version" }));
  it("tipo inválido", () => expect(validateSignup({ ...ok, contact_type: "distribuidor" })).toEqual({ ok: false, error: "invalid_contact_type" }));
  it("Turnstile ausente", () => expect(validateSignup({ ...ok, turnstile_token: "" })).toEqual({ ok: false, error: "turnstile_missing" }));
  it("texto do navegador é ignorado", () => { const v = validateSignup({ ...ok, consent_text: "outro" }); expect(v.ok && v.consent_text).toBe(CONSENT_TEXTS.v1); });
});

describe("origem e mensagens", () => {
  const allowed = parseAllowedOrigins("https://lakma.com.br/, https://loja.myshopify.com");
  it("origem permitida", () => expect(isAllowedOrigin("https://lakma.com.br", allowed)).toBe(true));
  it("origem estranha recusada", () => expect(isAllowedOrigin("https://evil.com", allowed)).toBe(false));
  it("sem origem recusada", () => expect(isAllowedOrigin(null, allowed)).toBe(false));
  it("mensagem não revela existência", () => expect(publicErrorMessage("invalid_phone")).toBe("Informe um WhatsApp válido."));
});

describe("hostname informado pela Cloudflare", () => {
  const hosts = originHostnames(parseAllowedOrigins("https://lakma.com.br,https://www.lakma.com.br"));

  it("extrai os hostnames das origens autorizadas", () => expect(hosts).toEqual(["lakma.com.br", "www.lakma.com.br"]));
  it("origem malformada não vira hostname", () => expect(originHostnames(parseAllowedOrigins("https://lakma.com.br,nada,http://"))).toEqual(["lakma.com.br"]));
  it("aceita os dois domínios aprovados", () => {
    expect(isAllowedTurnstileHostname("lakma.com.br", hosts)).toBe(true);
    expect(isAllowedTurnstileHostname("www.lakma.com.br", hosts)).toBe(true);
  });
  it("ignora maiúsculas e ponto final", () => expect(isAllowedTurnstileHostname("WWW.LAKMA.COM.BR.", hosts)).toBe(true));
  it("recusa domínio estranho", () => expect(isAllowedTurnstileHostname("evil.com", hosts)).toBe(false));
  it("recusa sufixo colado no domínio", () => expect(isAllowedTurnstileHostname("lakma.com.br.evil.com", hosts)).toBe(false));
  it("recusa subdomínio não listado", () => expect(isAllowedTurnstileHostname("loja.lakma.com.br", hosts)).toBe(false));
  it("recusa hostname ausente", () => {
    expect(isAllowedTurnstileHostname(null, hosts)).toBe(false);
    expect(isAllowedTurnstileHostname("", hosts)).toBe(false);
    expect(isAllowedTurnstileHostname(undefined, hosts)).toBe(false);
  });
  it("sem hostnames configurados recusa tudo", () => expect(isAllowedTurnstileHostname("lakma.com.br", [])).toBe(false));
  it("mensagem não revela o motivo", () => expect(publicErrorMessage("turnstile_hostname")).toBe("Não foi possível confirmar que você não é um robô."));
});
