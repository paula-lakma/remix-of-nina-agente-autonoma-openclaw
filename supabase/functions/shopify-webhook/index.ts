/**
 * POST /shopify-webhook
 *
 * Recebe QUALQUER JSON da Shopify (orders/create, orders/paid, fulfillments/*),
 * grava o payload bruto em public.shopify_events, normaliza os campos úteis e
 * enfileira um template do WhatsApp para o cliente em send_queue.
 *
 * Auth: público (sem token). Se SHOPIFY_WEBHOOK_TOKEN existir, o token é exigido.
 * Responde 200 rápido; o processamento acontece em background.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildTemplateMessage, normalizeShopifyPayload } from "../_shared/shopify.ts";
import {
  acquireCoordinatedLock,
  buildTrackingKey,
  releaseCoordinatedLock,
  sharedLockActiveForKey,
} from "../_shared/tracking_lock.ts";

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

async function isValidHmac(secret: string, rawBody: string, provided: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
    if (expected.length !== provided.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
    return diff === 0;
  } catch (e) {
    console.error("[shopify-webhook] erro ao validar HMAC:", e);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const rawText = await req.text();

  // Validação obrigatória da assinatura da Shopify (HMAC-SHA256 do corpo bruto).
  const secret = Deno.env.get("SHOPIFY_WEBHOOK_SECRET") || "";
  const providedHmac = req.headers.get("x-shopify-hmac-sha256") || "";
  if (!secret) {
    console.error("[shopify-webhook] SHOPIFY_WEBHOOK_SECRET não configurado");
    return json({ error: "invalid_hmac", reason: "secret_not_configured" }, 401);
  }
  if (!providedHmac || !(await isValidHmac(secret, rawText, providedHmac))) {
    console.warn("[shopify-webhook] invalid_hmac: assinatura ausente ou inválida");
    return json({ error: "invalid_hmac" }, 401);
  }

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

  const webhookId = req.headers.get("x-shopify-webhook-id");

  const work = process(supabase, topic, body, webhookId).catch((e) =>
    console.error("[shopify-webhook] erro no processamento:", e)
  );
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
  else await work;

  return json({ received: true });
});

async function process(supabase: Any, topic: string, body: Any, webhookId: string | null = null) {
  const n = normalizeShopifyPayload(topic, body, webhookId);
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

  // Rastreio obrigatório para avisos de envio
  if (n.event_kind === "order_shipped" && !n.tracking_number) {
    return await fail("no_tracking", "Evento de envio sem código de rastreio");
  }

  // Transportadora não identificada com segurança: não envia e registra.
  if (n.event_kind === "order_shipped" && n.tracking_company !== "correios" && n.tracking_company !== "jadlog") {
    return await fail(
      "skipped_carrier_unknown",
      `Transportadora indeterminada (origem: ${n.tracking_company_raw ?? "vazio"}); aviso não enviado`,
    );
  }

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

  // Dedup atômico de rastreio: UNIQUE(fulfillment_id, tracking_number).
  // Se o insert falhar por conflito, só é permitido retomar quando o registro está "failed".
  let notificationId: string | null = null;
  let notificationRetried = false;
  let trackingKey: string | null = null;
  if (n.event_kind === "order_shipped") {
    const fulfillmentKey = n.fulfillment_id || n.order_id || n.order_number || "unknown";

    // INTERRUPTOR EXCLUSIVO — checado ANTES das novas RPCs.
    // Chave canônica = SOMENTE o rastreio normalizado.
    const candidateKey = buildTrackingKey(n.tracking_number);
    if (sharedLockActiveForKey(candidateKey, n.phone)) {
      trackingKey = candidateKey;
      const acq = await acquireCoordinatedLock(supabase, {
        fulfillmentId: fulfillmentKey,
        trackingNumber: n.tracking_number!,
        orderNumber: n.order_number,
        phoneNumber: n.phone,
        customerName: n.customer_name,
        carrier: n.tracking_company ?? null,
        templateName: msg.template_name,
        eventId: eventId,
      });
      if (!acq.acquired) {
        console.log("[shopify-webhook] rastreio já notificado (trava compartilhada):", acq.reason);
        return await fail(
          "skipped_duplicate",
          `Rastreio ${n.tracking_number} já notificado (${acq.reason})`,
        );
      }
      notificationId = acq.notification_id ?? null;
      notificationRetried = !!acq.legacy_retried;
    } else {
      // ---- FLUXO LEGADO (inalterado) ----
      const { data: notif, error: notifErr } = await supabase
        .from("shopify_shipment_notifications")
        .insert({
          fulfillment_id: fulfillmentKey,
          tracking_number: n.tracking_number,
          order_number: n.order_number,
          phone_number: n.phone,
          event_id: eventId,
          status: "processing",
        })
        .select("id")
        .maybeSingle();

      if (notifErr) {
        // Retry seguro: só reivindica se o registro existente estiver "failed".
        const { data: retried } = await supabase
          .from("shopify_shipment_notifications")
          .update({ status: "processing", event_id: eventId })
          .eq("fulfillment_id", fulfillmentKey)
          .eq("tracking_number", n.tracking_number)
          .eq("status", "failed")
          .select("id")
          .maybeSingle();

        if (!retried) {
          console.log("[shopify-webhook] rastreio já notificado, ignorando:", fulfillmentKey, n.tracking_number);
          return await fail(
            "skipped_duplicate",
            `Rastreio ${n.tracking_number} já notificado para o fulfillment ${fulfillmentKey}`,
          );
        }
        notificationId = retried.id;
        notificationRetried = true;
        console.log("[shopify-webhook] reprocessando rastreio que havia falhado:", fulfillmentKey, n.tracking_number);
      } else {
        notificationId = notif?.id ?? null;
      }
    }
  }

  // Libera a trava de rastreio caso o envio não chegue a ser enfileirado.
  const releaseLock = async () => {
    if (!notificationId) return;
    if (trackingKey) {
      await releaseCoordinatedLock(supabase, {
        trackingKey,
        fulfillmentId: n.fulfillment_id || n.order_id || n.order_number || "unknown",
        trackingNumber: n.tracking_number!,
        result: "failed",
        errorMessage: "falha antes da fila",
      });
      return;
    }
    if (notificationRetried) {
      await supabase.from("shopify_shipment_notifications").update({ status: "failed" }).eq("id", notificationId);
    } else {
      await supabase.from("shopify_shipment_notifications").delete().eq("id", notificationId);
    }
  };


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
    if (cErr) { await releaseLock(); return await fail("error", `Falha ao criar contato: ${cErr.message}`); }
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
    if (convErr) { await releaseLock(); return await fail("error", `Falha ao criar conversa: ${convErr.message}`); }
    conversationId = newConv.id;
  }

  const queueMetadata: Any = {
    source: "shopify",
    topic: n.topic,
    shopify_event_id: eventId,
    template_name: msg.template_name,
    template_language: msg.template_language,
    template_variables: { body: msg.variables },
  };
  // Só com o interruptor ligado o item carrega a chave para o whatsapp-sender liquidar a trava.
  if (trackingKey) {
    queueMetadata.tracking_key = trackingKey;
    queueMetadata.tracking_number = n.tracking_number;
    queueMetadata.fulfillment_id = n.fulfillment_id || n.order_id || n.order_number || "unknown";
  }

  const { data: queued, error: qErr } = await supabase.from("send_queue").insert({
    conversation_id: conversationId,
    contact_id: contactId,
    message_type: "template",
    from_type: "nina",
    content: msg.preview,
    priority: 5,
    status: "pending",
    metadata: queueMetadata,
  }).select("id").maybeSingle();

  if (qErr) { await releaseLock(); return await fail("error", `Falha ao enfileirar: ${qErr.message}`); }

  if (trackingKey) {
    // 'queued' (não 'sent'): o aceite real da Meta é registrado pelo whatsapp-sender.
    await releaseCoordinatedLock(supabase, {
      trackingKey,
      fulfillmentId: n.fulfillment_id || n.order_id || n.order_number || "unknown",
      trackingNumber: n.tracking_number!,
      result: "queued",
      sendQueueId: queued?.id ?? null,
    });
  } else if (notificationId) {
    await supabase.from("shopify_shipment_notifications").update({ status: "sent" }).eq("id", notificationId);
  }

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
