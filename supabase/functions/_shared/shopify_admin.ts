// Shopify Admin (somente leitura) para a recuperação de pedidos pending.
// Token temporário via client credentials, só em memória. Nunca registra segredos/tokens.

// deno-lint-ignore no-explicit-any
type Any = any;

export const SHOPIFY_API_VERSION = "2026-07";

export const RECONCILE_ORDER_QUERY = `query ReconcileOrder($id: ID!, $cursor: String) {
  order(id: $id) {
    id legacyResourceId name updatedAt createdAt test
    displayFinancialStatus displayFulfillmentStatus
    cancelledAt cancelReason
    currentSubtotalPriceSet { shopMoney { amount } }
    currentTotalPriceSet { shopMoney { amount } }
    totalRefundedSet { shopMoney { amount } }
    lineItems(first: 50, after: $cursor) {
      nodes { id quantity currentQuantity }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export function orderGid(sourceOrderId: string): string {
  const s = String(sourceOrderId).trim();
  if (s.startsWith("gid://shopify/Order/")) return s;
  if (!/^\d+$/.test(s)) throw new Error("source_order_id inválido");
  return `gid://shopify/Order/${s}`;
}

export function isValidShopDomain(d: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(d);
}

export async function getAccessToken(
  shop: string, clientId: string, clientSecret: string, fetchFn: FetchFn = fetch,
): Promise<string> {
  if (!isValidShopDomain(shop)) throw new Error("SHOPIFY_SHOP_DOMAIN inválido");
  const res = await fetchFn(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }).toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`auth_failed:${res.status}`);
  let json: Any;
  try { json = JSON.parse(text); } catch { throw new Error("auth_invalid_response"); }
  if (!json?.access_token) throw new Error("auth_no_token");
  return String(json.access_token);
}

export interface FetchedOrder {
  found: boolean;
  order: Any | null;
  lineItems: { id: string; quantity: number; currentQuantity: number | null }[];
  pages: number;
  complete: boolean;
}

/** Lê o pedido e pagina todos os itens (cursor null na 1ª chamada, endCursor depois). */
export async function fetchOrderWithAllItems(
  shop: string, token: string, gid: string, fetchFn: FetchFn = fetch, maxPages = 20,
): Promise<FetchedOrder> {
  let cursor: string | null = null;
  let order: Any = null;
  const lineItems: FetchedOrder["lineItems"] = [];
  let pages = 0;
  while (pages < maxPages) {
    const res = await fetchFn(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query: RECONCILE_ORDER_QUERY, variables: { id: gid, cursor } }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`graphql_http_${res.status}`);
    const json: Any = JSON.parse(text);
    if (json.errors?.length) {
      const codes = json.errors.map((e: Any) => e?.extensions?.code || e?.message).join(",");
      throw new Error(`graphql_errors:${codes}`);
    }
    pages++;
    const o = json.data?.order;
    if (!o) return { found: false, order: null, lineItems: [], pages, complete: true };
    if (!order) order = o;
    for (const n of o.lineItems?.nodes || []) lineItems.push(n);
    const pi = o.lineItems?.pageInfo;
    if (!pi?.hasNextPage) return { found: true, order, lineItems, pages, complete: true };
    cursor = pi.endCursor;
  }
  return { found: true, order, lineItems, pages, complete: false };
}

// ================= Etapa 1: dry_run (classificação pura, sem escrita) =================

export type DryRunClass =
  | "pending" | "paid" | "cancelled" | "refunded" | "partially_refunded"
  | "outro" | "divergencia_itens" | "consulta_incompleta" | "nao_encontrado" | "erro";

