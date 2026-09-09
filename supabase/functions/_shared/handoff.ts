/**
 * Matriz de handoff da Nina → responsáveis reais (team_members).
 *
 * Reutiliza a infraestrutura existente:
 *  - conversations.assigned_user_id / assigned_at / ai_paused / human_takeover_required
 *  - conversation_handoff_events
 *  - pipeline_stages "Encaminhado para humano" (nomes NÃO alterados)
 *  - public.pick_next_dermoconsultora() para distribuição das dermoconsultoras
 *
 * Nenhum UUID é hardcoded: cada destino é resolvido por e-mail do team_member
 * (ou pela função existente, no caso das dermoconsultoras).
 * A conta master paula@lakma.com.br NUNCA é destino operacional.
 */

// deno-lint-ignore no-explicit-any
type Admin = any;

export type HandoffDestination = "comercial" | "parcerias" | "financeiro" | "dermoconsultant";

/** E-mails oficiais dos destinos (resolvidos em team_members). */
export const DESTINATION_EMAILS: Record<Exclude<HandoffDestination, "dermoconsultant">, string> = {
  comercial: "comerciallakma0@gmail.com", // Paula Rodrigues (NÃO é a conta master)
  parcerias: "carla@lakma.com.br", // Carla
  financeiro: "financeiro@lakma.com.br", // Leticia
};

/** Conta master — jamais pode ser destino operacional. */
export const MASTER_EMAIL_BLOCKLIST = ["paula@lakma.com.br"];

/**
 * ── MOTIVOS ESTRUTURADOS (fonte da verdade do roteamento) ───────────────────
 * O destino é resolvido pelo `handoff_reason` interno, NUNCA pelo texto que a
 * Nina escreve ao cliente. A mensagem pode mudar livremente sem afetar o roteio.
 */
export const REASON_DESTINATIONS = {
  // Paula Rodrigues (comercial / SAC / logística)
  stock: "comercial",
  exchange: "comercial",
  return: "comercial",
  damaged_product: "comercial",
  missing_item: "comercial",
  complaint_sac: "comercial",
  resale: "comercial",
  wholesale: "comercial",
  supplier: "comercial",
  product_missing_price: "comercial",
  site_error: "comercial",
  cart_error: "comercial",
  checkout_error: "comercial",
  distribution_handoff: "comercial",

  // Carla (cupom / parcerias)
  coupon_issue: "parcerias",
  partnership: "parcerias",
  influencer: "parcerias",
  collab: "parcerias",

  // Leticia (financeiro)
  payment: "financeiro",
  invoice: "financeiro",

  // ── Motivos canônicos NOVOS (Fase A) — financeiro detalhado ──────────────
  // Somente estes (ver EXPEDICAO_GRANT_REASONS) podem gerar concessão de
  // acesso da expedição ao Chat ao Vivo. `payment`/`invoice` legados NÃO.
  payment_unidentified: "financeiro",
  payment_pending: "financeiro",
  payment_declined: "financeiro",
  charge_issue: "financeiro",
  duplicate_charge: "financeiro",
  boleto_issue: "financeiro",
  pix_issue: "financeiro",
  card_issue: "financeiro",
  payment_receipt: "financeiro",
  invoice_request: "financeiro",
  refund_request: "financeiro",
  order_financial_question: "financeiro",

  // ── Motivos canônicos NOVOS (Fase A) — rastreio / expedição ──────────────
  tracking_not_received: "financeiro",
  tracking_code_invalid: "financeiro",
  tracking_no_update: "financeiro",
  tracking_help: "financeiro",
  carrier_question: "financeiro",
  shipped_no_info: "financeiro",
  where_is_my_order: "financeiro",
  tracking_link_issue: "financeiro",

  // Dermoconsultora (técnico / sensível)
  technical_question: "dermoconsultant",
  sensitive_case: "dermoconsultant",
  contraindication: "dermoconsultant",
  reaction: "dermoconsultant",
  allergy: "dermoconsultant",
  pregnancy_breastfeeding: "dermoconsultant",
  sensitized_or_injured_skin: "dermoconsultant",
  medication_or_dermatological_treatment: "dermoconsultant",
  recent_procedure: "dermoconsultant",
  protocol_adaptation: "dermoconsultant",
  protocol_product_substitution: "dermoconsultant",
  missing_technical_information: "dermoconsultant",
  product_link_not_found_after_search: "dermoconsultant",

  // Pedido explícito de atendimento humano por dermoconsultora (não é caso sensível)
  dermoconsultora_request: "dermoconsultant",
} as const satisfies Record<string, HandoffDestination>;

export type HandoffReason = keyof typeof REASON_DESTINATIONS;

/**
 * Regras operacionais anexadas ao prompt em todos os caminhos de resposta.
 * Mantidas junto da matriz canônica para o agente e o fallback não divergirem.
 */
