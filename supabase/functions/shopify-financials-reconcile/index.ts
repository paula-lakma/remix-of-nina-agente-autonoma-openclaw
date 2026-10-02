/**
 * POST /shopify-financials-reconcile — Vendas V2 Passo 6.
 * Etapa A: SOMENTE mode=dry_run (zero escrita). Qualquer outro modo é recusado.
 * Acesso: X-Panel-Token (Vault), chave interna ou admin autenticado. Anon/usuário comum: 401/403.
 * Este arquivo só LÊ do banco (select). Não chama apply_order_financials, lease nem grava cursor.
 */
import { corsHeaders, errorResponse, jsonResponse, adminClient, validatePanelToken } from "../_shared/panel.ts";
import { getJwtUser } from "../_shared/userauth.ts";
import { getAccessToken, orderGid, fetchOrderFinancials, computeOrderFinancials, buildFinancialsApplyPayload } from "../_shared/shopify_admin.ts";
import { runDryRun, gqlWithCost, type LocalOrder } from "../_shared/financial_reconcile.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

const COLS = "id, order_number, source_order_id, financial_status, financials_verified_at";

async function authorize(req: Request, db: Any): Promise<Response | null> {
  if (await validatePanelToken(req)) return null;
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

const toLocal = (r: Any): LocalOrder => ({ id: r.id, order_number: r.order_number ?? null, source_order_id: String(r.source_order_id),
  financial_status: r.financial_status ?? null, financials_verified_at: r.financials_verified_at ?? null });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  const db = adminClient();
  const denied = await authorize(req, db);
  if (denied) return denied;

  let body: Any = {};
  try { body = await req.json(); } catch { /* vazio */ }
  if (body?.mode !== "dry_run") return errorResponse("Etapa A: somente mode=dry_run habilitado", 400);

  const shop = Deno.env.get("SHOPIFY_SHOP_DOMAIN") || "";
  const clientId = Deno.env.get("SHOPIFY_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("SHOPIFY_CLIENT_SECRET") || "";
  if (!shop || !clientId || !clientSecret) return jsonResponse({ ok: false, stage: "secrets", writes: 0 }, 200);
  let token: string;
  try { token = await getAccessToken(shop, clientId, clientSecret); }
  catch (e) { return jsonResponse({ ok: false, stage: "auth", writes: 0, error: (e as Error).message }, 200); }

  const report = await runDryRun({
    now: () => new Date(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    gql: (q, v) => gqlWithCost(shop, token, q, v),
    loadLocalBySource: async (ids) => {
      const out: LocalOrder[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await db.from("orders").select(COLS).eq("source", "shopify").in("source_order_id", ids.slice(i, i + 200));
        if (error) throw new Error(`db_orders:${error.message}`);
        out.push(...(data || []).map(toLocal));
      }
      return out;
    },
    loadPendingMixed: async () => {
      const { data: refs, error } = await db.from("order_refunds").select("order_id").in("financial_status", ["pending", "mixed"]);
      if (error) throw new Error(`db_refunds:${error.message}`);
      const ids = [...new Set((refs || []).map((r: Any) => r.order_id))];
      if (!ids.length) return [];
      const { data, error: e2 } = await db.from("orders").select(COLS).in("id", ids);
      if (e2) throw new Error(`db_orders:${e2.message}`);
      return (data || []).map(toLocal);
    },
    loadUnverifiedRecent: async (since) => {
      const { data, error } = await db.from("orders").select(COLS).eq("source", "shopify").eq("financial_status", "paid")
        .is("financials_verified_at", null).gte("created_at_source", since).limit(1000);
      if (error) throw new Error(`db_orders:${error.message}`);
      return (data || []).map(toLocal);
    },
    fetchFinancials: (sid) => fetchOrderFinancials(shop, token, orderGid(sid)),
    compute: computeOrderFinancials,
    buildPayload: buildFinancialsApplyPayload,
  });
  return jsonResponse(report);
});
