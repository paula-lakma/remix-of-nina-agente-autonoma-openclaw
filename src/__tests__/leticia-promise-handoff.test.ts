import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyResolvedHandoff,
  detectHandoffTarget,
  detectHandoffTargetFromHistory,
  isLeticiaPromise,
  resolveHandoffDecision,
} from "../../supabase/functions/_shared/handoff";

const L = (reason: string) => ({ reason, destination: "financeiro" });

describe("A) código de rastreio sozinho -> Leticia", () => {
  it.each(["AP556727915BR", "Ap521128522br", " AP526237952BR ", "o código é AP509553699BR"])("%s", (t) => {
    expect(detectHandoffTarget(t)).toEqual(L("tracking_help"));
  });
  it.each(["ABC123", "AP55672791BR", "AP5567279150BR", "X1234567890YZ1", "12345678901", "promo10off"])("não é rastreio: %s", (t) => {
    expect(detectHandoffTarget(t)?.reason).not.toBe("tracking_help");
  });
});

describe("B/C) pedido não entregue -> Leticia", () => {
  it.each([
    "Pq vcs não me entregaram aqui",
    "vocês não me entregaram",
    "não me entregaram",
    "porque não entregaram",
    "pq não entregaram",
    "ainda não entregaram",
    "não entregaram aqui",
    "meu pedido não chegou",
    "ainda não chegou",
    "não recebi meu pedido",
    "cadê meu pedido",
  ])("%s", (t) => {
    expect(detectHandoffTarget(t)?.destination).toBe("financeiro");
  });
});

describe("isLeticiaPromise", () => {
  it.each([
    "Vou te encaminhar para a Letícia.",
    "Vou lhe encaminhar para a Leticia.",
    "Vou passar você para a Letícia.",
    "Vou te passar para a Letícia.",
    "Vou lhe passar para a Letícia, tudo bem.",
    "Vou direcionar para a Letícia.",
    "Vou conectar você com a Letícia.",
    "Vou chamar a Letícia.",
    "Já repassei o seu caso para a Leticia e informei que você viaja amanhã.",
    "Oi! Vou encaminhar seu atendimento para a Leticia, que vai verificar as informações do seu pedido.",
  ])("promessa: %s", (t) => expect(isLeticiaPromise(t)).toBe(true));

  it.each([
    "Quer que eu te encaminhe para a Letícia?",
    "Posso te encaminhar para a Letícia?",
    "Posso te encaminhar?",
    "Se precisar, posso chamar a Letícia.",
    "Se tiver dúvida posso chamar a Letícia.",
    "A Letícia pode te ajudar.",
    "Caso tenha alguma dúvida, posso encaminhar.",
    "A Letícia cuida do acompanhamento dos pedidos.",
    "Vou te encaminhar para a Letícia?",
    "",
  ])("não é promessa: %s", (t) => expect(isLeticiaPromise(t)).toBe(false));

  it("I) c788b549 — oferta condicional não dispara", () => {
    const nina = "Isso mesmo, Cliente! Esse é o código do seu pedido. Acesse https://rastreamento.correios.com.br/ e insira o código para acompanhar a entrega. Qualquer dúvida sobre o pedido, posso encaminhar para a Leticia, que cuida do acompanhamento. 😊";
    expect(isLeticiaPromise(nina)).toBe(false);
  });
});

describe("resolveHandoffDecision — rede de segurança", () => {
  it("D) promessa sem motivo e sem assunto detectável -> Leticia (agent_promise)", () => {
    const d = resolveHandoffDecision({ agentContent: "Vou te encaminhar para a Letícia.", currentUserText: "ok obrigada pela atenção", history: [] });
    expect(d.target).toEqual(L("order_financial_question"));
    expect(d.source).toBe("agent_promise");
  });

  it("E) usa o assunto recente do cliente como motivo", () => {
    const history = [
      { from_type: "user", content: "o rastreio não atualiza faz dias" },
      { from_type: "nina", content: "Entendi." },
      { from_type: "user", content: "e agora?" },
    ];
    const d = resolveHandoffDecision({ agentContent: "Vou lhe passar para a Letícia.", currentUserText: "e agora?", history });
    expect(d.target).toEqual(L("tracking_no_update"));
  });

  it("pergunta/oferta da Nina não dispara", () => {
    for (const a of ["Quer que eu te encaminhe para a Letícia?", "Posso te encaminhar?", "Se tiver dúvida posso chamar a Letícia."]) {
      expect(resolveHandoffDecision({ agentContent: a, currentUserText: "ok", history: [] }).target).toBeNull();
    }
  });

  it("J) estruturado para Paula não é sobrescrito", () => {
    const d = resolveHandoffDecision({ structuredReason: "refund_request", agentContent: "Vou te encaminhar para a Letícia.", currentUserText: "ok", history: [] });
    expect(d.target?.destination).not.toBe("financeiro");
    expect(d.source).toBe("structured");
  });

  it("K) estruturado para Carla não é sobrescrito", () => {
    const d = resolveHandoffDecision({ structuredReason: "influencer", agentContent: "Vou te encaminhar para a Letícia.", currentUserText: "ok", history: [] });
    expect(d.target?.destination).toBe("parcerias");
  });

  it("Paula detectada na mensagem atual continua com precedência", () => {
    const d = resolveHandoffDecision({ agentContent: "Vou te encaminhar para a Letícia.", currentUserText: "quero o reembolso do meu pedido", history: [] });
    expect(d.target?.destination).not.toBe("financeiro");
  });
});