export const TRACKING_HANDOFF_PROMPT = `
<tracking_handoff>
Qualquer assunto claramente relacionado a financeiro, pedido, expedição, entrega, frete, prazo, envio, postagem, despacho, transportadora, rastreio ou logística pós-compra deve ser encaminhado imediatamente para a expedição, sem perguntar novamente se o cliente deseja o encaminhamento. Use exatamente um motivo estruturado aprovado:
- pedido atrasado, não chegou, não recebido, "onde está meu pedido" ou "como acompanho meu pedido" -> where_is_my_order
- rastreio parado ou sem atualização -> tracking_no_update
- código de rastreio não recebido -> tracking_not_received
- código de rastreio inválido -> tracking_code_invalid
- link de rastreio com erro -> tracking_link_issue
- pedido enviado/postado/despachado ou dúvida sobre postagem e despacho -> shipped_no_info
- dúvida sobre transportadora, Correios, Jadlog ou Sedex -> carrier_question
- dúvida genérica de rastreio -> tracking_help
- prazo de entrega, "quando chega", "quantos dias", frete, endereço, alteração ou questão administrativa/pós-compra -> order_financial_question
- pagamento, cobrança, Pix, cartão, boleto, nota fiscal ou reembolso -> use o motivo financeiro específico correspondente

Ao confirmar o encaminhamento, inclua no retorno interno [[HANDOFF:<motivo>]]. O marcador não é texto para o cliente.
Não classifique esses casos como sensitive_case e não os encaminhe para dermoconsultora.

Se a necessidade atual do cliente for logística (entrega, frete, prazo, envio, postagem, despacho, transportadora, rastreio, localização do pedido ou pedido não recebido), o encaminhamento é para a expedição mesmo que a conversa tenha histórico dermatológico ou a mesma mensagem cite um problema de pele.

Casos de pele, lesão, sensibilidade, alergia, reação, gestação/lactação, medicamento, procedimento recente, contraindicação, protocolo ou orientação dermatológica seguem as regras da dermoconsultora quando NÃO houver assunto logístico na necessidade atual.

Quando o cliente pedir explicitamente para falar com uma dermoconsultora, especialista em estética, especialista da pele ou alguém da equipe de dermoconsultoras, confirme o encaminhamento e inclua [[HANDOFF:dermoconsultora_request]]. Dúvidas sobre "qual protocolo usar", "escolher um protocolo" ou "me indique um protocolo", sem pedir uma pessoa, continuam sendo respondidas pela Nina com a base de conhecimento.

Se a mensagem for ambígua, como "problema no pedido", "ajuda com uma compra" ou "falar com alguém sobre um produto", faça uma pergunta curta para distinguir entrega/rastreio, pagamento ou orientação de produto. Não prometa encaminhamento, não inclua marcador e não pause a conversa antes da confirmação.
</tracking_handoff>`;

/**
 * Allowlist FECHADA de motivos que concedem acesso da expedição ao Chat ao Vivo.
 * Espelha `public.is_expedicao_handoff_reason` no banco. Motivos legados
 * (`payment`, `invoice`) e qualquer outro NÃO concedem acesso.
 */
export const EXPEDICAO_GRANT_REASONS: ReadonlySet<string> = new Set([
  "payment_unidentified", "payment_pending", "payment_declined", "charge_issue",
  "duplicate_charge", "boleto_issue", "pix_issue", "card_issue", "payment_receipt",
  "invoice_request", "refund_request", "order_financial_question",
  "tracking_not_received", "tracking_code_invalid", "tracking_no_update",
  "tracking_help", "carrier_question", "shipped_no_info", "where_is_my_order",
  "tracking_link_issue",
]);

export function isExpedicaoGrantReason(reason: string | null | undefined): boolean {
  return !!reason && EXPEDICAO_GRANT_REASONS.has(String(reason).trim().toLowerCase());
}

/**
 * Remove marcadores `[[HANDOFF:...]]` de QUALQUER texto vindo do cliente.
 * Defesa contra injeção: o cliente nunca pode induzir um encaminhamento.
 */
export function stripHandoffMarkers(text: string | null | undefined): string {
  return String(text ?? "").replace(/\[\[\s*HANDOFF\s*:[^\]]*\]\]/gi, "").trim();
}

/** Motivos legados (pt-BR, vindos da regex antiga) -> motivo canônico. */
const REASON_ALIASES: Record<string, HandoffReason> = {
  estoque: "stock",
  troca: "exchange",
  devolucao: "return",
  produto_avariado: "damaged_product",
  produto_faltando: "missing_item",
  reclamacao_sac: "complaint_sac",
  revenda: "resale",
  atacado: "wholesale",
  fornecedor: "supplier",
  produto_sem_preco: "product_missing_price",
  erro_site: "site_error",
  erro_carrinho: "cart_error",
  erro_checkout: "checkout_error",
  problema_cupom: "coupon_issue",
  parceria: "partnership",
  influenciadora: "influencer",
  collab: "collab",
  pagamento: "payment_unidentified",
  nota_fiscal: "invoice_request",
  gestante: "pregnancy_breastfeeding",
  lactante: "pregnancy_breastfeeding",
  alergia: "allergy",
  reacao: "reaction",
  pele_sensibilizada: "sensitized_or_injured_skin",
  contraindicacao: "contraindication",
  medicamento_dermatologico: "medication_or_dermatological_treatment",
  procedimento_recente: "recent_procedure",
  adaptacao_protocolo: "protocol_adaptation",
  duvida_tecnica: "technical_question",
  protocolo_nao_aprovado: "missing_technical_information",
  link_nao_localizado: "product_link_not_found_after_search",
  dermoconsultora: "dermoconsultora_request",
};