/** Compara pelo GID exato: payload base line_items[].admin_graphql_api_id x lineItems.nodes[].id. */
export function compareLineItems(
  baseLineItems: Any[] | null | undefined, shopifyIds: string[],
): "ok" | "divergente" | "base_sem_gid" {
  const base = Array.isArray(baseLineItems) ? baseLineItems : [];
  const baseIds: string[] = [];
  for (const li of base) {
    const g = li?.admin_graphql_api_id;
    if (typeof g !== "string" || !g.startsWith("gid://shopify/LineItem/")) return "base_sem_gid";
    baseIds.push(g);
  }
  const a = [...baseIds].sort(), b = [...shopifyIds].sort();
  if (a.length !== b.length) return "divergente";
  return a.every((x, i) => x === b[i]) ? "ok" : "divergente";
}

export interface ClassifyInput {
  found: boolean;
  complete: boolean;
  error?: string | null;
  financial?: string | null;
  cancelledAt?: string | null;
  items?: "ok" | "divergente" | "base_sem_gid";
}

export function classifyOrder(i: ClassifyInput): { cls: DryRunClass; eligible: boolean; reason: string | null } {
  if (i.error) return { cls: "erro", eligible: false, reason: "erro na consulta" };
  if (!i.found) return { cls: "nao_encontrado", eligible: false, reason: "pedido não encontrado na Shopify" };
  if (!i.complete) return { cls: "consulta_incompleta", eligible: false, reason: "paginação de itens incompleta" };
  if (i.items === "base_sem_gid") return { cls: "consulta_incompleta", eligible: false, reason: "item sem GID no payload base" };
  if (i.cancelledAt) return { cls: "cancelled", eligible: false, reason: "cancelado na Shopify" };
  const f = String(i.financial || "").toUpperCase();
  if (f === "REFUNDED") return { cls: "refunded", eligible: false, reason: "reembolsado" };
  if (f === "PARTIALLY_REFUNDED") return { cls: "partially_refunded", eligible: false, reason: "reembolso parcial" };
  if (f === "PENDING") return { cls: "pending", eligible: false, reason: "ainda pending na Shopify" };
  if (f !== "PAID") return { cls: "outro", eligible: false, reason: `status ${f || "desconhecido"}` };
  if (i.items === "divergente") return { cls: "divergencia_itens", eligible: false, reason: "itens divergentes" };
  return { cls: "paid", eligible: true, reason: null };
}

// ================= Etapa 2: piloto (payload do evento técnico orders/reconciled) =================

export function reconciledEventKey(gid: string, updatedAt: string): string {
  return `orders/reconciled:${gid}:${updatedAt}`;
}

/** Payload base do webhook + somente os campos aprovados. fulfillment_status do base é preservado. */
export function buildReconciledPayload(base: Any, o: Any): Any {
  const money = (s: Any) => s?.shopMoney?.amount ?? null;
  const out = { ...base };
  out.financial_status = String(o.displayFinancialStatus).toLowerCase();
  out.cancelled_at = o.cancelledAt ?? null;
  out.cancel_reason = o.cancelReason ?? null;
  out.updated_at = o.updatedAt;
  const cs = money(o.currentSubtotalPriceSet); if (cs != null) out.current_subtotal_price = String(cs);
  const ct = money(o.currentTotalPriceSet); if (ct != null) out.current_total_price = String(ct);
  return out;
}

// ================= status_pilot (status histórico não pago; hoje SOMENTE EXPIRED) =================

export const STATUS_PILOT_ALLOWED = ["EXPIRED"] as const;

export function reconciledStatusEventKey(gid: string, updatedAt: string): string {
  return `orders/reconciled_status:${gid}:${updatedAt}`;
}

export interface StatusPilotInput {
  dbStatus: string | null | undefined;
  found: boolean;
  complete: boolean;
  financial?: string | null;
  cancelledAt?: string | null;
  items?: "ok" | "divergente" | "base_sem_gid";
  shopifyUpdatedAt?: string | null;
  baseUpdatedAt?: string | null;
}

