/**
 * Normalização de payloads da Shopify.
 * O JSON é aceito "como vier": nada aqui lança erro por campo ausente.
 */

// deno-lint-ignore no-explicit-any
type Any = any;

/** Busca o primeiro caminho existente (dot-path) com valor não vazio. */
export function pick(obj: Any, paths: string[]): Any {
  for (const path of paths) {
    let cur: Any = obj;
    let ok = true;
    for (const part of path.split(".")) {
      const idx = /^\d+$/.test(part) ? Number(part) : part;
      if (cur == null || typeof cur !== "object") { ok = false; break; }
      cur = cur[idx as Any];
    }
    if (ok && cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return undefined;
}

/** Procura recursivamente a primeira chave cujo nome bate com o regex. */
export function deepFind(obj: Any, keyRegex: RegExp, depth = 6): Any {
  if (!obj || typeof obj !== "object" || depth < 0) return undefined;
  for (const [k, v] of Object.entries(obj)) {
    if (keyRegex.test(k) && v !== null && v !== "" && typeof v !== "object") return v;
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const found = deepFind(v, keyRegex, depth - 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** Normaliza telefone brasileiro para E.164 sem "+" (ex.: 5511998887777). */
export function normalizePhone(raw: unknown): string | null {
  if (raw == null) return null;
  let d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  d = d.replace(/^0+/, "");
  if (d.length <= 11 && !d.startsWith("55")) d = "55" + d;
  if (d.length < 12 || d.length > 15) {
    // fora do padrão esperado: devolve mesmo assim (a Meta valida)
    return d.length >= 10 ? d : null;
  }
  return d;
}

export interface NormalizedShopify {
  topic: string;
  event_kind: "order_confirmed" | "order_shipped" | "unknown";
  event_id: string | null;
  order_number: string | null;
  order_id: string | null;
  fulfillment_id: string | null;
  customer_name: string | null;
  phone: string | null;
  total: string | null;
  currency: string | null;
  financial_status: string | null;
  fulfillment_status: string | null;
  /** Transportadora resolvida: correios | jadlog | indeterminado. */
  tracking_company: string | null;
  /** Valor original recebido da Shopify (auditoria; nunca exibido ao cliente). */
  tracking_company_raw: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
}

const CONFIRM_TOPICS = ["orders/create", "orders/paid"];
const SHIP_TOPICS = ["fulfillments/create", "fulfillments/update", "orders/fulfilled"];

/**
 * Limpa o número do pedido: remove "#" e sufixos de fulfillment
 * ("#1885.1", "1885-F1", "1885.F1" -> "1885").
 */
export function cleanOrderNumber(raw: unknown): string | null {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/^#/, "");
  s = s.replace(/[.\-_](F?\d+)$/i, "");
  return s || null;
}

export function normalizeShopifyPayload(topic: string, body: Any, webhookId?: string | null): NormalizedShopify {
  const t = (topic || "").toLowerCase();

  // Em eventos de fulfillment o "name" da raiz é o do processamento (ex.: #1885.1),
  // então priorizamos os campos do pedido.
  const orderNumberPaths = t.startsWith("fulfillments")
    ? ["order.order_number", "order.name", "order_number", "order_id"]
    : ["order_number", "name", "order.order_number", "order.name", "order_id"];
  const orderNumber =
    pick(body, orderNumberPaths) ??
    deepFind(body, /^(order_number|order_name)$/i);


  const nameParts = [
    pick(body, ["customer.first_name", "order.customer.first_name", "billing_address.first_name", "shipping_address.first_name", "destination.first_name"]),
    pick(body, ["customer.last_name", "order.customer.last_name", "billing_address.last_name", "shipping_address.last_name", "destination.last_name"]),
  ].filter(Boolean);
  const customerName =
    (nameParts.length ? nameParts.join(" ") : undefined) ??
    pick(body, ["customer.name", "shipping_address.name", "billing_address.name", "destination.name"]) ??
    null;

  const rawPhone =
    pick(body, [
      "phone",
      "customer.phone",
      "order.customer.phone",
      "shipping_address.phone",
      "billing_address.phone",
      "destination.phone",
      "order.phone",
      "customer.default_address.phone",
    ]) ?? deepFind(body, /phone/i);

  const trackingNumber =
    pick(body, ["tracking_number", "tracking_numbers.0", "fulfillments.0.tracking_number", "fulfillments.0.tracking_numbers.0"]) ??
    deepFind(body, /^tracking_number$/i);
  const trackingCompany =
    pick(body, ["tracking_company", "fulfillments.0.tracking_company"]) ??
    deepFind(body, /^tracking_company$/i);
  const trackingUrl =
    pick(body, ["tracking_url", "tracking_urls.0", "fulfillments.0.tracking_url", "fulfillments.0.tracking_urls.0"]) ??
    deepFind(body, /^tracking_url$/i);

  const financial = pick(body, ["financial_status", "order.financial_status"]) ?? null;
  const fulfillment = pick(body, ["fulfillment_status", "order.fulfillment_status", "status"]) ?? null;

  let kind: NormalizedShopify["event_kind"] = "unknown";
  if (SHIP_TOPICS.includes(t) || (trackingNumber && t.startsWith("fulfillments"))) kind = "order_shipped";
  else if (CONFIRM_TOPICS.includes(t)) kind = "order_confirmed";

  const baseId = pick(body, ["admin_graphql_api_id", "id", "order.id"]);
  let eventId: string | null;
  if (t === "orders/updated") {
    // Idempotência por entrega: X-Shopify-Webhook-Id (igual em retries, novo a cada atualização real).
    // Fallback sem header: pedido + updated_at. Rastreio não entra na chave.
    const wid = typeof webhookId === "string" ? webhookId.trim() : "";
    const upd = pick(body, ["updated_at"]);
    eventId = wid
      ? `${t}:${wid}`
      : baseId != null ? `${t}:${baseId}${upd != null ? `:${upd}` : ""}` : null;
  } else {
    eventId = baseId != null ? `${t}:${baseId}${trackingNumber ? `:${trackingNumber}` : ""}` : null;
  }

  return {
    topic: t || "unknown",
    event_kind: kind,
    event_id: eventId,
    order_number: cleanOrderNumber(orderNumber),
    order_id: pick(body, ["order_id", "id", "order.id"]) != null ? String(pick(body, ["order_id", "id", "order.id"])) : null,
    fulfillment_id: (() => {
      const fid = t.startsWith("fulfillments")
        ? pick(body, ["id", "admin_graphql_api_id"])
        : pick(body, ["fulfillment_id", "fulfillments.0.id"]) ?? deepFind(body, /^fulfillment_id$/i);
      return fid != null ? String(fid) : null;
    })(),
    customer_name: customerName ? String(customerName).trim() : null,
    phone: normalizePhone(rawPhone),
    total: pick(body, ["total_price", "current_total_price", "order.total_price"]) != null
      ? String(pick(body, ["total_price", "current_total_price", "order.total_price"]))
      : null,
    currency: (pick(body, ["currency", "order.currency"]) as string) ?? null,
    financial_status: financial ? String(financial) : null,
    fulfillment_status: fulfillment ? String(fulfillment) : null,
    tracking_company: (trackingNumber || trackingUrl || trackingCompany)
      ? resolveCarrier(
          trackingUrl ? String(trackingUrl) : null,
          trackingNumber ? String(trackingNumber) : null,
          trackingCompany ? String(trackingCompany) : null,
        )
      : null,
    tracking_company_raw: trackingCompany ? String(trackingCompany) : null,
    tracking_number: trackingNumber ? String(trackingNumber) : null,
    tracking_url: trackingUrl ? String(trackingUrl) : null,
  };
}

export type ResolvedCarrier = "correios" | "jadlog" | "indeterminado";

/**
 * Fonte única de verdade da transportadora nos eventos automáticos.
 * A Lakma trabalha SOMENTE com Correios e Jadlog. Ordem:
 *   1. link de rastreio; 2. formato do código; 3. nome recebido apenas se já
 *   for Correios/Jadlog. Frenet/Other/Outra/UPS nunca decidem sozinhos.
 * Sem certeza → "indeterminado" (não inventa transportadora).
 */
export function resolveCarrier(
  trackingUrl: string | null | undefined,
  trackingNumber: string | null | undefined,
  trackingCompany: string | null | undefined,
): ResolvedCarrier {
  const url = String(trackingUrl ?? "").toLowerCase();
  if (url) {
    if (/frenet\.com\.br\/jad\b|frenet\.com\.br\/jad\//.test(url) || url.includes("jadlog")) return "jadlog";
    if (url.includes("correios.com.br") || url.includes("rastreamento.correios")) return "correios";
  }
  const code = String(trackingNumber ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (code) {
    if (/^[A-Z]{2}\d{9}BR$/.test(code)) return "correios";
    if (/^\d{9}$/.test(code)) return "jadlog";
  }
  const name = String(trackingCompany ?? "").trim().toLowerCase();
  if (name === "correios" || name.startsWith("correios")) return "correios";
  if (name === "jadlog" || name.startsWith("jadlog")) return "jadlog";
  return "indeterminado";
}

/** Template + variáveis (body) para cada tipo de evento. */
export function buildTemplateMessage(n: NormalizedShopify, couponFreeText?: string): {
  template_name: string;
  template_language: string;
  variables: string[];
  preview: string;
} | null {
  const first = (n.customer_name || "Cliente").split(" ")[0];
  const orderRaw = n.order_number || cleanOrderNumber(n.order_id) || null;
  const order = orderRaw ? `#${orderRaw}` : "-";


  if (n.event_kind === "order_confirmed") {
    const total = n.total
      ? (n.currency || "BRL") === "BRL"
        ? `R$ ${Number(n.total).toFixed(2).replace(".", ",")}`
        : `${n.currency} ${n.total}`
      : "-";
    return {
      template_name: "pedido_confirmado",
      template_language: "pt_BR",
      variables: [first, order, total],
      preview: `Oi, ${first}! Recebemos seu pedido ${order} (${total}). Já estamos preparando tudo e te aviso assim que ele for enviado. 💛`,
    };
  }

  if (n.event_kind === "order_shipped") {
    // Transportadora já resolvida por resolveCarrier (somente correios/jadlog).
    // Indeterminado NÃO gera mensagem: nunca afirmar transportadora nem mostrar
    // Frenet/Other ao cliente.
    const code = n.tracking_number || "-";
    if (n.tracking_company === "correios") {
      return {
        template_name: "pedido_enviado_correios",
        template_language: "pt_BR",
        variables: [first, order, code],
        preview: `Boa notícia, ${first}! Seu pedido ${order} foi enviado pelos Correios.\n\nCódigo de rastreio: ${code}\n\nAcompanhe sua entrega em:\nhttps://rastreamento.correios.com.br/`,
      };
    }
    if (n.tracking_company === "jadlog") {
      return {
        template_name: "pedido_enviado_jadlog",
        template_language: "pt_BR",
        variables: [first, order, code],
        preview: `Boa notícia, ${first}! Seu pedido ${order} foi enviado pela Jadlog.\n\nCódigo de rastreio: ${code}\n\nAcompanhe sua entrega em:\nhttps://www.jadlog.com.br/jadlog/rastreie`,
      };
    }
    return null;
  }

  return couponFreeText ? null : null;
}
