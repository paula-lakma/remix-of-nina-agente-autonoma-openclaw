/**
 * POST /shopify-financials-worker — processa a caixa de entrada financeira.
 * Acesso: chamada interna com a chave de serviço, ou admin autenticado (execução manual). Público/anon/usuário comum: 401/403.
 * Grava só via apply_order_financials (atômico). Nunca cria pedidos. Sem agendamento neste passo.
 */
import { corsHeaders, errorResponse, jsonResponse, adminClient } from "../_shared/panel.ts";
import { getJwtUser } from "../_shared/userauth.ts";
import { getAccessToken, orderGid, fetchOrderFinancials, computeOrderFinancials, buildFinancialsApplyPayload } from "../_shared/shopify_admin.ts";
import { processInboxItem } from "../_shared/shopify_financial_inbox.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

async function authorize(req: Request, db: Any): Promise<Response | null> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (token && serviceKey && token.length === serviceKey.length) {
    let diff = 0;
    for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ serviceKey.charCodeAt(i);
    if (diff === 0) return null;
  }
  const user = await getJwtUser(req);
  if (!user) return errorResponse("Não autorizado", 401);
  const { data: isAdmin } = await db.rpc("has_role", { _user_id: user.id, _role: "admin" });
  return isAdmin ? null : errorResponse("Somente admin", 403);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  const db = adminClient();
  const denied = await authorize(req, db);
  if (denied) return denied;

  let limit = 10;
  try { const b = await req.json(); if (Number.isInteger(b?.limit)) limit = Math.min(Math.max(b.limit, 1), 25); } catch { /* corpo vazio */ }

  const { data: items, error } = await db.rpc("claim_shopify_financial_inbox", { p_limit: limit });
  if (error) return jsonResponse({ ok: false, stage: "claim", error: error.message }, 200);
  if (!items?.length) return jsonResponse({ ok: true, claimed: 0, results: [] });

  const shop = Deno.env.get("SHOPIFY_SHOP_DOMAIN") || "";
  let tokenPromise: Promise<string> | null = null;
  const token = () => (tokenPromise ??= getAccessToken(shop, Deno.env.get("SHOPIFY_CLIENT_ID") || "", Deno.env.get("SHOPIFY_CLIENT_SECRET") || ""));

  const deps = {
    findOrder: async (sid: string) => {
      const { data } = await db.from("orders").select("id").eq("source", "shopify").eq("source_order_id", sid).maybeSingle();
      return data ? { id: data.id as string } : null;
    },
    fetchFinancials: async (sid: string) => fetchOrderFinancials(shop, await token(), orderGid(sid)),
    compute: computeOrderFinancials,
    buildPayload: buildFinancialsApplyPayload,
    apply: async (orderId: string, refunds: Any[], summary: Any) => {
      const { error } = await db.rpc("apply_order_financials", { p_order_id: orderId, p_refunds: refunds, p_summary: summary });
      return { error: error?.message ?? null };
    },
    mark: async (id: string, patch: Record<string, Any>) => {
      const { error } = await db.from("shopify_financial_inbox").update(patch).eq("id", id);
      if (error) throw new Error(`mark:${error.message}`);
    },
    now: () => new Date(),
  };

  const results: Any[] = [];
  for (const it of items) {
    const r = await processInboxItem(it, deps);
    results.push({ id: it.id, webhook_id: it.webhook_id, shopify_order_id: it.shopify_order_id, attempts: it.attempts, ...r });
  }
  return jsonResponse({ ok: true, claimed: items.length, results });
});