/** Normaliza qualquer motivo (canônico ou legado) -> { reason, destination }. */
export function resolveHandoffReason(
  raw: string | null | undefined,
): { reason: HandoffReason; destination: HandoffDestination } | null {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase().replace(/[\s-]+/g, "_");
  // Os dois nomes legados agora convergem para motivos aceitos pela trava
  // atômica da expedição. Isso evita um destino "financeiro" sem acesso da Leticia.
  const normalizedKey = key === "payment" ? "payment_unidentified" : key === "invoice" ? "invoice_request" : key;
  const canonical = (normalizedKey in REASON_DESTINATIONS ? normalizedKey : REASON_ALIASES[normalizedKey]) as HandoffReason | undefined;
  if (!canonical) return null;
  return { reason: canonical, destination: REASON_DESTINATIONS[canonical] };
}

/**
 * Extrai o marcador estruturado `[[HANDOFF:<reason>]]` do texto do agente.
 * Retorna o motivo resolvido e o texto SEM o marcador (para envio ao cliente).
 */
export function extractHandoffMarker(text: string): {
  target: { reason: HandoffReason; destination: HandoffDestination } | null;
  cleaned: string;
} {
  const RE = /\[\[HANDOFF:\s*([a-z0-9_\-\s]+?)\s*\]\]/gi;
  let found: string | null = null;
  const cleaned = text.replace(RE, (_m, r) => {
    if (!found) found = String(r);
    return "";
  });
  return { target: resolveHandoffReason(found), cleaned };
}


/**
 * ⚠️ LEGADO — fallback de último recurso.
 * Regex sobre texto natural. NÃO é mais o mecanismo principal de roteamento:
 * só é consultada quando nenhum `handoff_reason` estruturado foi informado.
 */
const SENSITIVE_REASON_MATRIX: Array<{ reason: string; destination: HandoffDestination; rx: RegExp }> = [
  { reason: "gestante", destination: "dermoconsultant", rx: /gestante|gr[áa]vida|gesta(?:ç|c)[ãa]o/i },
  { reason: "lactante", destination: "dermoconsultant", rx: /lactante|amament/i },
  { reason: "alergia", destination: "dermoconsultant", rx: /alergi/i },
  { reason: "pele_sensibilizada", destination: "dermoconsultant", rx: /sensibiliz|pele sens[íi]vel|lesionad/i },
  { reason: "contraindicacao", destination: "dermoconsultant", rx: /contraindic|contra-indic/i },
  { reason: "medicamento_dermatologico", destination: "dermoconsultant", rx: /medicament|roacutan|isotretino[íi]na|tratamento dermatol[óo]gico|dermatologista/i },
  { reason: "procedimento_recente", destination: "dermoconsultant", rx: /procedimento recente|f(?:ez|iz) (peeling|laser|microagulhamento)|p[óo]s[- ]procedimento/i },
  // Avaliada depois dos motivos clínicos mais específicos para não roubar
  // classificações como procedimento recente.
  {
    reason: "reacao",
    destination: "dermoconsultant",
    // Vocabulário técnico + descrição natural de reação adversa em curso.
    // A parte natural exige sintoma em ESTADO atual/recente E contexto de pele/
    // região do corpo ou de uso/aplicação de produto/procedimento. Palavras
    // isoladas (ácido, peeling, vermelha, ardendo, coçando, descamando) não bastam.
    rx: (() => {
      // Contexto obrigatório: parte do corpo OU uso/aplicação de produto/procedimento.
      const ctx =
        "\\b(?:pele|rosto|face|pesco[çc]o|colo|m[ãa]os?|bra[çc]os?|pernas?|corpo|regi[ãa]o|usei|usando|apliquei|aplicando|passei|passando|ap[óo]s|depois)\\b";
      // Sintoma em estado atual/recente (nunca a palavra solta).
      const core =
        "\\b(?:ficou|ficaram|fiquei|est[áa]|estou|t[áa]|continua|continuo|segue|amanheceu|amanheci|acordei)\\s+" +
        "(?:muito\\s+|bem\\s+|toda\\s+|todo\\s+|super\\s+|meio\\s+|bastante\\s+|um\\s+pouco\\s+)*" +
        "(?:vermelh[ao]s?|ardendo|ard[êe]ncia|queimando|queimou|irritad[ao]s?|irrita[çc][ãa]o|co[çc]ando|coceira|descamando|descama[çc][ãa]o|inchad[ao]s?|inchou|bolhas?|ferid[ao]s?|sensibilizad[ao]s?)\\b";
      return new RegExp(
        "rea[çc][ãa]o|reagiu|ard[êe]ncia forte|incha[çc]o" +
          `|${ctx}[\\s\\S]{0,60}${core}` +
          `|${core}[\\s\\S]{0,60}${ctx}`,
        "i",
      );
    })(),
  },
  { reason: "adaptacao_protocolo", destination: "dermoconsultant", rx: /adapta[çc][ãa]o.{0,15}protocolo|trocar.{0,10}produto.{0,10}protocolo/i },
  { reason: "duvida_tecnica", destination: "dermoconsultant", rx: /d[úu]vida t[ée]cnica|avalia[çc][ãa]o (t[ée]cnica|humana)|orienta[çc][ãa]o dermatol[óo]gica/i },
  { reason: "protocolo_nao_aprovado", destination: "dermoconsultant", rx: /protocolo n[ãa]o aprovado|protocolo n[ãa]o cadastr/i },
  { reason: "link_nao_localizado", destination: "dermoconsultant", rx: /link n[ãa]o (encontrad|localizad)|n[ãa]o (consegui|localizei) (o )?link|n[ãa]o encontrei o link/i },
  // Pedido explícito de falar com uma dermoconsultora/pessoa dermatológica.
  // Exige intenção de contato humano + alvo dermatológico/estético próximo no texto.
  // Termos genéricos como "alguém da equipe", "atendente humano" ou "especialista"
  // isolados NÃO disparam este motivo.
  {
    reason: "dermoconsultora_request",
    destination: "dermoconsultant",
    rx: /(?=[\s\S]{0,120}(?:\bdermoconsultora\b|\bdermo\s+consultora\b|\bdermo\b|\bespecialista\s+em\s+est[ée]tica\b|\bespecialista\s+da\s+pele\b|\bespecialista\s+em\s+protocolo\b|\balgu[ée]m\s+da\s+equipe\s+de\s+dermoconsultoras\b))(?=[\s\S]{0,120}(?:\b(?:quero|preciso|gostaria|poderia|desejo|quer|pode)\b[\s\S]{0,40})?\b(?:falar|conversar|atendimento|atender|passar|passa|transferir|transfere|chamar|ajudar|ajude|ajudaria|me\s+ajude|me\s+ajudaria)\b)/i,
  },
];