/** Validação separada da regra PAID: só aceita pending local + EXPIRED na Shopify. */
export function classifyStatusPilot(i: StatusPilotInput, allowRefunded = false): { eligible: boolean; reason: string | null } {
  if (i.dbStatus !== "pending") return { eligible: false, reason: `banco não está pending (${i.dbStatus})` };
  if (!i.found) return { eligible: false, reason: "pedido não encontrado na Shopify" };
  if (!i.complete) return { eligible: false, reason: "paginação de itens incompleta" };
  if (i.cancelledAt) return { eligible: false, reason: "cancelado na Shopify" };
  const f = String(i.financial || "").toUpperCase();
  const allowed: string[] = [...STATUS_PILOT_ALLOWED, ...(allowRefunded ? ["REFUNDED"] : [])];
  if (!allowed.includes(f)) return { eligible: false, reason: `status ${f || "desconhecido"} não habilitado neste modo` };
  if (i.items !== "ok") return { eligible: false, reason: i.items === "base_sem_gid" ? "item sem GID no payload base" : "itens divergentes" };
  const su = i.shopifyUpdatedAt ? Date.parse(i.shopifyUpdatedAt) : NaN;
  if (isNaN(su)) return { eligible: false, reason: "updatedAt da Shopify inválido" };
  const bu = i.baseUpdatedAt ? Date.parse(String(i.baseUpdatedAt)) : NaN;
  if (isNaN(bu) || !(su > bu)) return { eligible: false, reason: "updatedAt da Shopify não é posterior ao evento salvo" };
  return { eligible: true, reason: null };
}

/** Payload base + somente financial_status e updated_at. Nada mais muda (valores, itens, fulfillment, cliente, cupons, datas). */
export function buildStatusPayload(base: Any, financial: string, updatedAt: string): Any {
  return { ...base, financial_status: String(financial).toLowerCase(), updated_at: updatedAt };
}

/** Assinatura dos itens (id, product_id, variant_id, quantity, GID) extraída do texto bruto, sem parse numérico. */
export function lineItemSignature(text: string): string {
  const li = text.match(/"line_items":\s*\[.*\]/s)?.[0] || "";
  const grab = (k: string) => (li.match(new RegExp(`"${k}":\\s*(\\d+)`, "g")) || []).map((x) => x.replace(/^.*:\s*/, ""));
  return JSON.stringify({ id: grab("id"), product_id: grab("product_id"), variant_id: grab("variant_id"),
    quantity: grab("quantity"), gid: li.match(/gid:\/\/shopify\/LineItem\/\d+/g) || [] });
}

// ================= JSON sem perda de precisão (código local, sem dependência externa) =================
// Inteiros com 16+ dígitos fora de strings viram marcadores de texto no parse e voltam idênticos no stringify.
const BIG_MARK = "__lakma_bigint__:";

export function losslessParse(text: string): Any {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      const s = text.slice(i, j + 1);
      if (s.includes(BIG_MARK)) throw new Error("payload contém marcador reservado");
      out += s; i = j + 1; continue;
    }
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      let j = i + 1;
      while (j < n && /[0-9eE.+\-]/.test(text[j])) j++;
      const tok = text.slice(i, j);
      out += /^-?\d{16,}$/.test(tok) ? `"${BIG_MARK}${tok}"` : tok;
      i = j; continue;
    }
    out += ch; i++;
  }
  return JSON.parse(out);
}

export function losslessStringify(v: Any): string {
  return JSON.stringify(v).replace(new RegExp(`"${BIG_MARK}(-?\\d+)"`, "g"), "$1");
}

// ================= refund_audit (SOMENTE LEITURA; allowlist fixa) =================

export const REFUND_AUDIT_ALLOWLIST = ["2009", "2036", "2107"] as const;

const M = "shopMoney { amount currencyCode }";
const TX = `id kind status gateway processedAt amountSet { ${M} } parentTransaction { id }`;
const RLI = `nodes { quantity lineItem { id } subtotalSet { ${M} } } pageInfo { hasNextPage endCursor }`;
const RSL = `nodes { subtotalAmountSet { ${M} } } pageInfo { hasNextPage endCursor }`;
const RTX = `nodes { ${TX} } pageInfo { hasNextPage endCursor }`;

