/**
 * POST /shopify-refunds-webhook — recebe refunds/create da Shopify.
 * Valida HMAC do corpo bruto; grava só 1 linha na caixa de entrada (dedupe por X-Shopify-Webhook-Id); responde rápido.
 * Não consulta GraphQL, não toca orders/order_refunds. Separada do shopify-webhook operacional.
 */
import { adminClient } from "../_shared/panel.ts";
import { verifyShopifyHmac, parseRefundWebhook, REFUNDS_TOPIC } from "../_shared/shopify_financial_inbox.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const rawBody = await req.text();
  const secret = Deno.env.get("SHOPIFY_WEBHOOK_SECRET") || "";
  if (!(await verifyShopifyHmac(secret, rawBody, req.headers.get("x-shopify-hmac-sha256")))) {
    return json({ error: "invalid_hmac" }, 401);
  }

  const topic = (req.headers.get("x-shopify-topic") || "").trim().toLowerCase();
  if (topic !== REFUNDS_TOPIC) return json({ ok: true, ignored: true, reason: "topic_nao_suportado" }, 200);

  const webhookId = (req.headers.get("x-shopify-webhook-id") || "").trim();
  if (!webhookId || webhookId.length > 200) return json({ ok: false, error: "webhook_id_ausente" }, 400);

  const parsed = parseRefundWebhook(rawBody);
  if (!parsed.ok) return json({ ok: false, error: parsed.reason }, 400);

  const db = adminClient();
  const { data, error } = await db.from("shopify_financial_inbox")
    .upsert({ webhook_id: webhookId, topic, shopify_order_id: parsed.orderId, shopify_refund_id: parsed.refundId, payload: parsed.payload },
      { onConflict: "webhook_id", ignoreDuplicates: true })
    .select("id");
  if (error) {
    console.error("[shopify-refunds-webhook] falha ao gravar na caixa de entrada:", error.message);
    return json({ ok: false, error: "inbox_write_failed" }, 500); // Shopify reenvia
  }
  const duplicate = !data || data.length === 0;

  // Linhas do autoteste fictício não acordam o worker (o teste roda o worker manualmente).
  if (!duplicate && !webhookId.startsWith("lakma-selftest-")) {
    // Melhor esforço: acorda o worker. A garantia é a linha pending na caixa de entrada.
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (url && key) {
      const wake = fetch(`${url}/functions/v1/shopify-financials-worker`, {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: "{}",
      }).catch(() => {});
      // deno-lint-ignore no-explicit-any
      (globalThis as any).EdgeRuntime?.waitUntil?.(wake);
    }
  }
  return json({ ok: true, duplicate }, 200);
});
