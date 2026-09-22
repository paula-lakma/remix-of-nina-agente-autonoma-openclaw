// send-manual-tracking
// Envio manual de código de rastreio pela equipe de expedição.
//
// FASE 2A: o interruptor de segurança está DESLIGADO por padrão.
// Enquanto MANUAL_TRACKING_SEND_ENABLED !== "true", a função valida tudo
// (auth, papel, campos, telefone, template APPROVED) e PARA antes de:
//   adquirir a trava · gravar histórico · inserir em send_queue ·
//   registrar mensagem no Chat ao Vivo · enviar WhatsApp.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getJwtUser } from "../_shared/userauth.ts";
import { cleanOrderNumber, normalizePhone } from "../_shared/shopify.ts";
import { buildTrackingKey } from "../_shared/tracking_lock.ts";

const CARRIERS = {
  correios: { label: "Correios", template: "pedido_enviado_correios" },
  jadlog: { label: "Jadlog", template: "pedido_enviado_jadlog" },
} as const;

type CarrierKey = keyof typeof CARRIERS;
// deno-lint-ignore no-explicit-any
type Any = any;

const TRACK_LINK: Record<CarrierKey, string> = {
  correios: "https://rastreamento.correios.com.br/",
  jadlog: "https://www.jadlog.com.br/jadlog/rastreie",
};

function buildPreview(carrier: CarrierKey, vars: string[]): string {
  const via = carrier === "correios" ? "pelos Correios" : "pela Jadlog";
  return `Boa notícia, ${vars[0]}! Seu pedido ${vars[1]} foi enviado ${via}.\n\nCódigo de rastreio: ${vars[2]}\n\nAcompanhe sua entrega em:\n${TRACK_LINK[carrier]}`;
}

