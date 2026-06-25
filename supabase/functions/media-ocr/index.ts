// Visão / OCR de imagens e PDFs via Lovable AI Gateway (google/gemini-2.5-flash)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fetchAsDataUrl(url: string): Promise<{ dataUrl: string; mime: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar mídia: ${res.status}`);
  const mime = res.headers.get("content-type") || "application/octet-stream";
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const b64 = btoa(bin);
  return { dataUrl: `data:${mime};base64,${b64}`, mime };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: authData, error: authErr } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { mediaUrl, mode = "ocr" } = await req.json();
    if (!mediaUrl) {
      return new Response(JSON.stringify({ error: "mediaUrl é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurado" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { dataUrl, mime } = await fetchAsDataUrl(mediaUrl);
    const isPdf = mime.includes("pdf");

    const systemPrompt = mode === "describe"
      ? "Você é assistente de atendimento. Descreva resumidamente o que aparece no anexo (imagem ou documento), em português, em no máximo 3 linhas."
      : "Você é um OCR. Extraia TODO o texto visível no anexo, preservando quebras de linha. Não invente. Responda apenas o texto extraído, sem comentários. Se não houver texto, responda exatamente: [SEM TEXTO]";

    const userBlock = isPdf
      ? { type: "file", file: { filename: "anexo.pdf", file_data: dataUrl } }
      : { type: "image_url", image_url: { url: dataUrl } };

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: [
            { type: "text", text: mode === "describe" ? "Descreva este anexo." : "Extraia o texto deste anexo." },
            userBlock,
          ]},
        ],
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      return new Response(JSON.stringify({ error: `Gateway ${aiRes.status}`, detail: txt }), {
        status: aiRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const text = data?.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ text, mime, mode }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