/**
 * ── LOGÍSTICA PÓS-COMPRA (Leticia) — PRECEDÊNCIA MÁXIMA ─────────────────────
 * Avaliada ANTES da matriz dermatológica: entrega, frete, prazo, envio,
 * postagem, despacho, transportadora, rastreio, localização do pedido ou
 * pedido não recebido pertencem à expedição, mesmo com histórico dermatológico.
 */
const LOGISTICS_REASON_MATRIX: Array<{ reason: string; destination: HandoffDestination; rx: RegExp }> = [
  { reason: "tracking_no_update", destination: "financeiro", rx: /rastre(?:io|amento).{0,35}(n[ãa]o atualiza|sem atualiza[çc][ãa]o|parad[oa]|n[ãa]o muda)/i },
  { reason: "tracking_not_received", destination: "financeiro", rx: /(n[ãa]o recebi|sem).{0,25}c[óo]digo.{0,15}(de )?rastreio|c[óo]digo.{0,15}(de )?rastreio.{0,25}n[ãa]o (chegou|recebi)/i },
  { reason: "tracking_code_invalid", destination: "financeiro", rx: /c[óo]digo.{0,15}(de )?rastreio.{0,30}(inv[áa]lid|n[ãa]o funciona|erro)/i },
  { reason: "tracking_link_issue", destination: "financeiro", rx: /link.{0,20}(de )?rastreio.{0,30}(n[ãa]o abre|n[ãa]o funciona|erro)|rastreio.{0,20}link.{0,20}(inv[áa]lid|quebrad|erro)/i },
  { reason: "carrier_question", destination: "financeiro", rx: /transportadora|correios|jadlog|\bsedex\b/i },
  { reason: "where_is_my_order", destination: "financeiro", rx: /onde (est[áa]|t[áa]).{0,20}(meu |minha )?(pedido|encomenda)|(pedido|entrega|encomenda).{0,35}(atrasad|n[ãa]o chegou|n[ãa]o foi entregue|n[ãa]o recebi)|atraso.{0,20}(pedido|entrega)|ainda n[ãa]o (chegou|chegaram|recebi|recebemos)|n[ãa]o (chegou|chegaram) at[ée] agora|n[ãa]o recebi.{0,20}(meu |minha )?(pedido|encomenda|compra)|acompanhar.{0,20}(meu|meus|minha|minhas)?\s*(pedido|pedidos|encomenda|entrega)|(cad[êe]|onde (est[áa]|t[áa]|anda|andam))\s+(o |a |os |as )?(meu|minha|meus|minhas)?\s*(pedido|pedidos|encomenda|compra|produto|produtos|itens|mercadoria)|(pedido|pedidos|produto|produtos|encomenda|compra|itens|mercadoria)[^.?!]{0,45}(ainda n[ãa]o|n[ãa]o)\s*(chegou|chegaram|foi entregue|foram entregues|recebi)|(estou|est[ou]|t[ôo])\s+esperando[^.?!]{0,30}(pedido|produto|produtos|encomenda|compra|entrega|chegar)|(pedido|pedidos|entrega|produto|produtos|encomenda|compra)[^.?!]{0,35}(demorando|atrasando|atrasad)|quando[^.?!]{0,30}(chega|chegam|chegar[áa]|chegar[ãa]o|vou receber|recebo)/i },
  { reason: "shipped_no_info", destination: "financeiro", rx: /(pedido|compra).{0,25}(enviad|despachad).{0,35}(sem informa[çc][ãa]o|sem rastreio|n[ãa]o recebi)|n[ãa]o recebi.{0,25}(informa[çc][ãa]o|rastreio).{0,25}(pedido|compra)|\b(?:foi|foram|j[áa])\s+(?:foi\s+)?(?:enviad|postad|despachad|expedid)|\b(?:postou|postaram|enviaram|despacharam|expediram)\b|saiu p(?:ara|ra) entrega|\bpostagem\b|\bdespacho\b/i },
  { reason: "tracking_help", destination: "financeiro", rx: /\brastre(?:io|ar|ando|amento)\b/i },
  { reason: "order_financial_question", destination: "financeiro", rx: /(?:prazo|previs[ãa]o).{0,25}(?:entrega|pedido|chegar|chegada)|\bprazo de entrega\b|\bfrete\b|(?:endere[çc]o).{0,35}(?:pedido|entrega|compra)|(?:alterar|altera[çc][ãa]o|confirmar).{0,35}(?:endere[çc]o|pedido|entrega)|quando (?:chega|vai chegar|chegar[áa]|sai|ser[áa] entregue)|quanto tempo.{0,25}(?:demora|chega|entrega|chegar)|chegar(?:ia|[áa])?\s+em\s+\S+\s+dias?|quantos dias|(?:problema|d[úu]vida|ajuda).{0,30}(?:pedido|compra|entrega)|(?:pedido|compra).{0,35}(?:problema|d[úu]vida|ajuda|endere[çc]o|frete|administrativ|p[óo]s[- ]compra|informa[çc][ãa]o|confirma[çc][ãa]o)|(?:sobre|do|da|de|no|na|com)\s+(?:o\s+|a\s+|os\s+|as\s+)?(?:meu|minha|meus|minhas)\s+(?:pedido|pedidos|compra|compras|encomenda|produto|produtos|itens)|(?:meu|minha|meus|minhas)\s+(?:pedido|pedidos|compra|encomenda)\b|\b(?:entrega|entregue|expedi[çc][ãa]o|log[íi]stica)\b/i },
];