// `rastreio`: funcionário da expedição cuja única função é enviar rastreio.
const ALLOWED_ROLES = ["admin", "manager", "expedicao", "rastreio"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // 1) Autenticação obrigatória
    const user = await getJwtUser(req);
    if (!user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 2) Autorização por papel (validada no backend)
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const roles = (roleRows || []).map((r: { role: string }) => r.role);
    const effectiveRole = ALLOWED_ROLES.find((r) => roles.includes(r));
    if (!effectiveRole) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));

    // 2.1) Sonda de estado (sem efeitos colaterais)
    if (body?.probe === true) {
      return json({
        ok: true,
        probe: true,
        role: effectiveRole,
        sending_enabled: (Deno.env.get("MANUAL_TRACKING_SEND_ENABLED") ?? "") === "true",
      }, 200);
    }

    // 3) Validação dos campos
    const customerName = String(body?.customer_name ?? "").trim();
    const rawPhone = String(body?.phone_number ?? "").trim();
    const rawOrder = String(body?.order_number ?? "").trim();
    const trackingNumber = String(body?.tracking_number ?? "").trim().toUpperCase();
    const carrier = String(body?.carrier ?? "").trim().toLowerCase() as CarrierKey;

    const fieldErrors: Record<string, string> = {};
    if (customerName.length < 2) fieldErrors.customer_name = "Informe o nome do cliente.";
    if (!rawOrder) fieldErrors.order_number = "Informe o número do pedido.";
    if (trackingNumber.length < 6) fieldErrors.tracking_number = "Código de rastreio inválido.";
    if (!CARRIERS[carrier]) fieldErrors.carrier = "Selecione Correios ou Jadlog.";

    const phone = normalizePhone(rawPhone);
    const phoneOk = !!phone && /^55\d{10,11}$/.test(phone);
    if (!phoneOk) fieldErrors.phone_number = "Telefone brasileiro inválido (DDD + número).";

    if (Object.keys(fieldErrors).length > 0) {
      return json({ error: "validation_error", fields: fieldErrors }, 400);
    }

    const orderNumber = cleanOrderNumber(rawOrder);
    const templateName = CARRIERS[carrier].template;

    // 4) Template precisa estar APPROVED (reconferido no backend)
    const { data: tpl } = await admin
      .from("meta_templates")
      .select("name, language, category, status, components")
      .eq("name", templateName)
      .eq("language", "pt_BR")
      .maybeSingle();

    if (!tpl || tpl.status !== "APPROVED") {
      return json({
        error: "template_not_approved",
        message: "Este template ainda não está aprovado pela Meta.",
        template_name: templateName,
        template_status: tpl?.status ?? null,
      }, 409);
    }

    const variables = [firstName(customerName), `#${orderNumber}`, trackingNumber];

    // 5) INTERRUPTOR DE SEGURANÇA — desligado por padrão
    const enabled = (Deno.env.get("MANUAL_TRACKING_SEND_ENABLED") ?? "") === "true";
    if (!enabled) {
      return json({
        ok: false,
        disabled: true,
        code: "sending_disabled",
        message:
          "Envio manual de rastreio está desativado. Nenhuma mensagem foi enviada e nenhum registro foi criado.",
        would_send: {
          template_name: templateName,
          carrier,
          language: "pt_BR",
          variables,
          phone_number: phone,
        },
      }, 200);
    }

    // 6) Trava compartilhada (mesma chave canônica da Shopify)
    let trackingKey: string;
    try {
      trackingKey = buildTrackingKey(trackingNumber);
    } catch {
      return json({ error: "validation_error", fields: { tracking_number: "Código de rastreio inválido." } }, 400);
    }

    const { data: acq, error: acqErr } = await admin.rpc("acquire_tracking_send_lock", {
      p_tracking_key: trackingKey,
      p_tracking_number: trackingNumber,
      p_source: "manual_tracking",
      p_carrier: carrier,
      p_template_name: templateName,
      p_order_number: orderNumber,
      p_phone_number: phone,
      p_customer_name: customerName,
      p_sent_by: user.id,
      p_fulfillment_id: null,
    });

    if (acqErr) {
      return json({ error: "lock_error", message: acqErr.message }, 500);
    }

    const acquired = !!(acq as Any)?.acquired;
    const logBase = {
      tracking_key: trackingKey,
      tracking_number: trackingNumber,
      carrier,
      template_name: templateName,
      order_number: orderNumber,
      phone_number: phone,
      customer_name: customerName,
      requested_by: user.id,
      requested_by_role: effectiveRole,
    };

    if (!acquired) {
      await admin.from("manual_tracking_logs").insert({
        ...logBase,
        status: "duplicate",
        result: String((acq as Any)?.existing_status ?? "duplicate"),
        error_message: "Este código de rastreio já foi enviado ou está em processamento.",
        lock_id: (acq as Any)?.lock_id ?? null,
      });
      return json({
        ok: false,
        code: "duplicate",
        message: "Este código de rastreio já foi enviado ao cliente. Nenhuma mensagem foi enviada.",
        existing_status: (acq as Any)?.existing_status ?? null,
      }, 409);
    }

    const lockId = (acq as Any)?.lock_id ?? null;

    // 7) Registro do histórico (fila)
    const { data: logRow, error: logErr } = await admin
      .from("manual_tracking_logs")
      .insert({ ...logBase, status: "processing", lock_id: lockId })
      .select("id")
      .maybeSingle();

    const failAndRelease = async (message: string, status = 500) => {
      await admin.rpc("release_tracking_send_lock", {
        p_tracking_key: trackingKey,
        p_result: "failed",
        p_send_queue_id: null,
        p_error_message: message,
      });
      if (logRow?.id) {
        await admin.from("manual_tracking_logs")
          .update({ status: "failed", error_message: message })
          .eq("id", logRow.id);
      }
      return json({ ok: false, code: "error", message }, status);
    };

    if (logErr) return await failAndRelease(`Falha ao registrar histórico: ${logErr.message}`);

    // 8) Contato + conversa (mesma lógica da Shopify)
    let contactId: string;
    const { data: contact } = await admin
      .from("contacts").select("id, name").eq("phone_number", phone).maybeSingle();
    if (contact) {
      contactId = contact.id;
      if (!contact.name && customerName) {
        await admin.from("contacts").update({ name: customerName }).eq("id", contactId);
      }
    } else {
      const { data: newContact, error: cErr } = await admin
        .from("contacts")
        .insert({ phone_number: phone, whatsapp_id: phone, name: customerName, user_id: null })
        .select("id").single();
      if (cErr) return await failAndRelease(`Falha ao criar contato: ${cErr.message}`);
      contactId = newContact.id;
    }

    let conversationId: string;
    const { data: conv } = await admin
      .from("conversations").select("id")
      .eq("contact_id", contactId).eq("is_active", true).maybeSingle();
    if (conv) {
      conversationId = conv.id;
    } else {
      const { data: newConv, error: convErr } = await admin
        .from("conversations")
        .insert({ contact_id: contactId, status: "nina", is_active: true, user_id: null })
        .select("id").single();
      if (convErr) return await failAndRelease(`Falha ao criar conversa: ${convErr.message}`);
      conversationId = newConv.id;
    }

    // 9) Fila de envio (o Chat ao Vivo recebe a mensagem quando o sender confirmar)
    const preview = buildPreview(carrier, variables);
    const { data: queued, error: qErr } = await admin.from("send_queue").insert({
      conversation_id: conversationId,
      contact_id: contactId,
      message_type: "template",
      from_type: "human",
      content: preview,
      priority: 5,
      status: "pending",
      metadata: {
        source: "manual",
        template_name: templateName,
        template_language: "pt_BR",
        template_variables: { body: variables },
        tracking_key: trackingKey,
        tracking_number: trackingNumber,
        carrier,
        manual_log_id: logRow?.id ?? null,
        requested_by: user.id,
      },
    }).select("id").maybeSingle();

    if (qErr) return await failAndRelease(`Falha ao enfileirar: ${qErr.message}`);

    await admin.rpc("release_tracking_send_lock", {
      p_tracking_key: trackingKey,
      p_result: "queued",
      p_send_queue_id: queued?.id ?? null,
      p_error_message: null,
    });

    if (logRow?.id) {
      await admin.from("manual_tracking_logs")
        .update({ status: "queued", send_queue_id: queued?.id ?? null })
        .eq("id", logRow.id);
    }

    // 10) Dispara o sender (best-effort) — atualização do status é assíncrona
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-sender`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ triggered_by: "send-manual-tracking" }),
      });
    } catch (_e) { /* o cron do sender processa mesmo assim */ }

    return json({
      ok: true,
      code: "queued",
      message: "Envio enfileirado. O status é atualizado automaticamente.",
      log_id: logRow?.id ?? null,
      send_queue_id: queued?.id ?? null,
      conversation_id: conversationId,
      tracking_key: trackingKey,
    }, 200);
  } catch (e) {
    return json({ error: "internal_error", message: String((e as Error)?.message ?? e) }, 500);
  }
});
