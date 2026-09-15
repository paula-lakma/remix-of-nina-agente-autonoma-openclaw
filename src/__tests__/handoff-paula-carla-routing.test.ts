import { describe, expect, it } from "vitest";
import { detectHandoffTarget, resolveHandoffDecision } from "../../supabase/functions/_shared/handoff";

const decide = (text: string, agentContent = "Entendi, já te ajudo.") =>
  resolveHandoffDecision({ currentUserText: text, agentContent });

describe("Paula Rodrigues — distribuição e comercial estratégico", () => {
  const cases = [
    "Quero ser distribuidor da Lakma",
    "Tenho interesse em revender os produtos de vocês",
    "Quero ser representante da marca na minha região",
    "Gostaria de uma parceria comercial como canal de venda",
  ];

  it.each(cases)("%s vai para o comercial (Paula)", (text) => {
    expect(detectHandoffTarget(text)?.destination).toBe("comercial");
    expect(decide(text).target?.destination).toBe("comercial");
  });
});

describe("Paula Rodrigues — casos escalados", () => {
  const cases: Array<[string, string]> = [
    ["Quero reembolso do meu pedido", "refund_request"],
    ["Quero cancelar e receber meu dinheiro de volta", "refund_request"],
    ["Quero solicitar o estorno da compra", "refund_request"],
    ["Quero contestar essa cobrança", "chargeback_dispute"],
    ["Meu produto chegou avariado", "damaged_product"],
    ["Faltou um produto no meu pedido", "missing_item"],
    ["Quero fazer a troca do produto", "exchange"],
    ["Quero registrar uma reclamação", "complaint_sac"],
  ];

  it.each(cases)("%s -> %s (Paula)", (text, reason) => {
    expect(detectHandoffTarget(text)).toEqual({ reason, destination: "comercial" });
    expect(decide(text).target).toEqual({ reason, destination: "comercial" });
  });
});

describe("Carla — influenciadoras", () => {
  const cases = [
    "Sou influenciadora e queria uma parceria",
    "Sou criadora de conteúdo e quero divulgar a marca",
    "Vocês fazem collab?",
    "Trabalho com permuta, dá pra conversar?",
  ];

  it.each(cases)("%s vai para parcerias (Carla)", (text) => {
    expect(detectHandoffTarget(text)?.destination).toBe("parcerias");
    expect(decide(text).target?.destination).toBe("parcerias");
  });
});

describe("Leticia — operacional pós-compra preservado", () => {
  const cases = [
    "Quero saber onde está meu pedido",
    "Preciso do código de rastreio",
    "Meu pedido ainda não chegou",
    "Tenho dúvida sobre o pagamento do meu pedido",
  ];

  it.each(cases)("%s continua com a Leticia", (text) => {
    expect(detectHandoffTarget(text)?.destination).toBe("financeiro");
  });
});

describe("falsos positivos comerciais ficam com a Nina", () => {
  const cases = [
    "Quero comprar em quantidade",
    "Tem desconto para profissional?",
    "Posso marcar vocês no Instagram?",
    "Gosto da marca de vocês",
    "Quanto custa o kit?",
  ];

  it.each(cases)("%s não gera encaminhamento comercial/parcerias", (text) => {
    const target = detectHandoffTarget(text);
    expect(target?.destination === "comercial" || target?.destination === "parcerias").toBe(false);
  });
});
