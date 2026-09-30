/**
 * POST /shopify-reconcile-pending — ETAPA 0 (somente auth_check).
 * Valida client credentials + read_orders consultando 1 pedido. Não grava nada.
 * Acesso: somente admin. Nunca retorna/registra segredos ou token.
 * Body: { mode: "auth_check", source_order_id: "<id numérico Shopify>" }
 */
import { corsHeaders, errorResponse, jsonResponse, adminClient } from "../_shared/panel.ts";
import { getJwtUser } from "../_shared/userauth.ts";
import { fetchOrderWithAllItems, getAccessToken, orderGid, SHOPIFY_API_VERSION } from "../_shared/shopify_admin.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const user = await getJwtUser(req);
  if (!user) return errorResponse("JWT inválido", 401);
  const { data: isAdmin } = await adminClient().rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (!isAdmin) return errorResponse("Somente admin", 403);

  let body: { mode?: string; source_order_id?: string };
  try { body = await req.json(); } catch { return errorResponse("Body JSON inválido", 400); }
  if (body.mode !== "auth_check") return errorResponse("Somente mode=auth_check está habilitado nesta etapa", 400);
  if (!body.source_order_id || !/^\d{6,20}$/.test(String(body.source_order_id))) {
    return errorResponse("source_order_id numérico obrigatório", 400);
  }

  const shop = Deno.env.get("SHOPIFY_SHOP_DOMAIN") || "";
  const clientId = Deno.env.get("SHOPIFY_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("SHOPIFY_CLIENT_SECRET") || "";
  const secrets = { SHOPIFY_SHOP_DOMAIN: !!shop, SHOPIFY_CLIENT_ID: !!clientId, SHOPIFY_CLIENT_SECRET: !!clientSecret };
  if (!shop || !clientId || !clientSecret) return jsonResponse({ ok: false, stage: "secrets", secrets }, 200);

  let token: string;
  try {
    token = await getAccessToken(shop, clientId, clientSecret);
  } catch (e) {
    return jsonResponse({ ok: false, stage: "auth", secrets, error: (e as Error).message }, 200);
  }

  try {
    const r = await fetchOrderWithAllItems(shop, token, orderGid(String(body.source_order_id)));
    return jsonResponse({
      ok: true, stage: "read", api_version: SHOPIFY_API_VERSION, secrets,
      auth: "ok", read_orders: "ok", found: r.found,
      order: r.order ? {
        name: r.order.name, legacyResourceId: r.order.legacyResourceId,
        displayFinancialStatus: r.order.displayFinancialStatus,
        displayFulfillmentStatus: r.order.displayFulfillmentStatus,
        updatedAt: r.order.updatedAt, cancelledAt: r.order.cancelledAt, test: r.order.test,
      } : null,
      line_items: r.lineItems.length, pages: r.pages, pagination_complete: r.complete,
    });
  } catch (e) {
    const msg = (e as Error).message;
    return jsonResponse({ ok: false, stage: "read", secrets, auth: "ok",
      read_orders: /ACCESS_DENIED|http_403/.test(msg) ? "denied" : "error", error: msg }, 200);
  }
});
