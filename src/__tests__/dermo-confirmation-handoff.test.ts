import { describe, expect, it } from "vitest";
import {
  applyResolvedHandoff,
  isDermoOfferConfirmed,
  isDermoPromise,
  resolveHandoffDecision,
} from "../../supabase/functions/_shared/handoff";

const OFFER = "Nossa dermoconsultora poderá te orientar com detalhes. Posso encaminhar você para ela?";
const OFFER_EXPLICIT = "Posso encaminhar você para nossa dermoconsultora?";
const u = (content: string) => ({ from_type: "user", content });
const n = (content: string) => ({ from_type: "nina", content });

function decide(history: any[], current: string, agent = "Perfeito!") {
  return resolveHandoffDecision({ agentContent: agent, currentUserText: current, history: [...history, u(current)] });
}

describe("confirmação contextual da oferta de dermoconsultora", () => {
  const base = [u("Gostaria de protocolo de clareamento íntimo"), n(OFFER)];
  it.each(["Sim", "pode sim", "quero", "Pode", "Quero sim", "por favor", "Agradeço\nSim"])("1-3) %s => handoff dermo", (t) => {
    const d = decide(base, t);
    expect(d.target?.destination).toBe("dermoconsultant");
    expect(d.target?.reason).toBe("dermoconsultora_request");
  });
  it("pergunta explícita com a palavra dermoconsultora também vale", () => {
    expect(decide([n(OFFER_EXPLICIT)], "sim").target?.destination).toBe("dermoconsultant");
  });
  it("4) sim sem pergunta anterior de dermo => nada", () => {
    expect(decide([n("Você gostou do kit?")], "sim").target).toBeNull();
    expect(decide([], "sim").target).toBeNull();
  });
  it("5) pergunta antiga com outras mensagens no meio => nada", () => {
    const h = [n(OFFER), u("Qual o preço do sérum?"), n("Custa R$ 120.")];
    expect(decide(h, "sim").target).toBeNull();
    expect(isDermoOfferConfirmed([n(OFFER), u("e quanto custa o frete para Fortaleza"), u("sim")], "sim")).toBe(false);
  });
  it("mensagem que não é confirmação curta => nada", () => {
    expect(isDermoOfferConfirmed([n(OFFER), u("sim, mas antes quero saber o preço")], "sim, mas antes quero saber o preço")).toBe(false);
  });
});

describe("promessa da Nina sem marcador", () => {
  it.each([
    "Perfeito, Vânia! Vou encaminhar você agora para nossa dermoconsultora, que vai te orientar.",
    "Nossa dermoconsultora entrará em contato em breve.",
    "Vou te passar para a dermoconsultora.",
    "Sua solicitação já está com nossa dermoconsultora.",
  ])("6) %s => handoff", (t) => {
    expect(isDermoPromise(t)).toBe(true);
    expect(decide([u("oi")], "tá bom", t).target?.destination).toBe("dermoconsultant");
  });
  it.each([
    "Nossa dermoconsultora poderá te orientar com detalhes sobre as opções.",
    "Posso encaminhar você para nossa dermoconsultora?",
    "Se precisar, vou te passar para a dermoconsultora.",
    "A Lakma tem dermoconsultoras que criaram esses protocolos.",
  ])("7) menção informativa/oferta: %s => nada", (t) => {
    expect(isDermoPromise(t)).toBe(false);
    expect(decide([u("oi")], "ok", t).target).toBeNull();
  });
  it("9) assunto sensível recente preserva o motivo sensível (Laura)", () => {
    const d = decide([u("estou grávida, posso usar ácido?"), n(OFFER)], "sim");
    expect(d.target?.destination).toBe("dermoconsultant");
    expect(d.target?.reason).not.toBe("dermoconsultora_request");
  });
  it("promessa da Leticia continua indo para a Leticia", () => {
    expect(decide([u("cadê meu pedido")], "ok", "Vou encaminhar para a Leticia.").target?.destination).toBe("financeiro");
  });
});

describe("idempotência", () => {
  it("já com dermoconsultora atribuída => não escolhe outra", async () => {
    let rpc = 0;
    const admin: any = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { human_takeover_required: true, handoff_type: "dermoconsultant", assigned_user_id: "x" } }) }) }) }),
      rpc: async () => { rpc++; return { data: null }; },
    };
    const r = await applyResolvedHandoff(admin, { conversationId: "c", target: { reason: "dermoconsultora_request", destination: "dermoconsultant" } as any, source: "agent_promise" });
    expect(r.deduped).toBe(true);
    expect(rpc).toBe(0);
  });
});
