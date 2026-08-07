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
} as const satisfies Record<string, HandoffDestination>;

export type HandoffReason = keyof typeof REASON_DESTINATIONS;

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
  pagamento: "payment",
  nota_fiscal: "invoice",
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
  dermoconsultora: "sensitive_case",
};

/** Normaliza qualquer motivo (canônico ou legado) -> { reason, destination }. */
export function resolveHandoffReason(
  raw: string | null | undefined,
): { reason: HandoffReason; destination: HandoffDestination } | null {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase().replace(/[\s-]+/g, "_");
  const canonical = (key in REASON_DESTINATIONS ? key : REASON_ALIASES[key]) as HandoffReason | undefined;
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
const REASON_MATRIX: Array<{ reason: string; destination: HandoffDestination; rx: RegExp }> = [
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

  // ── Leticia (financeiro) ─────────────────────────────────────────────────
  { reason: "pagamento", destination: "financeiro", rx: /pagamento|pagar|boleto|estorno|reembolso|cobran[çc]a|\bpix\b/i },
  { reason: "nota_fiscal", destination: "financeiro", rx: /nota fiscal|\bnfe?\b|danfe/i },

  // ── Dermoconsultoras (técnico / sensível) ────────────────────────────────
  { reason: "gestante", destination: "dermoconsultant", rx: /gestante|gr[áa]vida|gesta(ç|c)[ãa]o/i },
  { reason: "lactante", destination: "dermoconsultant", rx: /lactante|amament/i },
  { reason: "alergia", destination: "dermoconsultant", rx: /alergi/i },
  { reason: "reacao", destination: "dermoconsultant", rx: /rea[çc][ãa]o|reagiu|ard[êe]ncia forte|incha[çc]o/i },
  { reason: "pele_sensibilizada", destination: "dermoconsultant", rx: /sensibiliz|sens[íi]vel|lesionad/i },
  { reason: "contraindicacao", destination: "dermoconsultant", rx: /contraindic|contra-indic/i },
  { reason: "medicamento_dermatologico", destination: "dermoconsultant", rx: /medicament|roacutan|isotretino[íi]na|tratamento dermatol[óo]gico|dermatologista/i },
  { reason: "procedimento_recente", destination: "dermoconsultant", rx: /procedimento recente|fez (peeling|laser|microagulhamento)|p[óo]s[- ]procedimento/i },
  { reason: "adaptacao_protocolo", destination: "dermoconsultant", rx: /adapta[çc][ãa]o.{0,15}protocolo|trocar.{0,10}produto.{0,10}protocolo/i },
  { reason: "duvida_tecnica", destination: "dermoconsultant", rx: /d[úu]vida t[ée]cnica|avalia[çc][ãa]o (t[ée]cnica|humana)|t[ée]cnic/i },
  { reason: "protocolo_nao_aprovado", destination: "dermoconsultant", rx: /protocolo n[ãa]o aprovado|protocolo n[ãa]o cadastr/i },
  { reason: "link_nao_localizado", destination: "dermoconsultant", rx: /link n[ãa]o (encontrad|localizad)|n[ãa]o (consegui|localizei) (o )?link|n[ãa]o encontrei o link/i },
];

/** Detecta motivo + destino a partir do texto. Retorna null se nada casar. */
export function detectHandoffTarget(text: string): { reason: string; destination: HandoffDestination } | null {
  for (const entry of REASON_MATRIX) {
    if (entry.rx.test(text)) return { reason: entry.reason, destination: entry.destination };
  }
  return null;
}

/**
 * Resolve o team_member responsável pelo destino.
 * - dermoconsultant: usa public.pick_next_dermoconsultora() (round-robin por carga).
 * - demais: busca por e-mail em team_members ativos.
 */
export async function resolveAssignee(
  admin: Admin,
  destination: HandoffDestination,
): Promise<{ team_member_id: string | null; email: string | null; name: string | null }> {
  if (destination === "dermoconsultant") {
    const { data, error } = await admin.rpc("pick_next_dermoconsultora");
    if (error) console.error("[handoff] pick_next_dermoconsultora error:", error);
    const id = (typeof data === "string" ? data : data?.[0]) ?? null;
    if (!id) return { team_member_id: null, email: null, name: null };
    const { data: tm } = await admin
      .from("team_members").select("id, email, name").eq("id", id).maybeSingle();
    return { team_member_id: id, email: tm?.email ?? null, name: tm?.name ?? null };
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
    outsideHours?: boolean;
    humanStatus?: string | null;
    extraMetadata?: Record<string, unknown>;
  },
): Promise<{ team_member_id: string | null; destination: HandoffDestination }> {
  const assignee = await resolveAssignee(admin, params.destination);
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
