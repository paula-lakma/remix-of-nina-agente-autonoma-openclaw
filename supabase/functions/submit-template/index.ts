import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getNinaMetaCreds } from "../_shared/nina-meta.ts";
import { requireAdminOrManager } from "../_shared/staffAuth.ts";
import { isMetaDuplicateNameError, mergeTemplateReview } from "../_shared/templateRules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Só admin/manager com sessão real. Chave pública/anônima é recusada.
  const auth = await requireAdminOrManager(req);
  if (!auth.ok) return jsonRes({ error: auth.error }, auth.status);

  try {
    const { templateData, isEdit, templateId, metaTemplateId } = await req.json();
    if (!templateData) return jsonRes({ error: "templateData é obrigatório" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { name, category, language, components, samples, labels, validation_score } = templateData;
    if (typeof name !== "string" || !/^[a-z0-9_]{1,512}$/.test(name)) return jsonRes({ error: "nome inválido" }, 400);
    if (typeof language !== "string" || !language.trim()) return jsonRes({ error: "idioma obrigatório" }, 400);
    if (!Array.isArray(components) || components.length === 0) return jsonRes({ error: "componentes obrigatórios" }, 400);

    // Duplicado local (nome + idioma): não submete de novo.
    if (!isEdit) {
      const { data: dup, error: dupErr } = await supabase.from("meta_templates")
        .select("id, name, language, status, category, meta_template_id")
        .eq("name", name).eq("language", language).maybeSingle();
      if (dupErr) throw dupErr;
      if (dup) {
        return jsonRes({ error: "template_already_exists_local", message: "Template já existe. Nada foi submetido.", existing: dup }, 409);
      }
    }

    const conn = await getNinaMetaCreds(supabase);
    if (!conn.waba_id) throw new Error("nina_settings.whatsapp_business_account_id não configurado.");
    const { access_token, waba_id } = conn;
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
    const metaResult = await metaResponse.json();

    // Nome já existe na Meta: nunca renomear (sem _vXXXX). Pedir sincronização.
    if (!metaResponse.ok && isMetaDuplicateNameError(metaResult?.error)) {
      return jsonRes({
        error: "template_already_exists_meta",
        message: "Template já existe na Meta. Sincronize os templates.",
        details: metaResult?.error ?? null,
      }, 409);
    }

    if (!metaResponse.ok) {
      console.error("Meta rejeitou template:", JSON.stringify(metaResult));
      return jsonRes({
        error: metaResult?.error?.error_user_msg || metaResult?.error?.message || "Erro ao submeter template",
        details: metaResult?.error ?? null,
      }, 400);
    }

    const returnedMetaId = metaResult.id || metaTemplateId;
    const returnedStatus = metaResult.status || "PENDING";
    const returnedCategory = metaResult.category || category;
    const mergedSamples = mergeTemplateReview(samples, { requested_category: category, status: returnedStatus });
    if (isEdit && templateId) {
      const { error: upErr } = await supabase.from("meta_templates").update({
        name, category: returnedCategory, language, components, samples: mergedSamples, labels, validation_score,
        meta_template_id: returnedMetaId, status: returnedStatus,
        updated_at: new Date().toISOString(),
      }).eq("id", templateId);
      if (upErr) throw upErr;
    } else {
      const { error: insErr } = await supabase.from("meta_templates").insert({
        name, category: returnedCategory, language, components, samples: mergedSamples, labels, validation_score,
        meta_template_id: returnedMetaId, status: returnedStatus,
      });
      if (insErr) throw insErr;
    }

    return new Response(JSON.stringify({ success: true, metaTemplateId: returnedMetaId, status: returnedStatus, category: returnedCategory }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : ((err as { message?: string })?.message ?? "Erro interno");
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