const REASON_MATRIX: Array<{ reason: string; destination: HandoffDestination; rx: RegExp }> = [
  // ── Leticia (rastreio / expedição / logística) ───────────────────────────
  ...LOGISTICS_REASON_MATRIX,


  // ── Leticia (financeiro detalhado) ───────────────────────────────────────
  { reason: "duplicate_charge", destination: "financeiro", rx: /cobran[çc]a.{0,20}(duplicad|duas vezes)|cobrou.{0,15}duas vezes/i },
  { reason: "payment_declined", destination: "financeiro", rx: /pagamento.{0,25}(recusad|negad|n[ãa]o aprov)|cart[ãa]o.{0,25}(recusad|negad)/i },
  { reason: "payment_pending", destination: "financeiro", rx: /pagamento.{0,25}(pendent|processando|aguardando)|pedido.{0,25}aguardando pagamento/i },
  { reason: "payment_receipt", destination: "financeiro", rx: /comprovante.{0,20}(pagamento|pix)|enviar comprovante/i },
  { reason: "boleto_issue", destination: "financeiro", rx: /boleto/i },
  { reason: "pix_issue", destination: "financeiro", rx: /\bpix\b/i },
  { reason: "card_issue", destination: "financeiro", rx: /cart[ãa]o.{0,30}(erro|problema|n[ãa]o passa|falh)/i },
  { reason: "invoice_request", destination: "financeiro", rx: /nota fiscal|\bnfe?\b|danfe/i },
  { reason: "refund_request", destination: "financeiro", rx: /reembolso|estorno/i },
  { reason: "charge_issue", destination: "financeiro", rx: /cobran[çc]a|valor cobrado/i },
  { reason: "payment_unidentified", destination: "financeiro", rx: /pagamento|pagar/i },

  // ── Paula Rodrigues (comercial / SAC / logística) ────────────────────────
  { reason: "estoque", destination: "comercial", rx: /\bestoque\b|sem estoque|indispon[íi]vel/i },
  { reason: "troca", destination: "comercial", rx: /\btroca(r)?\b/i },
  { reason: "devolucao", destination: "comercial", rx: /devolu[çc][ãa]o|devolver/i },
  { reason: "produto_avariado", destination: "comercial", rx: /avariad|danificad|quebrad|vazand/i },
  { reason: "produto_faltando", destination: "comercial", rx: /faltando|veio incompleto|n[ãa]o veio/i },
  { reason: "reclamacao_sac", destination: "comercial", rx: /reclama[çc][ãa]o|\bsac\b|procon/i },
  { reason: "revenda", destination: "comercial", rx: /revend/i },
  { reason: "atacado", destination: "comercial", rx: /atacado/i },
  { reason: "fornecedor", destination: "comercial", rx: /fornecedor/i },
  { reason: "produto_sem_preco", destination: "comercial", rx: /sem pre[çc]o|pre[çc]o n[ãa]o (aparece|consta)/i },
  { reason: "erro_site", destination: "comercial", rx: /erro no site|site fora|site n[ãa]o (abre|carrega)/i },
  { reason: "erro_carrinho", destination: "comercial", rx: /carrinho/i },
  { reason: "erro_checkout", destination: "comercial", rx: /checkout|finalizar (a )?compra n[ãa]o/i },

  // ── Carla (cupom / parcerias) ────────────────────────────────────────────
  { reason: "problema_cupom", destination: "parcerias", rx: /cupom (n[ãa]o|inv[áa]lido|expirad|com problema)|problema com (o )?cupom/i },
  { reason: "parceria", destination: "parcerias", rx: /parceria/i },
  { reason: "influenciadora", destination: "parcerias", rx: /influencia(dora)?|influencer/i },
  { reason: "collab", destination: "parcerias", rx: /collab/i },

];

