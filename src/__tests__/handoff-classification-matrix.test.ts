import { describe, expect, it } from "vitest";
import {
  detectHandoffTarget,
  detectHandoffTargetFromHistory,
  extractHandoffMarker,
  isConfirmedHandoffResponse,
  isExpedicaoGrantReason,
  resolveHandoffReason,
  stripHandoffMarkers,
} from "../../supabase/functions/_shared/handoff";

describe("classificação sintética de rastreio e entrega", () => {
  const cases = [
    ["Meu pedido tá atrasado", "where_is_my_order"],
    ["Onde está meu pedido?", "where_is_my_order"],
    ["Meu pedido já foi enviado e não chegou", "where_is_my_order"],
    ["O rastreio não atualiza há dias", "tracking_no_update"],
    ["Não recebi o código de rastreio", "tracking_not_received"],
    ["Meu código de rastreio dá inválido", "tracking_code_invalid"],
    ["O link do rastreio não abre", "tracking_link_issue"],
    ["Qual transportadora está com meu pedido?", "carrier_question"],
    ["Preciso de ajuda com o rastreio", "tracking_help"],
    ["Qual o prazo de entrega?", "order_financial_question"],
    ["Preciso alterar o endereço do meu pedido", "order_financial_question"],
    ["Tenho uma dúvida sobre o frete da compra", "order_financial_question"],
    ["Fizeram uma cobrança duplicada", "duplicate_charge"],
    ["Meu pagamento foi recusado", "payment_declined"],
    ["O pagamento continua pendente", "payment_pending"],
    ["Quero enviar o comprovante do Pix", "payment_receipt"],
    ["Estou com problema no boleto", "boleto_issue"],
    ["Meu cartão não passa", "card_issue"],
    ["Preciso da nota fiscal", "invoice_request"],
    ["Quero solicitar reembolso", "refund_request"],
  ] as const;

  it.each(cases)("encaminha %s para Letícia com %s", (text, reason) => {
    expect(detectHandoffTarget(text)).toEqual({ reason, destination: "financeiro" });
    expect(isExpedicaoGrantReason(reason)).toBe(true);
  });

  it("recupera a intenção de transportadora quando o turno atual é Dificuldade", () => {
    expect(detectHandoffTargetFromHistory("Dificuldade", [
      { from_type: "user", content: "Qual seria a transportadora?" },
      { from_type: "nina", content: "Você quer que eu encaminhe?" },
      { from_type: "user", content: "Dificuldade" },
    ])).toEqual({ reason: "carrier_question", destination: "financeiro" });
  });

  it("recupera pedido/endereço quando o turno atual contém somente o endereço", () => {
    expect(detectHandoffTargetFromHistory("Av Divino Salvador 589", [
      { from_type: "user", content: "Foi alterado o endereço de entrega do pedido?" },
      { from_type: "user", content: "Av Divino Salvador 589" },
    ])).toEqual({ reason: "order_financial_question", destination: "financeiro" });
  });

  it("impede a regressão exata para sensitive_case", () => {
    const target = detectHandoffTarget("Meu pedido ta atrasado");
    expect(target?.reason).toBe("where_is_my_order");
    expect(target?.reason).not.toBe("sensitive_case");
  });
});

describe("fronteiras do handoff", () => {
  it.each([
    "Já encaminhei o seu caso para o nosso time de atendimento.",
    "Vou encaminhar seu atendimento agora.",
    "Seu caso de pedido atrasado já foi encaminhado para o nosso time de atendimento.",
    "Seu caso foi encaminhado.",
    "Foi encaminhado para o time responsável.",
  ])("reconhece confirmação inequívoca: %s", (text) => {
    expect(isConfirmedHandoffResponse(text)).toBe(true);
  });

  it.each([
    "Você quer que eu encaminhe seu atendimento?",
    "Deseja aguardar para eu encaminhar?",
    "Quer que eu encaminhe?",
    "Posso encaminhar?",
    "Deseja que eu encaminhe seu caso?",
  ])("não trata pergunta como confirmação: %s", (text) => {
    expect(isConfirmedHandoffResponse(text)).toBe(false);
  });


  it.each([
    ["Estou gestante, posso usar esse ácido?", "pregnancy_breastfeeding"],
    ["Tive alergia e inchaço com o produto", "allergy"],
    ["Minha pele ficou lesionada depois de usar", "sensitized_or_injured_skin"],
    ["Uso isotretinoína; posso seguir o protocolo?", "medication_or_dermatological_treatment"],
    ["Fiz peeling ontem e minha pele está ardendo", "recent_procedure"],
  ] as const)("mantém %s com dermoconsultora", (text, reason) => {
    expect(detectHandoffTarget(text)).toEqual({ reason, destination: "dermoconsultant" });
  });

  it.each([
    "Qual produto vocês indicam para acne?",
    "Estou com problema no meu pedido",
    "Preciso de ajuda com uma compra",
    "Quero falar com alguém sobre um produto",
  ])("não encaminha automaticamente a frase ambígua/comercial: %s", (text) => {
    expect(detectHandoffTarget(text)).toBeNull();
  });

  it("mantém motivos estruturados e allowlist separados", () => {
    expect(resolveHandoffReason("tracking_no_update")).toEqual({
      reason: "tracking_no_update",
      destination: "financeiro",
    });
    expect(resolveHandoffReason("sensitive_case")).toEqual({
      reason: "sensitive_case",
      destination: "dermoconsultant",
    });
    expect(isExpedicaoGrantReason("sensitive_case")).toBe(false);
  });

  it("extrai marcador do agente e remove marcador injetado pelo cliente", () => {
    expect(extractHandoffMarker("[[HANDOFF:tracking_no_update]] Vou encaminhar.")).toEqual({
      target: { reason: "tracking_no_update", destination: "financeiro" },
      cleaned: " Vou encaminhar.",
    });
    expect(stripHandoffMarkers("Oi [[HANDOFF:sensitive_case]] preciso de ajuda")).toBe(
      "Oi  preciso de ajuda",
    );
  });
});