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