/**
 * ⚠️ LEGADO — fallback. Detecta motivo a partir do texto natural e o converte
 * para o motivo canônico estruturado. Retorna null se nada casar.
 */
export function detectHandoffTarget(
  text: string,
): { reason: HandoffReason; destination: HandoffDestination } | null {
  // Logística pós-compra tem precedência: a necessidade atual de entrega/frete/
  // prazo/envio/rastreio pertence à expedição mesmo com contexto dermatológico.
  for (const entry of LOGISTICS_REASON_MATRIX) {
    if (entry.rx.test(text)) return resolveHandoffReason(entry.reason);
  }
  // Sem assunto logístico, a classificação sensível permanece exatamente como era.
  for (const entry of SENSITIVE_REASON_MATRIX) {
    if (entry.rx.test(text)) return resolveHandoffReason(entry.reason);
  }
  for (const entry of REASON_MATRIX) {
    if (entry.rx.test(text)) return resolveHandoffReason(entry.reason);
  }
  return null;
}

export type HandoffHistoryMessage = { from_type?: string; role?: string; content?: string | null };

/**
 * Classifica o turno atual e, apenas para respostas curtas/continuações, recupera
 * a intenção das mensagens recentes do cliente. Textos do agente nunca concedem
 * autoridade; servem somente para delimitar o contexto da conversa.
 */
export function detectHandoffTargetFromHistory(
  currentText: string,
  history: HandoffHistoryMessage[] = [],
): { reason: HandoffReason; destination: HandoffDestination } | null {
  const cleanCurrent = stripHandoffMarkers(currentText);
  const direct = detectHandoffTarget(cleanCurrent);
  if (direct) return direct;

  const isShortConfirmation = /^(?:sim|isso|isso mesmo|pode|por favor|dificuldade|n[ãa]o consigo|n[ãa]o funciona|obrigad[oa]?|obg|bom dia|boa tarde|boa noite)[.!?\s]*$/iu.test(cleanCurrent);
  const looksLikeAddress = cleanCurrent.length <= 100 && /\b(?:rua|r\.|avenida|av\.?|alameda|travessa|rodovia|estrada|pra[çc]a)\b.{1,80}\d+/iu.test(cleanCurrent);
  const isContinuation = isShortConfirmation || looksLikeAddress;
  if (!isContinuation) return null;

  const priorUserTexts = history
    .filter((entry) => (entry.from_type ?? entry.role) === "user")
    .map((entry) => stripHandoffMarkers(entry.content))
    .filter(Boolean)
    .filter((text) => text !== cleanCurrent)
    .slice(-3)
    .reverse();

  for (const priorText of priorUserTexts) {
    const target = detectHandoffTarget(priorText);
    if (target) return target;
  }
  return null;
}

export type HandoffTarget = { reason: HandoffReason; destination: HandoffDestination };

/**
 * Espelha public.is_sensitive_dermo_reason: casos clínicos sensíveis que têm
 * prioridade da dermoconsultora sênior. Mantido em sincronia com o SQL.
 */
const SENSITIVE_DERMO_REASONS = new Set([
  "sensitive_case",
  "pregnancy_breastfeeding",
  "allergy",
  "reaction",
  "sensitized_or_injured_skin",
  "contraindication",
  "medication_or_dermatological_treatment",
  "recent_procedure",
]);

export function isSensitiveDermoReason(reason?: string | null): boolean {
  return SENSITIVE_DERMO_REASONS.has(String(reason ?? "").toLowerCase());
}

export function resolveHandoffDecision(params: {
  structuredReason?: string | null;
  agentContent?: string | null;
  currentUserText: string;
  history?: HandoffHistoryMessage[];
}): { target: HandoffTarget | null; cleanedAgentContent: string; source: "structured" | "customer_intent" | "context" } {
  const marker = extractHandoffMarker(params.agentContent ?? "");
  const structured = resolveHandoffReason(params.structuredReason) ?? marker.target;
  if (structured) return { target: structured, cleanedAgentContent: marker.cleaned, source: "structured" };
  const direct = detectHandoffTarget(stripHandoffMarkers(params.currentUserText));
  // Determinístico: logística/financeiro (Leticia), pedido explícito de
  // dermoconsultora e casos clinicamente sensíveis não dependem da frase que o
  // modelo escolheu escrever.
  const deterministic =
    direct?.destination === "financeiro" ||
    direct?.reason === "dermoconsultora_request" ||
    isSensitiveDermoReason(direct?.reason);
  if (deterministic || (direct && isConfirmedHandoffResponse(params.agentContent ?? ""))) {
    return { target: direct, cleanedAgentContent: marker.cleaned, source: "customer_intent" };
  }
  const contextual = detectHandoffTargetFromHistory(params.currentUserText, params.history ?? []);
  const eligibleContext = contextual?.destination === "financeiro" ? contextual : null;
  return { target: eligibleContext, cleanedAgentContent: marker.cleaned, source: eligibleContext ? "context" : "customer_intent" };
}

