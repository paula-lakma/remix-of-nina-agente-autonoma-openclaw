// Regras puras da aba Templates (sem rede/banco) — testáveis no vitest.

/** Rótulo em português para o status da Meta. Desconhecido: valor original. */
export function templateStatusLabel(status: string | null | undefined): string {
  const s = String(status ?? "").toUpperCase();
  const map: Record<string, string> = {
    APPROVED: "Aprovado",
    PENDING: "Em análise pela Meta",
    REJECTED: "Rejeitado",
    PAUSED: "Pausado",
    DISABLED: "Desativado",
    IN_APPEAL: "Em recurso na Meta",
    PENDING_DELETION: "Exclusão pendente",
    DELETED: "Excluído",
    LIMIT_EXCEEDED: "Limite excedido",
  };
  return map[s] ?? String(status ?? "");
}

export const CATEGORY_LABEL: Record<string, string> = {
  UTILITY: "Utilidade", MARKETING: "Marketing", AUTHENTICATION: "Autenticação",
};

/** Meta: "já existe template com esse nome/idioma" (code 100 / subcode 2388093 ou 2388024). */
// deno-lint-ignore no-explicit-any
export function isMetaDuplicateNameError(err: any): boolean {
  if (!err) return false;
  const sub = Number(err.error_subcode);
  if (sub === 2388093 || sub === 2388024) return true;
  const msg = `${err.message ?? ""} ${err.error_user_msg ?? ""} ${err.error_user_title ?? ""}`.toLowerCase();
  return /already exists|já existe/.test(msg);
}

/**
 * `meta_templates.labels` é text[]; as anotações da revisão da Meta ficam em
 * `samples.review` (jsonb já existente), sem migration.
 */
export function mergeTemplateReview(
  samples: unknown,
  opts: { rejected_reason?: string | null; status?: string | null; requested_category?: string | null },
): Record<string, unknown> {
  const base: Record<string, unknown> =
    samples && typeof samples === "object" && !Array.isArray(samples) ? { ...(samples as Record<string, unknown>) } : {};
  const review = mergeTemplateLabels(base.review, opts);
  if (Object.keys(review).length) base.review = review; else delete base.review;
  return base;
}

/** Lê samples.review. */
export function templateReview(samples: unknown): Record<string, unknown> {
  const r = samples && typeof samples === "object" ? (samples as Record<string, unknown>).review : null;
  return r && typeof r === "object" && !Array.isArray(r) ? (r as Record<string, unknown>) : {};
}

/**
 * Mescla os dados da sincronização no objeto de revisão sem perder chaves existentes.
 * - requested_category só é gravada uma vez (categoria pedida na submissão).
 * - rejected_reason só é gravado quando a Meta informa (nunca inventa);
 *   "NONE" da Meta significa sem motivo e não é gravado.
 */
export function mergeTemplateLabels(
  existing: unknown,
  opts: { rejected_reason?: string | null; status?: string | null; requested_category?: string | null },
): Record<string, unknown> {
  const base: Record<string, unknown> =
    existing && typeof existing === "object" && !Array.isArray(existing) ? { ...(existing as Record<string, unknown>) } : {};
  if (opts.requested_category && !base.requested_category) base.requested_category = opts.requested_category;
  const reason = typeof opts.rejected_reason === "string" ? opts.rejected_reason.trim() : "";
  if (reason && reason.toUpperCase() !== "NONE") base.rejected_reason = reason;
  else if (String(opts.status ?? "").toUpperCase() !== "REJECTED" && "rejected_reason" in base && opts.status) {
    // template saiu de REJECTED (ex.: recurso aprovado): motivo antigo deixa de valer
    delete base.rejected_reason;
  }
  return base;
}

/** Categoria aprovada difere da solicitada? Retorna ambas para o aviso, ou null. */
export function categoryChange(labels: unknown, category: string | null | undefined) {
  const req = labels && typeof labels === "object" ? (labels as Record<string, unknown>).requested_category : null;
  if (typeof req !== "string" || !category || req.toUpperCase() === category.toUpperCase()) return null;
  return { requested: req.toUpperCase(), current: category.toUpperCase() };
}

/** Papéis autorizados a gerir templates. */
export function canManageTemplates(roles: string[]): boolean {
  return roles.includes("admin") || roles.includes("manager");
}

/**
 * Botões aceitos na criação de modelos: somente QUICK_REPLY, 0 a 3,
 * texto 1–25 caracteres após trim, sem repetidos. Retorna o componente
 * normalizado ou um erro. Sem botões → null (payload igual ao de antes).
 */
export function validateQuickReplyButtons(
  buttons: unknown,
): { ok: true; component: { type: "BUTTONS"; buttons: { type: "QUICK_REPLY"; text: string }[] } | null } | { ok: false; error: string } {
  if (buttons == null) return { ok: true, component: null };
  if (!Array.isArray(buttons)) return { ok: false, error: "Botões inválidos." };
  if (buttons.length === 0) return { ok: true, component: null };
  if (buttons.length > 3) return { ok: false, error: "Máximo de 3 botões." };
  const out: { type: "QUICK_REPLY"; text: string }[] = [];
  const seen = new Set<string>();
  for (const b of buttons) {
    const type = (b as { type?: unknown })?.type;
    if (type !== "QUICK_REPLY") return { ok: false, error: "Somente botões de resposta rápida são permitidos." };
    const text = String((b as { text?: unknown })?.text ?? "").trim();
    if (!text) return { ok: false, error: "Botão sem texto." };
    if ([...text].length > 25) return { ok: false, error: "Texto do botão deve ter até 25 caracteres." };
    const key = text.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) return { ok: false, error: "Botões com texto repetido." };
    seen.add(key);
    out.push({ type: "QUICK_REPLY", text });
  }
  return { ok: true, component: { type: "BUTTONS", buttons: out } };
}
