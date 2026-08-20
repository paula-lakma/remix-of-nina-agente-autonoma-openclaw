// FASE 2B3 — FUNÇÃO TEMPORÁRIA DE TESTE (REMOVER APÓS O TESTE).
// Assina um payload sintético com o SHOPIFY_WEBHOOK_SECRET e o entrega ao shopify-webhook.
// Não envia WhatsApp e não toca em nenhuma tabela.

const PANEL = "b3-test";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("no", { status: 405 });
  const token = req.headers.get("x-panel-token") || "";
  if (token !== PANEL) return new Response("forbidden", { status: 403 });

  const { payload, topic } = await req.json();
  const raw = JSON.stringify(payload);
  const secret = Deno.env.get("SHOPIFY_WEBHOOK_SECRET") || "";
  if (!secret) return new Response(JSON.stringify({ error: "no_secret" }), { status: 500 });

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hmac = btoa(String.fromCharCode(...new Uint8Array(sig)));

  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/shopify-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-shopify-topic": topic,
      "x-shopify-hmac-sha256": hmac,
    },
    body: raw,
  });
  return new Response(
    JSON.stringify({ status: res.status, body: await res.text() }),
    { headers: { "Content-Type": "application/json" } },
  );
});