export const REFUND_AUDIT_QUERY = `query RefundAudit($id: ID!) {
  order(id: $id) {
    id name createdAt updatedAt displayFinancialStatus cancelledAt
    totalPriceSet { ${M} }
    subtotalPriceSet { ${M} }
    totalDiscountsSet { ${M} }
    totalShippingPriceSet { ${M} }
    totalReceivedSet { ${M} }
    totalRefundedSet { ${M} }
    totalRefundedShippingSet { ${M} }
    netPaymentSet { ${M} }
    transactions { ${TX} }
    refunds {
      id createdAt processedAt updatedAt note
      totalRefundedSet { ${M} }
      refundLineItems(first: 50) { ${RLI} }
      refundShippingLines(first: 10) { ${RSL} }
      transactions(first: 20) { ${RTX} }
    }
  }
}`;

const PAGE_QUERIES: Record<string, string> = {
  refundLineItems: `query P($id: ID!, $c: String) { node(id: $id) { ... on Refund { refundLineItems(first: 50, after: $c) { ${RLI} } } } }`,
  refundShippingLines: `query P($id: ID!, $c: String) { node(id: $id) { ... on Refund { refundShippingLines(first: 10, after: $c) { ${RSL} } } } }`,
  transactions: `query P($id: ID!, $c: String) { node(id: $id) { ... on Refund { transactions(first: 20, after: $c) { ${RTX} } } } }`,
};

async function gql(shop: string, token: string, query: string, variables: Any, fetchFn: FetchFn): Promise<Any> {
  const res = await fetchFn(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`graphql_http_${res.status}`);
  const json: Any = JSON.parse(text);
  if (json.errors?.length) throw new Error(`graphql_errors:${json.errors.map((e: Any) => e?.extensions?.code || e?.message).join(",")}`);
  return json.data;
}

/** Lê pedido + refunds e pagina todas as connections de cada Refund. Falha de paginação => complete=false. */
export async function fetchRefundAudit(
  shop: string, token: string, gid: string, fetchFn: FetchFn = fetch, maxPages = 20,
): Promise<{ found: boolean; complete: boolean; order: Any | null; issues: string[] }> {
  const data = await gql(shop, token, REFUND_AUDIT_QUERY, { id: gid }, fetchFn);
  const o = data?.order;
  if (!o) return { found: false, complete: true, order: null, issues: [] };
  const issues: string[] = [];
  for (const r of o.refunds || []) {
    for (const k of Object.keys(PAGE_QUERIES)) {
      let conn = r[k];
      let pages = 0;
      while (conn?.pageInfo?.hasNextPage) {
        if (++pages > maxPages) { issues.push(`${r.id}:${k}:max_pages`); break; }
        try {
          const d = await gql(shop, token, PAGE_QUERIES[k], { id: r.id, c: conn.pageInfo.endCursor }, fetchFn);
          const next = d?.node?.[k];
          if (!next) { issues.push(`${r.id}:${k}:sem_dados`); break; }
          r[k].nodes.push(...(next.nodes || []));
          r[k].pageInfo = next.pageInfo;
          conn = next;
        } catch (e) { issues.push(`${r.id}:${k}:${(e as Error).message}`); break; }
      }
    }
  }
  return { found: true, complete: issues.length === 0, order: o, issues };
}

const amt = (s: Any) => s?.shopMoney?.amount ?? null;

