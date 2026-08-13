/**
 * POST /shopify-webhook?token=<SHOPIFY_WEBHOOK_TOKEN>
 *
 * Recebe QUALQUER JSON da Shopify (orders/create, orders/paid, fulfillments/*),
 * grava o payload bruto em public.shopify_events, normaliza os campos úteis e
 * enfileira um template do WhatsApp para o cliente em send_queue.
 *
 * Auth: token na query string (HMAC fica preparado, desativado até haver segredo).
 * Responde 200 rápido; o processamento acontece em background.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildTemplateMessage, normalizeShopifyPayload } from "../_shared/shopify.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-shopify-topic, x-shopify-hmac-sha256, x-shopify-shop-domain",
};

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

// deno-lint-ignore no-explicit-any
type Any = any;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Token é opcional: só valida se SHOPIFY_WEBHOOK_TOKEN estiver configurado.
  const expected = Deno.env.get("SHOPIFY_WEBHOOK_TOKEN") || "";
  if (expected) {
    const url = new URL(req.url);
    const provided = url.searchParams.get("token") || req.headers.get("x-shopify-token") || "";
    if (provided !== expected) {
      console.warn("[shopify-webhook] token inválido");
      return json({ error: "unauthorized" }, 401);
    }
  }


  const rawText = await req.text();
  let body: Any = {};
  try {
    body = rawText ? JSON.parse(rawText) : {};
  } catch {
    body = { _unparsed: rawText };
  }

  const topic =
    req.headers.get("x-shopify-topic") ||
    (typeof body?.topic === "string" ? body.topic : "") ||
    "unknown";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const work = process(supabase, topic, body).catch((e) =>
    console.error("[shopify-webhook] erro no processamento:", e)
  );
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
  else await work;

  return json({ received: true });
});

async function process(supabase: Any, topic: string, body: Any) {
  const n = normalizeShopifyPayload(topic, body);
  console.log("[shopify-webhook] topic:", n.topic, "kind:", n.event_kind, "order:", n.order_number);

  // Dedup por evento
  if (n.event_id) {
    const { data: dup } = await supabase
      .from("shopify_events")
      .select("id")
      .eq("shopify_event_id", n.event_id)
      .maybeSingle();
    if (dup) {
      console.log("[shopify-webhook] evento duplicado, ignorando:", n.event_id);
      return;
    }
  }

  const { data: event, error: insErr } = await supabase
    .from("shopify_events")
    .insert({
      topic: n.topic,
      shopify_event_id: n.event_id,
      order_number: n.order_number,
      phone_number: n.phone,
      raw_payload: body,
      normalized: n,
      send_status: "pending",
    })
    .select("id")
    .single();

  if (insErr) {
    console.error("[shopify-webhook] erro ao gravar evento:", insErr);
    return;
  }
  const eventId = event.id;

  const fail = (status: string, msg?: string) =>
    supabase.from("shopify_events").update({ send_status: status, error_message: msg ?? null }).eq("id", eventId);

  if (n.event_kind === "unknown") return await fail("ignored", `Tópico não tratado: ${n.topic}`);
  if (!n.phone) return await fail("no_phone", "Telefone do cliente não encontrado no payload");

  const msg = buildTemplateMessage(n);
  if (!msg) return await fail("no_template", "Sem template para este evento");

  // Template precisa estar aprovado na Meta
  const { data: tpl } = await supabase
    .from("meta_templates")
    .select("status")
    .eq("name", msg.template_name)
    .maybeSingle();
  if (!tpl || String(tpl.status).toUpperCase() !== "APPROVED") {
    return await fail("awaiting_template", `Template "${msg.template_name}" ainda não aprovado na Meta`);
  }

  // Contato (cria se não existir)
  let contactId: string;
  const { data: contact } = await supabase
    .from("contacts")
    .select("id, name")
    .eq("phone_number", n.phone)
    .maybeSingle();

  if (contact) {
    contactId = contact.id;
    if (!contact.name && n.customer_name) {
      await supabase.from("contacts").update({ name: n.customer_name }).eq("id", contactId);
    }
  } else {
    const { data: newContact, error: cErr } = await supabase
      .from("contacts")
      .insert({ phone_number: n.phone, whatsapp_id: n.phone, name: n.customer_name, user_id: null })
      .select("id")
      .single();
    if (cErr) return await fail("error", `Falha ao criar contato: ${cErr.message}`);
    contactId = newContact.id;
  }

  // Conversa ativa (cria se não existir)
  let conversationId: string;
  const { data: conv } = await supabase
    .from("conversations")
    .select("id")
    .eq("contact_id", contactId)
    .eq("is_active", true)
    .maybeSingle();

  if (conv) {
    conversationId = conv.id;
  } else {
    const { data: newConv, error: convErr } = await supabase
      .from("conversations")
      .insert({ contact_id: contactId, status: "nina", is_active: true, user_id: null })
      .select("id")
      .single();
    if (convErr) return await fail("error", `Falha ao criar conversa: ${convErr.message}`);
    conversationId = newConv.id;
  }

  const { error: qErr } = await supabase.from("send_queue").insert({
    conversation_id: conversationId,
    contact_id: contactId,
    message_type: "template",
    from_type: "nina",
    content: msg.preview,
    priority: 5,
    status: "pending",
    metadata: {
      source: "shopify",
      topic: n.topic,
      shopify_event_id: eventId,
      template_name: msg.template_name,
      template_language: msg.template_language,
      template_variables: { body: msg.variables },
    },
  });

  if (qErr) return await fail("error", `Falha ao enfileirar: ${qErr.message}`);

  await supabase
    .from("shopify_events")
    .update({ send_status: "queued", contact_id: contactId, conversation_id: conversationId, error_message: null })
    .eq("id", eventId);

  // Dispara o sender imediatamente (best-effort)
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-sender`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ triggered_by: "shopify-webhook" }),
    });
  } catch (e) {
    console.error("[shopify-webhook] falha ao acionar whatsapp-sender:", e);
  }
}
