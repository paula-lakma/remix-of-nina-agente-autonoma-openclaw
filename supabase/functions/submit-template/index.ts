import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getNinaMetaCreds } from "../_shared/nina-meta.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { templateData, isEdit, templateId, metaTemplateId } = await req.json();
    if (!templateData) {
      return new Response(JSON.stringify({ error: "templateData é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const conn = await getNinaMetaCreds(supabase);
    if (!conn.waba_id) throw new Error("nina_settings.whatsapp_business_account_id não configurado.");

    const { access_token, waba_id } = conn;
    const { name, category, language, components, samples, labels, validation_score } = templateData;
    // deno-lint-ignore no-explicit-any
    const metaComponents: any[] = [];

    for (const comp of components) {
      if (comp.type === "HEADER") {
        if (["IMAGE", "VIDEO", "DOCUMENT"].includes(comp.format) && comp.mediaUrl) {
          const handle = await uploadMediaToMeta(comp.mediaUrl, comp.format, access_token, waba_id);
          metaComponents.push({ type: "HEADER", format: comp.format, example: { header_handle: [handle] } });
        } else if (comp.format === "TEXT" && comp.text) {
          // deno-lint-ignore no-explicit-any
          const h: any = { type: "HEADER", format: "TEXT", text: comp.text };
          if (comp.text.match(/\{\{\d+\}\}/g) && samples?.headerSamples?.length) {
            h.example = { header_text: samples.headerSamples };
          }
          metaComponents.push(h);
        } else if (comp.format === "LOCATION") {
          metaComponents.push({ type: "HEADER", format: "LOCATION" });
        }
      } else if (comp.type === "BODY") {
        // deno-lint-ignore no-explicit-any
        const b: any = { type: "BODY", text: comp.text };
        if (comp.text.match(/\{\{\d+\}\}/g) && samples?.bodySamples?.length) {
          b.example = { body_text: [samples.bodySamples] };
        }
        metaComponents.push(b);
      } else if (comp.type === "FOOTER") {
        metaComponents.push({ type: "FOOTER", text: comp.text });
      } else if (comp.type === "BUTTONS") {
        // deno-lint-ignore no-explicit-any
        const buttons = comp.buttons.map((btn: any) => {
          // deno-lint-ignore no-explicit-any
          const mb: any = { type: btn.type, text: btn.text };
          if (btn.type === "URL") {
            mb.url = btn.url;
            if (btn.url?.includes("{{1}}") && samples?.buttonUrlSamples?.length) mb.example = samples.buttonUrlSamples;
          } else if (btn.type === "PHONE_NUMBER") mb.phone_number = btn.phone_number;
          else if (btn.type === "COPY_CODE") mb.example = btn.example || "CODE123";
          else if (btn.type === "OTP") mb.otp_type = btn.otp_type || "COPY_CODE";
          return mb;
        });
        metaComponents.push({ type: "BUTTONS", buttons });
      }
    }

    // deno-lint-ignore no-explicit-any
    const metaPayload: any = { name, category, language, components: metaComponents };

    let metaResponse: Response;
    if (isEdit && metaTemplateId) {
      metaResponse = await fetch(`${GRAPH_API}/${metaTemplateId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ components: metaComponents, category }),
      });
    } else {
      metaResponse = await fetch(`${GRAPH_API}/${waba_id}/message_templates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(metaPayload),
      });
    }
    let metaResult = await metaResponse.json();

    if (!metaResponse.ok && metaResult?.error?.code === 100 && metaResult?.error?.error_subcode === 2388093) {
      metaPayload.name = `${name}_v${Date.now().toString(36).slice(-4)}`;
      metaResponse = await fetch(`${GRAPH_API}/${waba_id}/message_templates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(metaPayload),
      });
      metaResult = await metaResponse.json();
    }

    if (!metaResponse.ok) {
      console.error("Meta rejeitou template:", JSON.stringify(metaResult));
      return new Response(JSON.stringify({
        error: metaResult?.error?.error_user_msg || metaResult?.error?.message || "Erro ao submeter template",
        details: metaResult?.error ?? null,
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const returnedMetaId = metaResult.id || metaTemplateId;
    if (isEdit && templateId) {
      await supabase.from("meta_templates").update({
        name: metaPayload.name || name, category, language, components, samples, labels, validation_score,
        meta_template_id: returnedMetaId, status: metaResult.status || "PENDING",
        updated_at: new Date().toISOString(),
      }).eq("id", templateId);
    } else {
      await supabase.from("meta_templates").insert({
        name: metaPayload.name || name, category, language, components, samples, labels, validation_score,
        meta_template_id: returnedMetaId, status: metaResult.status || "PENDING",
      });
    }

    return new Response(JSON.stringify({ success: true, metaTemplateId: returnedMetaId, status: metaResult.status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("submit-template error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function uploadMediaToMeta(mediaUrl: string, format: string, accessToken: string, wabaId: string): Promise<string> {
  const fileResponse = await fetch(mediaUrl);
  const fileBlob = await fileResponse.blob();
  const mimeMap: Record<string, string> = { IMAGE: "image/png", VIDEO: "video/mp4", DOCUMENT: "application/pdf" };
  const mime = mimeMap[format] || "application/octet-stream";

  const sessionRes = await fetch(
    `${GRAPH_API}/${wabaId}/uploads?file_type=${mime}&file_length=${fileBlob.size}`,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const sessionData = await sessionRes.json();
  if (!sessionData.id) throw new Error("Falha ao criar sessão de upload na Meta");

  const uploadRes = await fetch(`${GRAPH_API}/${sessionData.id}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${accessToken}`, "Content-Type": mime, file_offset: "0" },
    body: fileBlob,
  });
  const uploadData = await uploadRes.json();
  if (!uploadData.h) throw new Error("Falha ao fazer upload do arquivo na Meta");
  return uploadData.h;
}