describe("N) 4 casos históricos (simulação, nada é gravado)", () => {
  const cases = [
    ["0ecc5fd9", "AP556727915BR", "Olá, Cliente! Vou encaminhar seu atendimento para a Leticia, que vai verificar as informações do seu pedido com esse código de rastreio.", "tracking_help"],
    ["3b1067f5", "Pq vcs não me entregaram aqui\nBem simples 🙄🤔", "Oi, Cliente! Entendo sua frustração. Vou encaminhar seu atendimento para a Leticia, que vai verificar as informações do seu pedido e te ajudar com isso.", "where_is_my_order"],
    ["93e105bf", "Ap521128522br", "Olá, Cliente! Vou encaminhar seu atendimento para a Leticia, que vai verificar as informações do seu pedido e ajudar com o rastreio.", "tracking_help"],
    ["a03a8d51", "AP526237952BR", "Cliente, vou encaminhar seu atendimento para a Leticia, que vai verificar as informações do seu pedido com esse código de rastreio.", "tracking_help"],
  ] as const;
  it.each(cases)("%s -> Leticia já pela mensagem do cliente", (_id, user, nina, reason) => {
    // Antes da Nina responder (orquestrador): detecção determinística.
    expect(detectHandoffTargetFromHistory(user, [])).toEqual(L(reason));
    // No retorno da Nina (nina-reply): decisão final + promessa reconhecida.
    expect(resolveHandoffDecision({ agentContent: nina, currentUserText: user, history: [] }).target).toEqual(L(reason));
    expect(isLeticiaPromise(nina)).toBe(true);
  });
});

// ── applyResolvedHandoff com banco simulado ─────────────────────────────────
function fakeAdmin(opts: { rpcError?: unknown; grantAfter?: boolean; already?: boolean }) {
  const calls = { rpc: 0 };
  const admin: any = {
    rpc: async () => { calls.rpc++; return { data: { ok: true }, error: opts.rpcError ?? null }; },
    from: (table: string) => {
      const q: any = {
        select: () => q, eq: () => q, limit: () => q,
        maybeSingle: async () => {
          if (table === "conversations") {
            return { data: opts.already ? { ai_paused: true, human_takeover_required: true, handoff_type: "financeiro", handoff_reason: "tracking_help" } : null };
          }
          if (table === "conversation_access_grants") {
            const has = opts.already || (opts.grantAfter && calls.rpc > 0);
            return { data: has ? { id: "g1" } : null, error: null };
          }
          return { data: null };
        },
      };
      return q;
    },
  };
  return { admin, calls };
}

describe("applyResolvedHandoff — garantia e idempotência", () => {
  const g = globalThis as any;
  let prev: unknown;
  beforeEach(() => { prev = g.Deno; g.Deno = { env: { get: (k: string) => (k === "EXPEDICAO_CHAT_HANDOFF_ENABLED" ? "true" : undefined) } }; });
  afterEach(() => { g.Deno = prev; });
  const params = { conversationId: "c1", target: L("tracking_help") as any, source: "agent_promise" as const };

  it("aplica e confirma o acesso ativo", async () => {
    const { admin, calls } = fakeAdmin({ grantAfter: true });
    await expect(applyResolvedHandoff(admin, params)).resolves.toMatchObject({ applied: true });
    expect(calls.rpc).toBe(1);
  });

  it("L) já com a Leticia: não repete (sem acesso nem evento duplicado)", async () => {
    const { admin, calls } = fakeAdmin({ already: true });
    await expect(applyResolvedHandoff(admin, params)).resolves.toMatchObject({ deduped: true });
    expect(calls.rpc).toBe(0);
  });

  it("M) falha na aplicação lança erro (não termina como sucesso)", async () => {
    const { admin } = fakeAdmin({ rpcError: new Error("rpc down") });
    await expect(applyResolvedHandoff(admin, params)).rejects.toThrow("rpc down");
  });

  it("M) aplicação sem acesso ativo depois também lança erro", async () => {
    const { admin } = fakeAdmin({ grantAfter: false });
    await expect(applyResolvedHandoff(admin, params)).rejects.toThrow("handoff_grant_missing");
  });
});
