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

const CARRIERS = {
  correios: { label: "Correios", template: "pedido_enviado_correios" },
  jadlog: { label: "Jadlog", template: "pedido_enviado_jadlog" },
} as const;

type CarrierKey = keyof typeof CARRIERS;

const ALLOWED_ROLES = ["admin", "manager", "expedicao"];

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

    // 3) Validação dos campos
    const body = await req.json().catch(() => ({}));
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

    // 6) Fase 2B: trava atômica + histórico + send_queue + envio.
    return json({
      ok: false,
      code: "not_implemented",
      message: "Fluxo de envio será habilitado na Fase 2B.",
    }, 501);
  } catch (e) {
    return json({ error: "internal_error", message: String((e as Error)?.message ?? e) }, 500);
  }
});
