import { describe, expect, it } from "vitest";
import {
  computeConversationPriority as P,
  countContactAttempts,
  isAngryCustomer,
  isLegalEscalation,
} from "../../supabase/functions/_shared/priority";

const now = new Date("2026-10-05T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const H = 3600_000, D = 24 * H;
const u = (t: string, c = "oi") => ({ from_type: "user", content: c, sent_at: t });
const n = (t: string) => ({ from_type: "nina", content: "ok", sent_at: t });
const h = (t: string, extra = {}) => ({ from_type: "human", content: "olá", sent_at: t, status: "sent", ...extra });

describe("resposta humana válida", () => {
  it("Nina depois continua aguardando", () => expect(P({ messages: [u(ago(H)), n(ago(H - 1000))], now }).waiting).toBe(true));
  it("humano depois deixa de aguardar", () => expect(P({ messages: [u(ago(H)), h(ago(H - 1000))], now }).waiting).toBe(false));
  it("template não encerra", () =>
    expect(P({ messages: [u(ago(H)), h(ago(H - 1000), { template_name: "pedido_enviado_correios" })], now }).waiting).toBe(true));
  it("failed não encerra", () => expect(P({ messages: [u(ago(H)), h(ago(H - 1000), { status: "failed" })], now }).waiting).toBe(true));
  it("espera começa na mais antiga não respondida após o humano", () => {
    const r = P({ messages: [u(ago(10 * D)), h(ago(9 * D)), u(ago(2 * D)), u(ago(D))], now });
    expect(r.waiting_since).toBe(ago(2 * D));
  });
});

describe("finalização", () => {
  it("mensagens antes da finalização não contam", () =>
    expect(P({ messages: [u(ago(10 * D))], finishedAt: ago(5 * D), now }).waiting).toBe(false));
  it("cliente volta depois inicia nova espera", () => {
    const r = P({ messages: [u(ago(10 * D)), u(ago(H))], finishedAt: ago(5 * D), now });
    expect(r.waiting_since).toBe(ago(H));
    expect(r.priority_reasons).not.toContain("waiting_over_7_days");
  });
});

describe("7 dias", () => {
  const reasons = (ms: number) => P({ messages: [u(ago(ms))], now }).priority_reasons;
  it("6d23h não", () => expect(reasons(7 * D - H)).not.toContain("waiting_over_7_days"));
  it("exatamente 7d não (precisa passar de 7d)", () => expect(reasons(7 * D)).not.toContain("waiting_over_7_days"));
  it(">7d é HIGH", () => {
    const r = P({ messages: [u(ago(7 * D + 60_000))], now });
    expect(r.priority_level).toBe("HIGH");
    expect(r.priority_reasons).toEqual(["waiting_over_7_days"]);
  });
});

describe("contato repetido", () => {
  it("várias em minutos = 1", () => expect(countContactAttempts([ago(3 * H), ago(3 * H - 60_000), ago(3 * H - 120_000)])).toBe(1));
  it(">2h = novo contato", () => expect(countContactAttempts([ago(6 * H), ago(H)])).toBe(2));
  it("humano no meio reinicia", () => {
    const r = P({ messages: [u(ago(6 * H)), h(ago(5 * H)), u(ago(H))], now });
    expect(r.contact_attempt_number).toBe(1);
    expect(r.priority_reasons).not.toContain("repeated_contact");
  });
  it("vários retornos contam certo", () => {
    const r = P({ messages: [u(ago(20 * H)), u(ago(15 * H)), u(ago(10 * H)), u(ago(H))], now });
    expect(r.contact_attempt_number).toBe(4);
    expect(r.priority_reasons).toContain("repeated_contact");
  });
});

describe("crítico jurídico", () => {
  it.each([
    "Se não resolverem vou entrar na justiça",
    "Vou procurar a justiça",
    "isso vai pra justiça",
    "Vou processar vocês",
    "vou abrir um processo contra a empresa",
    "Já falei com meu advogado",
    "vou procurar um advogado",
    "vou acionar judicialmente",
    "vou tomar as medidas legais cabíveis",
    "vou atrás dos meus direitos",
    "Vou registrar no Procon",
    "vou abrir reclamação no consumidor.gov",
    "vou postar no Reclame Aqui",
    "vou fazer um boletim de ocorrência",
    "vou registrar ocorrência",
  ])("positivo: %s", (t) => expect(isLegalEscalation(t)).toBe(true));
  it.each([
    "não quero precisar entrar na justiça",
    "espero não precisar procurar advogado",
    "como está o processo de entrega?",
    "o processo de compra foi fácil",
    "quais são meus direitos?",
    "minha amiga disse que vai processar a loja dela",
    "O Procon recomenda guardar a nota fiscal",
    "meu pedido não chegou",
  ])("negativo: %s", (t) => expect(isLegalEscalation(t)).toBe(false));
});

describe("cliente irritado", () => {
  it.each([["isso é um absurdo"], ["péssimo atendimento"], ["ninguém me responde"], ["estou cansada de esperar"], ["já perdi a paciência"], ["vocês não resolvem nada"], ["quero uma solução agora"]])(
    "forte: %s", (t) => expect(isAngryCustomer([t])).toBe(true));
  it("dois sinais fracos", () => expect(isAngryCustomer(["cadê meu pedido", "até agora nada!!"])).toBe(true));
  it.each([["meu pedido não chegou"], ["oi, pode verificar?"], ["cadê meu pedido"], ["obrigada"]])(
    "negativo: %s", (t) => expect(isAngryCustomer([t])).toBe(false));
});

describe("precedência", () => {
  it("jurídico + >7d = CRITICAL", () => {
    const r = P({ messages: [u(ago(8 * D), "vou no Procon")], now });
    expect(r.priority_level).toBe("CRITICAL");
    expect(r.priority_reasons).toEqual(["legal_escalation", "waiting_over_7_days"]);
  });
  it("jurídico + irritado + repetido = CRITICAL com todos", () => {
    const r = P({ messages: [u(ago(10 * H), "isso é um absurdo"), u(ago(H), "vou entrar na justiça")], now });
    expect(r.priority_level).toBe("CRITICAL");
    expect(r.priority_reasons).toEqual(["legal_escalation", "angry_customer", "repeated_contact"]);
  });
  it("repetido + >7d = HIGH com dois", () => {
    const r = P({ messages: [u(ago(9 * D)), u(ago(D))], now });
    expect(r.priority_level).toBe("HIGH");
    expect(r.priority_reasons).toEqual(["repeated_contact", "waiting_over_7_days"]);
  });
  it("sem espera = NORMAL", () => expect(P({ messages: [u(ago(H)), h(ago(1000))], now }).priority_level).toBe("NORMAL"));
});
