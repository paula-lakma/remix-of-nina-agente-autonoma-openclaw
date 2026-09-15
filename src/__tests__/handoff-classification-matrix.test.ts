import { describe, expect, it } from "vitest";
import {
  detectHandoffTarget,
  detectHandoffTargetFromHistory,
  extractHandoffMarker,
  isConfirmedHandoffResponse,
  isExpedicaoGrantReason,
  isSensitiveDermoReason,
  resolveHandoffDecision,
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
    ["Estou com problema no meu pedido", "order_financial_question"],
    ["Preciso de ajuda com uma compra", "order_financial_question"],
    ["Fizeram uma cobrança duplicada", "duplicate_charge"],
    ["Meu pagamento foi recusado", "payment_declined"],
    ["O pagamento continua pendente", "payment_pending"],
    ["Quero enviar o comprovante do Pix", "payment_receipt"],
    ["Estou com problema no boleto", "boleto_issue"],
    ["Meu cartão não passa", "card_issue"],
    ["Preciso da nota fiscal", "invoice_request"],
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
    "Vou te encaminhar para a nossa dermoconsultora agora.",
    "Vou te passar para a nossa dermoconsultora.",
    "Vou te conectar com a nossa especialista.",
    "Vou chamar a dermoconsultora para você.",
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
    "Quer que eu te encaminhe para a dermoconsultora?",
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
    ["Quero falar com uma dermoconsultora", "dermoconsultora_request"],
    ["Quero falar com uma especialista em estética", "dermoconsultora_request"],
    ["Preciso falar com uma dermo", "dermoconsultora_request"],
    ["Quero atendimento de uma dermoconsultora", "dermoconsultora_request"],
    ["Pode me passar para uma dermo?", "dermoconsultora_request"],
    ["Preciso falar com alguém da equipe de dermoconsultoras", "dermoconsultora_request"],
    ["Quero que uma dermoconsultora me ajude a escolher um protocolo", "dermoconsultora_request"],
    ["Quero falar com uma dermoconsultora pra me ajudar a escolher um protocolo profissional.", "dermoconsultora_request"],
  ] as const)("encaminha pedido explícito de pessoa dermatológica: %s", (text, reason) => {
    expect(detectHandoffTarget(text)).toEqual({ reason, destination: "dermoconsultant" });
  });

  it.each([
    ["Qual produto vocês indicam para acne?", null],
    ["Quero falar com alguém sobre um produto", null],
    ["Qual protocolo profissional você indica?", null],
    ["Quero escolher um protocolo", null],
    ["Me explique o protocolo de acne", null],
    ["Qual protocolo usar para manchas?", null],
    ["Me indique um protocolo", null],
    ["Quero falar com alguém da equipe", null],
    ["Quero um atendente humano", null],
    ["Quero falar com uma especialista", null],
    ["Preciso falar com alguém sobre pagamento", "payment_unidentified"],
    ["Quero falar com alguém sobre entrega", "order_financial_question"],
  ] as const)("fronteira de intenção humana: %s", (text, reason) => {
    if (!reason) {
      expect(detectHandoffTarget(text)).toBeNull();
    } else {
      expect(detectHandoffTarget(text)).toEqual({ reason, destination: "financeiro" });
    }
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
    expect(resolveHandoffReason("dermoconsultora_request")).toEqual({
      reason: "dermoconsultora_request",
      destination: "dermoconsultant",
    });
    expect(isExpedicaoGrantReason("sensitive_case")).toBe(false);
    expect(isExpedicaoGrantReason("dermoconsultora_request")).toBe(false);
  });

  it("dermoconsultora_request não é motivo sensível (sem prioridade da Laura)", () => {
    expect(detectHandoffTarget("Quero falar com uma dermoconsultora")?.reason).toBe("dermoconsultora_request");
    expect(detectHandoffTarget("Quero falar com uma dermoconsultora")?.reason).not.toBe("sensitive_case");
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
describe("logística pós-compra tem precedência", () => {
  const logistica: Array<[string, string]> = [
    ["Foi enviado hoje?", "shipped_no_info"],
    ["É que paguei pelo frete que chegaria em quatro dias", "order_financial_question"],
    ["Como faço pra acompanhar meus pedidos", "where_is_my_order"],
    ["quantos dias ainda", "order_financial_question"],
    ["Qual o prazo de entrega?", "order_financial_question"],
    ["Quando chega?", "where_is_my_order"],
    ["Já postaram meu pedido?", "shipped_no_info"],
    ["Meu pedido ainda não chegou", "where_is_my_order"],
    ["Qual seria a transportadora?", "carrier_question"],
  ];

  it.each(logistica)("classifica %s como %s para Letícia", (text, reason) => {
    expect(detectHandoffTarget(text)).toEqual({ reason, destination: "financeiro" });
    expect(isExpedicaoGrantReason(reason)).toBe(true);
  });

  it("prevalece sobre menção dermatológica na mesma mensagem", () => {
    expect(detectHandoffTarget("Tive alergia ao produto e meu pedido ainda não chegou")?.destination).toBe("financeiro");
  });

  it("mantém dermoconsultora quando não há assunto logístico", () => {
    expect(detectHandoffTarget("Tive alergia e inchaço com o produto")?.destination).toBe("dermoconsultant");
  });
});

describe("pedido explícito de dermoconsultora é determinístico (caso real João Felipe)", () => {
  const clienteReal = "Quero falar com uma dermoconsultora para me ajudar a escolher um protocolo profissional.";

  it("aplica handoff mesmo sem marcador e sem frase de confirmação do modelo", () => {
    const decision = resolveHandoffDecision({
      agentContent: "Joao, entendi o que você precisa.",
      currentUserText: clienteReal,
      history: [],
    });
    expect(decision.target).toEqual({
      reason: "dermoconsultora_request",
      destination: "dermoconsultant",
    });
  });

  it("aplica handoff com a resposta real das 11:34 (encaminhamento já foi feito)", () => {
    const decision = resolveHandoffDecision({
      agentContent:
        "Joao, o encaminhamento para a dermoconsultora já foi feito. Ela vai entrar em contato para te ajudar a escolher o protocolo profissional ideal para a sua necessidade.",
      currentUserText: clienteReal,
      history: [],
    });
    expect(decision.target?.destination).toBe("dermoconsultant");
  });

  it("aplica handoff com a resposta real das 11:35 (vou te encaminhar)", () => {
    const decision = resolveHandoffDecision({
      agentContent: "Claro, Joao! Vou te encaminhar para a nossa dermoconsultora agora.",
      currentUserText: clienteReal,
      history: [],
    });
    expect(decision.target?.destination).toBe("dermoconsultant");
  });

  it("não aplica handoff para dúvida de protocolo sem pedir uma pessoa", () => {
    const decision = resolveHandoffDecision({
      agentContent: "Posso te ajudar a escolher o protocolo.",
      currentUserText: "Qual protocolo devo usar para manchas?",
      history: [],
    });
    expect(decision.target).toBeNull();
  });

  it("não aplica handoff para pedido humano genérico", () => {
    const decision = resolveHandoffDecision({
      agentContent: "Claro!",
      currentUserText: "Quero falar com alguém da equipe",
      history: [],
    });
    expect(decision.target).toBeNull();
  });
});

describe("reação adversa descrita em linguagem natural (prioridade da Laura)", () => {
  const sensiveis = [
    "Estou usando um ácido e minha pele ficou muito vermelha e ardendo. Posso continuar usando?",
    "Meu rosto está queimando depois do peeling",
    "Minha pele está coçando e descamando depois que usei o produto",
    "Passei o ácido e minha pele ficou muito irritada",
  ];

  it.each(sensiveis)("classifica como reaction sensível: %s", (text) => {
    const target = detectHandoffTarget(text);
    expect(target).toEqual({ reason: "reaction", destination: "dermoconsultant" });
    expect(isSensitiveDermoReason(target?.reason)).toBe(true);
  });

  it.each([
    "Quais ácidos vocês têm?",
    "Ácido pode deixar a pele vermelha?",
    "Quero saber como usar o peeling",
    "Qual ácido vocês indicam?",
    "Ácido hialurônico serve para quê?",
  ])("não classifica frase informativa/comercial: %s", (text) => {
    expect(detectHandoffTarget(text)).toBeNull();
  });

  it("logística mantém precedência sobre a reação descrita", () => {
    expect(
      detectHandoffTarget("Minha pele ficou vermelha e ardendo e meu pedido ainda não chegou")?.destination,
    ).toBe("financeiro");
  });

  it("caso clínico sensível é determinístico, sem depender da frase da Nina", () => {
    const decision = resolveHandoffDecision({
      agentContent: "Joao, entendi o que você está sentindo.",
      currentUserText: sensiveis[0],
      history: [],
    });
    expect(decision.target).toEqual({ reason: "reaction", destination: "dermoconsultant" });
  });

  it("aplica handoff com a frase real do teste (com 'agora' no meio)", () => {
    const decision = resolveHandoffDecision({
      agentContent:
        "Joao, isso é um sinal importante que não deve ser ignorado. Vou te encaminhar agora para a nossa dermoconsultora para que ela te oriente com segurança.",
      currentUserText: sensiveis[0],
      history: [],
    });
    expect(decision.target?.reason).toBe("reaction");
  });

  it("dermoconsultora_request continua não sensível", () => {
    expect(isSensitiveDermoReason("dermoconsultora_request")).toBe(false);
    expect(isSensitiveDermoReason("where_is_my_order")).toBe(false);
  });
});

describe("pós-compra: pedido do cliente vai para Leticia/financeiro", () => {
  const encaminham = [
    "Gostaria de saber sobre o meu pedido",
    "Gostaria de saber sobre os meus produtos, porque ainda não chegaram",
    "Gostaria de saber sobre os meus produtos, por que ainda não chegaram",
    "meus produtos ainda não chegaram",
    "meu pedido não chegou",
    "ainda não recebi meu pedido",
    "estou esperando meu pedido",
    "quando meus produtos chegam?",
    "cadê meu pedido?",
    "meu pedido está demorando",
    "não recebi a compra",
    "Quero saber do meu pedido",
    "Tenho uma dúvida sobre meu pedido",
    "Preciso de informações sobre meu pedido",
    "Quando meu pedido chega?",
    "Estou esperando meus produtos",
    "Não recebi minha compra",
    "Quero saber do rastreio",
    "Qual o prazo do meu pedido?",
  ];

  const naoEncaminham = [
    "quero fazer um pedido",
    "como faço para comprar?",
    "como faço um pedido?",
    "quais produtos vocês têm?",
    "quanto custa esse produto?",
    "quero comprar um kit",
    "quero comprar produtos",
  ];

  it.each(encaminham)("encaminha para financeiro: %s", (text) => {
    expect(detectHandoffTarget(text)?.destination).toBe("financeiro");
  });

  it.each(naoEncaminham)("não encaminha intenção comercial: %s", (text) => {
    expect(detectHandoffTarget(text)).toBeNull();
  });

  it("handoff pós-compra é determinístico mesmo sem frase de confirmação", () => {
    const decision = resolveHandoffDecision({
      agentContent: "Certo, Brena!",
      currentUserText: "Gostaria de saber sobre os meus produtos, por que ainda não chegaram",
      history: [],
    });
    expect(decision.target?.destination).toBe("financeiro");
  });
});
