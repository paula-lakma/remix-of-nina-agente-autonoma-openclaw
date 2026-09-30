/**
 * POST /shopify-reconcile-pending — somente leitura.
 * Modos: "auth_check" (Etapa 0, 1 pedido) e "dry_run" (Etapa 1, simulação).
 * auth_check/dry_run não gravam. pilot grava SOMENTE 1 evento orders/reconciled por pedido elegível.
 * Acesso: somente admin. Nunca retorna/registra segredos ou token.
 */
import { corsHeaders, errorResponse, jsonResponse, adminClient } from "../_shared/panel.ts";
import { getJwtUser } from "../_shared/userauth.ts";
import {
  losslessParse, losslessStringify, buildReconciledPayload, classifyOrder, compareLineItems, reconciledEventKey, fetchOrderWithAllItems, getAccessToken, orderGid, SHOPIFY_API_VERSION,
} from "../_shared/shopify_admin.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const user = await getJwtUser(req);
  if (!user) return errorResponse("JWT inválido", 401);
  const db = adminClient();
  const { data: isAdmin } = await db.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (!isAdmin) return errorResponse("Somente admin", 403);

  let body: { mode?: string; source_order_id?: string; source_order_ids?: string[] };
  try { body = await req.json(); } catch { return errorResponse("Body JSON inválido", 400); }
  if (body.mode !== "auth_check" && body.mode !== "dry_run" && body.mode !== "pilot") {
    return errorResponse("Modos habilitados: auth_check, dry_run, pilot", 400);
  }
  if (body.mode === "pilot") {
    const ids = body.source_order_ids;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 3 || !ids.every((x) => /^\d{6,20}$/.test(String(x)))) {
      return errorResponse("pilot exige 1 a 3 source_order_ids numéricos", 400);
    }
  }
  if (body.mode === "auth_check" && (!body.source_order_id || !/^\d{6,20}$/.test(String(body.source_order_id)))) {
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


  if (body.mode === "pilot") {
    const results: Any[] = [];
    for (const sid of body.source_order_ids!) {
      const r: Any = { source_order_id: sid };
      const { data: ord } = await db.from("orders")
        .select("order_number, financial_status, source_event_id").eq("source", "shopify").eq("source_order_id", sid).maybeSingle();
      if (!ord) { results.push({ ...r, result: "stopped", reason: "pedido não existe no banco" }); continue; }
      r.order_number = ord.order_number;
      if (ord.financial_status !== "pending") { results.push({ ...r, result: "stopped", reason: `banco não está pending (${ord.financial_status})` }); continue; }
      // Lido como texto e parseado sem perda: IDs numéricos grandes (itens, produto, variante) não podem ser arredondados.
      const { data: ev } = await db.from("shopify_events").select("raw_text:raw_payload::text").eq("id", ord.source_event_id).maybeSingle();
      let basePayload: Any = null;
      try { basePayload = (ev as Any)?.raw_text ? losslessParse((ev as Any).raw_text) : null; } catch { basePayload = null; }
      if (!basePayload?.line_items) { results.push({ ...r, result: "stopped", reason: "payload base ausente" }); continue; }
      const gid = orderGid(sid);
      let f;
      try { f = await fetchOrderWithAllItems(shop, token, gid); }
      catch (e) { results.push({ ...r, result: "stopped", reason: `erro Shopify: ${(e as Error).message}` }); continue; }
      const items = f.found && f.complete ? compareLineItems(basePayload.line_items, f.lineItems.map((l) => l.id)) : undefined;
      const c = classifyOrder({ found: f.found, complete: f.complete, financial: f.order?.displayFinancialStatus, cancelledAt: f.order?.cancelledAt, items });
      const upd = f.order?.updatedAt;
      const updOk = typeof upd === "string" && !isNaN(Date.parse(upd)) &&
        (!basePayload.updated_at || Date.parse(upd) >= Date.parse(String(basePayload.updated_at)));
      r.shopify = { financial: f.order?.displayFinancialStatus, cancelledAt: f.order?.cancelledAt ?? null, updatedAt: upd, line_items: f.lineItems.length, items_compare: items, complete: f.complete };
      if (!c.eligible) { results.push({ ...r, result: "stopped", reason: c.reason }); continue; }
      if (!updOk) { results.push({ ...r, result: "stopped", reason: "updatedAt inválido para normalização" }); continue; }
      const key = reconciledEventKey(gid, upd);
      const payload = buildReconciledPayload(basePayload, f.order);
      // Única gravação permitida: evento técnico; o gatilho existente chama sync_shopify_order_payload.
      const bodyText = losslessStringify({
        topic: "orders/reconciled", send_status: "reconciled", shopify_event_id: key,
        order_number: ord.order_number, raw_payload: payload,
        normalized: { reconciled: true, source: "shopify-reconcile-pending", mode: "pilot" },
      });
      // Proteção: os IDs dos itens no texto final devem ser idênticos aos do payload base.
      const idsOf = (t: string) => (t.match(/"line_items":\[.*\]/s)?.[0].match(/"id":\d+/g) || []).join(",");
      if (idsOf(bodyText) !== idsOf((ev as Any).raw_text.replace(/": /g, '":').replace(/, "/g, ',"'))) {
        results.push({ ...r, result: "stopped", reason: "IDs dos itens mudariam; nada gravado" }); continue;
      }
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/shopify_events?select=id`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=representation",
          apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        body: bodyText,
      });
      const resJson: Any = await res.json().catch(() => null);
      if (!res.ok) {
        const code = resJson?.code;
        results.push({ ...r, event_key: key, result: code === "23505" ? "already_reconciled" : "insert_error", reason: code === "23505" ? "evento já existe (idempotente)" : String(code || res.status) });
        continue;
      }
      const ins = Array.isArray(resJson) ? resJson[0] : null;
      results.push({ ...r, event_key: key, event_id: (ins as Any)?.id, result: "reconciled" });
    }
    return jsonResponse({ ok: true, mode: "pilot", api_version: SHOPIFY_API_VERSION, results });
  }

  if (body.mode === "dry_run") {
    // Somente SELECT.
    const { data: rows, error } = await db
      .from("orders")
      .select("source_order_id, order_number, created_at_source, financial_status, fulfillment_status, current_subtotal, total_amount, net_product_revenue, source_event_id")
      .eq("financial_status", "pending")
      .order("created_at_source", { ascending: true })
      .limit(500);
    if (error) return errorResponse("Falha ao ler pedidos pending", 500);
    const evIds = (rows || []).map((r: Any) => r.source_event_id).filter(Boolean);
    const base = new Map<string, Any[]>();
    for (let i = 0; i < evIds.length; i += 100) {
      const { data: evs } = await db.from("shopify_events").select("id, raw_payload->line_items").in("id", evIds.slice(i, i + 100));
      for (const e of evs || []) base.set((e as Any).id, (e as Any).line_items);
    }

    const results: Any[] = [];
    for (const r of rows || []) {
      let out: Any = {
        order_number: r.order_number, source_order_id: r.source_order_id,
        created_at_source: r.created_at_source, db_status: r.financial_status,
        db_fulfillment: r.fulfillment_status, net_product_revenue: r.net_product_revenue, total_amount: r.total_amount,
      };
      try {
        const f = await fetchOrderWithAllItems(shop, token, orderGid(String(r.source_order_id)));
        const items = f.found && f.complete ? compareLineItems(base.get(r.source_event_id), f.lineItems.map((l) => l.id)) : undefined;
        const c = classifyOrder({ found: f.found, complete: f.complete, financial: f.order?.displayFinancialStatus, cancelledAt: f.order?.cancelledAt, items });
        out = { ...out,
          shopify_financial: f.order?.displayFinancialStatus ?? null, cancelled: !!f.order?.cancelledAt,
          shopify_fulfillment: f.order?.displayFulfillmentStatus ?? null, shopify_updated_at: f.order?.updatedAt ?? null,
          line_items: f.lineItems.length, items_compare: items ?? null, classification: c.cls, eligible: c.eligible, reason: c.reason };
      } catch (e) {
        const c = classifyOrder({ found: false, complete: false, error: (e as Error).message });
        out = { ...out, classification: c.cls, eligible: false, reason: `${c.reason}: ${(e as Error).message}` };
      }
      results.push(out);
      await new Promise((res) => setTimeout(res, 250));
    }
    const counts: Record<string, number> = {};
    for (const x of results) counts[x.classification] = (counts[x.classification] || 0) + 1;
    return jsonResponse({ ok: true, mode: "dry_run", api_version: SHOPIFY_API_VERSION, writes: 0,
      pending_in_db: rows?.length ?? 0, consulted: results.length, counts,
      eligible: results.filter((x) => x.eligible).length, results });
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