/** Resumo: valores do pedido vêm dos campos do Order; transações só reconstroem o histórico. */
export function summarizeRefundAudit(o: Any, complete: boolean): Any {
  const tx = (t: Any) => ({ id: t.id, kind: t.kind, status: t.status, gateway: t.gateway, processedAt: t.processedAt,
    amount: amt(t.amountSet), currency: t.amountSet?.shopMoney?.currencyCode ?? null, parent: t.parentTransaction?.id ?? null });
  const txs = (o.transactions || []).map(tx);
  const refunds = (o.refunds || []).map((r: Any) => ({
    id: r.id, createdAt: r.createdAt, processedAt: r.processedAt, updatedAt: r.updatedAt, note: r.note ?? null,
    total: amt(r.totalRefundedSet),
    line_items: (r.refundLineItems?.nodes || []).map((n: Any) => ({ line_item: n.lineItem?.id ?? null, quantity: n.quantity, subtotal: amt(n.subtotalSet) })),
    shipping: (r.refundShippingLines?.nodes || []).map((n: Any) => amt(n.subtotalAmountSet)),
    transactions: (r.transactions?.nodes || []).map(tx),
  }));
  const total = Number(amt(o.totalPriceSet) ?? NaN);
  const received = Number(amt(o.totalReceivedSet) ?? NaN);
  const refunded = Number(amt(o.totalRefundedSet) ?? NaN);
  let refund_type: string;
  if (!complete) refund_type = "auditoria_incompleta";
  else if (!(refunded > 0)) refund_type = "sem_reembolso";
  else if (received > 0 && Math.abs(refunded - received) < 0.005) refund_type = "total";
  else refund_type = "parcial";
  return {
    name: o.name, createdAt: o.createdAt, updatedAt: o.updatedAt, financial: o.displayFinancialStatus, cancelledAt: o.cancelledAt ?? null,
    total: amt(o.totalPriceSet), subtotal: amt(o.subtotalPriceSet), discounts: amt(o.totalDiscountsSet), shipping: amt(o.totalShippingPriceSet),
    received: amt(o.totalReceivedSet), refunded: amt(o.totalRefundedSet), refunded_shipping: amt(o.totalRefundedShippingSet),
    net_payment: amt(o.netPaymentSet), currency: o.totalPriceSet?.shopMoney?.currencyCode ?? null,
    complete, refund_type, refunds_count: refunds.length, transactions: txs, refunds,
  };
}

/** REFUNDED só com reembolso TOTAL confirmado por valores do Order e transações SUCCESS. Sem parcial. */
export function validateFullRefund(a: Any): { ok: boolean; reason: string | null } {
  if (!a) return { ok: false, reason: "auditoria financeira ausente" };
  if (!a.complete) return { ok: false, reason: "auditoria financeira incompleta" };
  if (String(a.financial).toUpperCase() !== "REFUNDED") return { ok: false, reason: `status ${a.financial} não é REFUNDED` };
  if (a.cancelledAt) return { ok: false, reason: "cancelado na Shopify" };
  const c = (x: Any) => Math.round(Number(x) * 100);
  const rec = c(a.received), ref = c(a.refunded), net = c(a.net_payment);
  if (![rec, ref, net].every(Number.isFinite)) return { ok: false, reason: "valores financeiros ausentes" };
  if (!(rec > 0)) return { ok: false, reason: "nenhum valor recebido" };
  if (ref !== rec) return { ok: false, reason: "reembolso não é total" };
  if (net !== 0) return { ok: false, reason: "posição líquida diferente de zero" };
  const txs: Any[] = a.transactions || [];
  const pays = txs.filter((t) => ["SALE", "CAPTURE"].includes(t.kind) && t.status === "SUCCESS");
  if (!pays.length) return { ok: false, reason: "sem pagamento SUCCESS" };
  const refs = txs.filter((t) => t.kind === "REFUND");
  if (!refs.length || refs.some((t) => t.status !== "SUCCESS")) return { ok: false, reason: "transação de reembolso ausente ou não SUCCESS" };
  const parentIds = new Set(txs.filter((t) => ["SALE", "CAPTURE", "AUTHORIZATION"].includes(t.kind)).map((t) => t.id));
  if (refs.some((t) => t.parent && !parentIds.has(t.parent))) return { ok: false, reason: "reembolso não ligado ao pagamento" };
  return { ok: true, reason: null };
}