export async function applyResolvedHandoff(
  admin: Admin,
  params: {
    conversationId: string;
    contactId?: string | null;
    target: HandoffTarget;
    source: "structured" | "customer_intent" | "context" | "reaper";
    runId?: string | null;
    triggerMessageId?: string | null;
    triggerSnippet?: string | null;
  },
): Promise<{ applied: boolean; deduped?: boolean; destination: HandoffDestination }> {
  const { target } = params;
  const runtime = globalThis as typeof globalThis & {
    Deno?: { env?: { get?: (name: string) => string | undefined } };
  };
  const grantEnabled = (runtime.Deno?.env?.get?.("EXPEDICAO_CHAT_HANDOFF_ENABLED") ?? "false") === "true";

  if (target.destination === "financeiro" && grantEnabled && isExpedicaoGrantReason(target.reason)) {
    // Defesa idempotente entre orchestrator, callback tardio e reaper. A RPC atual
    // substitui grants; portanto não a repetimos quando o mesmo handoff já está ativo.
    const { data: existingConversation } = await admin
      .from("conversations")
      .select("ai_paused, human_takeover_required, handoff_type, handoff_reason")
      .eq("id", params.conversationId)
      .maybeSingle();
    if (
      existingConversation?.ai_paused === true &&
      existingConversation?.human_takeover_required === true &&
      existingConversation?.handoff_type === "financeiro" &&
      existingConversation?.handoff_reason === target.reason
    ) {
      const { data: activeGrant } = await admin
        .from("conversation_access_grants")
        .select("id")
        .eq("conversation_id", params.conversationId)
        .eq("reason", target.reason)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (activeGrant?.id) {
        console.log(`[handoff] dedup conv=${params.conversationId} motivo=${target.reason}`);
        return { applied: true, deduped: true, destination: target.destination };
      }
    }

    const { data, error } = await admin.rpc("apply_expedicao_handoff", {
      _conversation_id: params.conversationId,
      _reason: target.reason,
      _origin: "nina",
      _run_id: params.runId ?? null,
      _trigger_message_id: params.triggerMessageId ?? null,
      _trigger_snippet: params.triggerSnippet?.slice(0, 500) ?? null,
    });
    if (error) throw error;
    console.log(`[handoff] expedição aplicada source=${params.source}:`, JSON.stringify(data));
    return { applied: true, destination: target.destination };
  }

  const { outsideHours, weekday, hour } = target.destination === "dermoconsultant"
    ? isOutsideDermoHours()
    : { outsideHours: false, weekday: "", hour: 0 };
  await applyHandoff(admin, {
    conversationId: params.conversationId,
    contactId: params.contactId,
    destination: target.destination,
    reason: target.reason,
    runId: params.runId,
    snippet: params.triggerSnippet,
    triggerMessageId: params.triggerMessageId ?? null,
    outsideHours,
    extraMetadata: {
      reason_source: params.source,
      ...(target.destination === "dermoconsultant"
        ? { tz: "America/Sao_Paulo", weekday, hour }
        : {}),
    },
  });
  return { applied: true, destination: target.destination };
}

/**
 * Confirma que a resposta do agente declarou um encaminhamento já realizado.
 * Perguntas/ofertas de encaminhamento não autorizam o fallback sobre a mensagem
 * do cliente. O caminho estruturado não depende desta heurística.
 */
export function isConfirmedHandoffResponse(text: string): boolean {
  const confirmed = /\b(?:vou\s+(?:te\s+|lhe\s+)?(?:deixar|encaminhar|passar|conectar)\b|vou\s+(?:te\s+|lhe\s+)?deixar\s+com\b|j[áa]\s+(?:deixei|encaminhei|passei|conectei)\b)|deixar.{0,15}encaminhad[oa]|encaminhar (?:sua |seu )?(?:d[úu]vida|caso|atendimento|solicita[çc][ãa]o)|vou\s+chamar\s+(?:a\s+|o\s+)?(?:respons[áa]vel|dermoconsultora|especialista)\b|\b(?:j[áa]\s+)?(?:foi|foram|est[áa])\s+encaminhad[oa]s?\b|\bo?\s?encaminhamento\b[\s\S]{0,60}\b(?:j[áa]\s+)?(?:foi\s+feito|realizado|efetuado|conclu[íi]do|feito)\b/i;
  const askingOnly =
    /(?:voc[êe] (?:quer|prefere)|deseja|posso|quer)\b.{0,80}(?:encaminha(?:r|e)|deixar.{0,15}encaminhad|aguardar)/i;
  return confirmed.test(text) && !askingOnly.test(text);
}


/**
 * Resolve o team_member responsável pelo destino.
 * - dermoconsultant: usa public.pick_next_dermoconsultora() (round-robin por carga).
 * - demais: busca por e-mail em team_members ativos.
 */
export async function resolveAssignee(
  admin: Admin,
  destination: HandoffDestination,
  reason?: string,
): Promise<{ team_member_id: string | null; email: string | null; name: string | null; dermo_mode?: string; dermo_fallback?: boolean }> {
  if (destination === "dermoconsultant") {
    // Casos sensíveis → Laura direto (fora do balanceamento); demais → menor
    // carga de atendimentos ativos entre as cinco. O SQL decide e sinaliza o modo.
    const { data, error } = await admin.rpc("pick_dermo_assignee", { _reason: reason ?? null });
    if (error) console.error("[handoff] pick_dermo_assignee error:", error);
    const id = (typeof data === "object" && data ? data.team_member_id : null) ?? null;
    if (!id) return { team_member_id: null, email: null, name: null };
    if (data?.fallback) {
      console.warn(`[handoff] dermo fallback: motivo sensível "${reason}" mas sênior indisponível — caiu no balanceamento`);
    }
    const { data: tm } = await admin
      .from("team_members").select("id, email, name").eq("id", id).maybeSingle();
    return {
      team_member_id: id, email: tm?.email ?? null, name: tm?.name ?? null,
      dermo_mode: data?.mode ?? null, dermo_fallback: !!data?.fallback,
    };
  }

  const email = DESTINATION_EMAILS[destination];
  if (MASTER_EMAIL_BLOCKLIST.includes(email.toLowerCase())) {
    return { team_member_id: null, email: null, name: null };
  }
  const { data: tm, error } = await admin
    .from("team_members")
    .select("id, email, name, status")
    .ilike("email", email)
    .eq("status", "active")
    .maybeSingle();
  if (error) console.error("[handoff] team_member lookup error:", error);
  return { team_member_id: tm?.id ?? null, email: tm?.email ?? null, name: tm?.name ?? null };
}

