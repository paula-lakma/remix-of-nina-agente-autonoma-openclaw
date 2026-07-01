import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getNinaMetaCreds } from "../_shared/nina-meta.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_API_VERSION = "v22.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const {
      phone_number,
      content,
      message_type = "text",
      media_url,
      file_name,
      template_name,
      template_language,
      template_variables,
      header_media,
    } = await req.json();

    if (!phone_number) throw new Error("phone_number is required");

    const conn = await getNinaMetaCreds(supabase);
    const cleanPhone = String(phone_number).replace(/\D/g, "");

    // deno-lint-ignore no-explicit-any
    let metaPayload: any;

    if (message_type === "template" && template_name) {
      // deno-lint-ignore no-explicit-any
      const templateObj: any = { name: template_name, language: { code: template_language || "pt_BR" } };
      // deno-lint-ignore no-explicit-any
      const components: any[] = [];
      const vars = template_variables || {};

      if (header_media?.type && header_media?.url) {
        const mediaType = String(header_media.type).toLowerCase();
        // deno-lint-ignore no-explicit-any
        const param: any = { type: mediaType };
        if (mediaType === "image") param.image = { link: header_media.url };
        else if (mediaType === "video") param.video = { link: header_media.url };
        else if (mediaType === "document") param.document = { link: header_media.url };
        components.push({ type: "header", parameters: [param] });
      } else if (vars.header?.length > 0) {
        components.push({
          type: "header",
          parameters: vars.header.map((v: string) => ({ type: "text", text: v })),
        });
      }

      if (vars.body?.length > 0) {
        components.push({
          type: "body",
          parameters: vars.body.map((v: string) => ({ type: "text", text: v })),
        });
      }

      if (components.length) templateObj.components = components;

      metaPayload = { messaging_product: "whatsapp", to: cleanPhone, type: "template", template: templateObj };
    } else if (message_type === "image" && media_url) {
      metaPayload = { messaging_product: "whatsapp", to: cleanPhone, type: "image", image: { link: media_url, caption: content || "" } };
    } else if (message_type === "video" && media_url) {
      metaPayload = { messaging_product: "whatsapp", to: cleanPhone, type: "video", video: { link: media_url, caption: content || "" } };
    } else if (message_type === "document" && media_url) {
      metaPayload = { messaging_product: "whatsapp", to: cleanPhone, type: "document", document: { link: media_url, caption: content || "", filename: file_name || "document" } };
    } else if (message_type === "audio" && media_url) {
      metaPayload = { messaging_product: "whatsapp", to: cleanPhone, type: "audio", audio: { link: media_url } };
    } else {
      metaPayload = { messaging_product: "whatsapp", to: cleanPhone, type: "text", text: { body: content || "" } };
    }

    console.log(`[send-meta-message] Sending ${message_type} to ${cleanPhone}`);

    const metaResponse = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${conn.phone_number_id}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${conn.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(metaPayload),
      }
    );

    const metaResult = await metaResponse.json();
    if (!metaResponse.ok) {
      const errorMsg = metaResult?.error?.message || "Unknown Meta API error";
      throw new Error(`Meta API error (${metaResponse.status}): ${errorMsg}`);
    }

    const messageId = metaResult?.messages?.[0]?.id || null;
    return new Response(JSON.stringify({ success: true, messageId, data: metaResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[send-meta-message] Error: ${message}`);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
