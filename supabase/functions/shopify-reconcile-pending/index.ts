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
  classifyStatusPilot, buildStatusPayload, REFUND_AUDIT_ALLOWLIST, fetchRefundAudit, summarizeRefundAudit, validateFullRefund, reconciledStatusEventKey, lineItemSignature,
  fetchAccessScopes, fetchOrderRawDiag,
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
  if (!["auth_check", "dry_run", "pilot", "precision_check", "status_pilot", "refund_audit", "scope_check"].includes(String(body.mode))) {
    return errorResponse("Modos habilitados: auth_check, dry_run, pilot, precision_check, status_pilot, refund_audit, scope_check", 400);
  }
  if (body.mode === "pilot" || body.mode === "status_pilot") {
    const ids = body.source_order_ids;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 3 || !ids.every((x) => /^\d{6,20}$/.test(String(x)))) {
      return errorResponse(`${body.mode} exige 1 a 3 source_order_ids numéricos`, 400);
    }
  }
  if ((body.mode === "auth_check" || body.mode === "precision_check") && (!body.source_order_id || !/^\d{6,20}$/.test(String(body.source_order_id)))) {
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


  if (body.mode === "scope_check") {
    // SOMENTE LEITURA: lê escopos concedidos; só se read_all_orders existir, lê 1 pedido de julho/2026. Nenhuma gravação.
    let scopes: string[];
    try { scopes = await fetchAccessScopes(shop, token); }
    catch (e) { return jsonResponse({ ok: false, mode: "scope_check", stage: "scopes", writes: 0, error: (e as Error).message }, 200); }
    const has = { read_orders: scopes.includes("read_orders"), read_all_orders: scopes.includes("read_all_orders") };
    // App merchant-owned: read_all_orders ausente NÃO interrompe; testa empiricamente o histórico com read_orders.
    const { data: ord } = await db.from("orders").select("id, order_number, source_order_id, created_at_source")
      .eq("source", "shopify").eq("valid_order", true)
      .gte("created_at_source", "2026-07-01T03:00:00Z").lt("created_at_source", "2026-08-01T03:00:00Z")
      .order("created_at_source", { ascending: true }).limit(1).maybeSingle();
    if (!ord) return jsonResponse({ ok: true, mode: "scope_check", writes: 0, scopes, has, july_order: null, note: "nenhum pedido válido de julho no banco" });
    const { data: items } = await db.from("order_items").select("source_line_item_id, quantity").eq("order_id", ord.id);
    const gid = orderGid(String(ord.source_order_id));
    const july_order = { order_number: ord.order_number, source_order_id: String(ord.source_order_id), gid,
      created_at_source: ord.created_at_source, db_items: (items || []).length };
    // Diagnóstico bruto (somente leitura) quando a leitura falha: status HTTP, x-request-id, corpo.
    const rawDiag = () => fetchOrderRawDiag(shop, token, gid);
    try {
      const f = await fetchOrderWithAllItems(shop, token, gid);
      if (!f.found) {
        return jsonResponse({ ok: true, mode: "scope_check", writes: 0, scopes, has, july_order, historical_access: false,
          read: { found: false }, diagnostic: await rawDiag() });
      }
      const shopIds = f.lineItems.map((l) => String(l.id).replace("gid://shopify/LineItem/", "")).sort();
      const dbIds = (items || []).map((i: Any) => String(i.source_line_item_id)).sort();
      return jsonResponse({ ok: true, mode: "scope_check", writes: 0, api_version: SHOPIFY_API_VERSION, scopes, has, july_order,
        historical_access: true,
        read: { found: true, gid: f.order?.id ?? null, gid_match: f.order?.id === gid, name: f.order?.name ?? null,
          complete: f.complete, pages: f.pages, financial: f.order?.displayFinancialStatus ?? null,
          shopify_items: f.lineItems.length, db_items: dbIds.length,
          items_match: JSON.stringify(shopIds) === JSON.stringify(dbIds), shopify_item_ids: shopIds, db_item_ids: dbIds } });
    } catch (e) {
      return jsonResponse({ ok: false, mode: "scope_check", writes: 0, scopes, has, stage: "july_read", july_order,
        historical_access: false, error: (e as Error).message, diagnostic: await rawDiag() }, 200);
    }
  }

  if (body.mode === "refund_audit") {
    // SOMENTE LEITURA: allowlist fixa, nenhuma gravação.
    const { data: ords } = await db.from("orders").select("order_number, source_order_id, financial_status")
      .eq("source", "shopify").in("order_number", [...REFUND_AUDIT_ALLOWLIST]);
    const results: Any[] = [];
    for (const num of REFUND_AUDIT_ALLOWLIST) {
      const ord = (ords || []).find((x: Any) => x.order_number === num);
      if (!ord) { results.push({ order_number: num, error: "pedido não existe no banco" }); continue; }
      try {
        const a = await fetchRefundAudit(shop, token, orderGid(String(ord.source_order_id)));
        results.push({ order_number: num, db_status: ord.financial_status, found: a.found, issues: a.issues,
          audit: a.order ? summarizeRefundAudit(a.order, a.complete) : null });
      } catch (e) {
        results.push({ order_number: num, db_status: ord.financial_status, error: (e as Error).message, audit: null });
      }
    }
    return jsonResponse({ ok: true, mode: "refund_audit", writes: 0, api_version: SHOPIFY_API_VERSION, results });
  }

  if (body.mode === "status_pilot") {
    const results: Any[] = [];
    for (const sid of body.source_order_ids!) {
      const r: Any = { source_order_id: sid };
      const { data: ord } = await db.from("orders")
        .select("order_number, financial_status, source_event_id").eq("source", "shopify").eq("source_order_id", sid).maybeSingle();
      if (!ord) { results.push({ ...r, result: "stopped", reason: "pedido não existe no banco" }); continue; }
      r.order_number = ord.order_number;
      if (ord.financial_status !== "pending") { results.push({ ...r, result: "stopped", reason: `banco não está pending (${ord.financial_status})` }); continue; }
      const { data: ev } = await db.from("shopify_events").select("raw_text:raw_payload::text").eq("id", ord.source_event_id).maybeSingle();
      const rawText: string = (ev as Any)?.raw_text || "";
      let basePayload: Any = null;
      try { basePayload = rawText ? losslessParse(rawText) : null; } catch { basePayload = null; }
      if (!basePayload?.line_items) { results.push({ ...r, result: "stopped", reason: "payload base ausente" }); continue; }
      const gid = orderGid(sid);
      let f;
      try { f = await fetchOrderWithAllItems(shop, token, gid); }
      catch (e) { results.push({ ...r, result: "stopped", reason: `erro Shopify: ${(e as Error).message}` }); continue; }
      const items = f.found && f.complete ? compareLineItems(basePayload.line_items, f.lineItems.map((l) => l.id)) : undefined;
      // Quantidades: base x Shopify por GID.
      const shopQty = new Map(f.lineItems.map((l) => [l.id, l.quantity]));
      const qtyOk = items === "ok" && (basePayload.line_items as Any[]).every((li) => Number(li.quantity) === shopQty.get(li.admin_graphql_api_id));
      const upd = f.order?.updatedAt;
      const c = classifyStatusPilot({ dbStatus: ord.financial_status, found: f.found, complete: f.complete,
        financial: f.order?.displayFinancialStatus, cancelledAt: f.order?.cancelledAt, items: items === "ok" && !qtyOk ? "divergente" : items,
        shopifyUpdatedAt: upd, baseUpdatedAt: basePayload.updated_at },
        (REFUND_AUDIT_ALLOWLIST as readonly string[]).includes(String(ord.order_number)));
      r.shopify = { financial: f.order?.displayFinancialStatus, cancelledAt: f.order?.cancelledAt ?? null, updatedAt: upd,
        base_updated_at: basePayload.updated_at, line_items: f.lineItems.length, items_compare: items, quantities_ok: qtyOk, complete: f.complete };
      if (!c.eligible) { results.push({ ...r, result: "stopped", reason: c.reason }); continue; }
      if (String(f.order.displayFinancialStatus).toUpperCase() === "REFUNDED") {
        let fin: Any = null;
        try { const a = await fetchRefundAudit(shop, token, gid); fin = a.order ? summarizeRefundAudit(a.order, a.complete) : null; }
        catch (e) { results.push({ ...r, result: "stopped", reason: `erro auditoria financeira: ${(e as Error).message}` }); continue; }
        r.financial = fin && { received: fin.received, refunded: fin.refunded, net_payment: fin.net_payment, transactions: fin.transactions };
        const v = validateFullRefund(fin);
        if (!v.ok) { results.push({ ...r, result: "stopped", reason: v.reason }); continue; }
      }
      const key = reconciledStatusEventKey(gid, upd);
      const payload = buildStatusPayload(basePayload, f.order.displayFinancialStatus, upd);
      const bodyText = losslessStringify({
        topic: "orders/reconciled_status", send_status: "reconciled", shopify_event_id: key,
        order_number: ord.order_number, raw_payload: payload,
        normalized: { reconciled: true, source: "shopify-reconcile-pending", mode: "status_pilot", status: String(f.order.displayFinancialStatus).toLowerCase() },
      });
      if (lineItemSignature(bodyText) !== lineItemSignature(rawText)) {
        results.push({ ...r, result: "stopped", reason: "IDs/quantidades dos itens mudariam; nada gravado" }); continue;
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
    return jsonResponse({ ok: true, mode: "status_pilot", api_version: SHOPIFY_API_VERSION, results });
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

  if (body.mode === "precision_check") {
    // SOMENTE LEITURA: monta o payload que seria gravado e compara IDs; nunca grava.
    const sid = String(body.source_order_id);
    const { data: ord } = await db.from("orders").select("order_number, financial_status, source_event_id")
      .eq("source", "shopify").eq("source_order_id", sid).maybeSingle();
    if (!ord) return jsonResponse({ ok: false, writes: 0, reason: "pedido não existe no banco" });
    const { data: ev } = await db.from("shopify_events").select("raw_text:raw_payload::text").eq("id", ord.source_event_id).maybeSingle();
    const rawText: string = (ev as Any)?.raw_text || "";
    const basePayload: Any = rawText ? losslessParse(rawText) : null;
    const gid = orderGid(sid);
    const f = await fetchOrderWithAllItems(shop, token, gid);
    const items = f.found && f.complete ? compareLineItems(basePayload?.line_items, f.lineItems.map((l) => l.id)) : undefined;
    const c = classifyOrder({ found: f.found, complete: f.complete, financial: f.order?.displayFinancialStatus, cancelledAt: f.order?.cancelledAt, items });
    const payload = f.order ? buildReconciledPayload(basePayload, f.order) : null;
    const bodyText = payload ? losslessStringify({ raw_payload: payload }) : "";
    const pick = (t: string) => {
      const li = t.match(/"line_items":\s*\[.*\]/s)?.[0] || "";
      return {
        id: (li.match(/"id":\s*(\d+)/g) || []).map((x) => x.replace(/\D/g, "")),
        product_id: (li.match(/"product_id":\s*(\d+)/g) || []).map((x) => x.replace(/\D/g, "")),
        variant_id: (li.match(/"variant_id":\s*(\d+)/g) || []).map((x) => x.replace(/\D/g, "")),
        gid: li.match(/gid:\/\/shopify\/LineItem\/\d+/g) || [],
      };
    };
    const before = pick(rawText), after = pick(bodyText);
    const identical = JSON.stringify(before) === JSON.stringify(after);
    return jsonResponse({ ok: true, mode: "precision_check", writes: 0, api_version: SHOPIFY_API_VERSION,
      order_number: ord.order_number, db_status: ord.financial_status, found: f.found, complete: f.complete,
      financial: f.order?.displayFinancialStatus, line_items: f.lineItems.length, shopify_gids: f.lineItems.map((l) => l.id),
      items_compare: items, classification: c.cls, eligible: c.eligible, before, after, identical });
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