/**
 * Aplica o handoff na conversa reutilizando as colunas/estruturas existentes.
 * Não altera nomes de etapas do pipeline.
 */
export async function applyHandoff(
  admin: Admin,
  params: {
    conversationId: string;
    contactId?: string | null;
    destination: HandoffDestination;
    reason: string;
    runId?: string | null;
    snippet?: string | null;
    triggerMessageId?: string | null;
    outsideHours?: boolean;
    humanStatus?: string | null;
    extraMetadata?: Record<string, unknown>;
  },
): Promise<{ team_member_id: string | null; destination: HandoffDestination }> {
  const assignee = await resolveAssignee(admin, params.destination, params.reason);
  const nowIso = new Date().toISOString();
  const isDermo = params.destination === "dermoconsultant";

  const update: Record<string, unknown> = {
    ai_paused: true,
    human_takeover_required: true,
    handoff_type: params.destination,
    handoff_reason: params.reason,
    handoff_created_at: nowIso,
    human_status:
      params.humanStatus ??
      (isDermo
        ? params.outsideHours
          ? "aguardando_dermoconsultora_proximo_horario"
          : "aguardando_dermoconsultora"
        : "aguardando_humano"),
    status: "paused",
    // Um novo handoff sempre representa um atendimento ativo novo,
    // mesmo que a conversa tenha sido finalizada anteriormente.
    attendance_finished: false,
    attendance_finished_at: null,
    attendance_finished_by: null,
  };
  if (isDermo) {
    update.requires_dermoconsultant = true;
    update.outside_dermoconsultant_hours = !!params.outsideHours;
  }
  if (assignee.team_member_id) {
    update.assigned_user_id = assignee.team_member_id;
    update.assigned_at = nowIso;
  }

  await admin.from("conversations").update(update).eq("id", params.conversationId);

  // Concessão de acesso da dermoconsultora (mesmo modelo da expedição):
  // sem grant ativo, a profissional não lê a conversa no Chat ao Vivo.
  if (isDermo && assignee.team_member_id) {
    const { data: grantRes, error: grantErr } = await admin.rpc("internal_grant_dermo_access", {
      _conversation_id: params.conversationId,
      _team_member_id: assignee.team_member_id,
      _reason: params.reason,
      _origin: "nina",
      _trigger_message_id: params.triggerMessageId ?? null,
      _trigger_snippet: params.snippet ?? null,
    });
    if (grantErr) console.error("[handoff] internal_grant_dermo_access error:", grantErr);
    else console.log(`[handoff] dermo grant: ${JSON.stringify(grantRes)}`);
  }

  await admin.from("conversation_handoff_events").insert({
    conversation_id: params.conversationId,
    event_type: isDermo ? "handoff_dermoconsultant" : `handoff_${params.destination}`,
    handoff_reason: params.reason,
    metadata: {
      run_id: params.runId ?? null,
      snippet: params.snippet?.slice(0, 200) ?? null,
      destination: params.destination,
      assigned_team_member_id: assignee.team_member_id,
      assigned_email: assignee.email,
      outside_hours: params.outsideHours ?? null,
      ...(isDermo
        ? { dermo_mode: assignee.dermo_mode ?? null, dermo_fallback: assignee.dermo_fallback ?? false }
        : {}),
      ...(params.extraMetadata ?? {}),
    },
  });

  // Pipeline: reutiliza a etapa existente (nome inalterado).
  if (params.contactId) {
    const { data: stage } = await admin
      .from("pipeline_stages").select("id").eq("title", "Encaminhado para humano").maybeSingle();
    if (stage?.id) {
      await admin.from("deals")
        .update({ stage_id: stage.id, stage: "human_handoff" })
        .eq("contact_id", params.contactId);
    }
  }

  console.log(
    `[handoff] conv=${params.conversationId} destino=${params.destination} motivo=${params.reason} assignee=${assignee.team_member_id ?? "none"}`,
  );
  return { team_member_id: assignee.team_member_id, destination: params.destination };
}

/** Horário comercial da dermoconsultora (America/Sao_Paulo): seg-qui 08-18, sex 08-17. */
export function isOutsideDermoHours(now: Date = new Date()): { outsideHours: boolean; weekday: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dayMap[weekday] ?? 0;
  let withinHours = false;
  if (dow >= 1 && dow <= 4) withinHours = hour >= 8 && hour < 18;
  else if (dow === 5) withinHours = hour >= 8 && hour < 17;
  return { outsideHours: !withinHours, weekday, hour };
}
