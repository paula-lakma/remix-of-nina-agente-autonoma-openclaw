// chat-media — assina sob demanda a mídia de uma mensagem do WhatsApp.
// O bucket `whatsapp-media` permanece privado: esta função valida a sessão do
// usuário e só então gera uma URL assinada curta (1h).
// Autorização:
//   - staff operacional: leitura da mensagem com o JWT do usuário (RLS decide);
//   - papel `expedicao`: via RPC expedicao_can_access_conversation.
// Nunca expõe token da Meta nem service role ao frontend.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const BUCKET = "whatsapp-media";
const TTL = 3600;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "video/quicktime": "mov",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
};

// Extrai o caminho dentro do bucket a partir de uma signed URL antiga.
function pathFromSignedUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length).split("?")[0]) || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!token || token === anonKey) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_e) { body = {}; }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const messageId = typeof body.message_id === "string" ? body.message_id : "";
  const conversationId = typeof body.conversation_id === "string" ? body.conversation_id : "";
  if (!UUID_RE.test(messageId)) return json({ error: "invalid message_id" }, 400);

  const admin = createClient(url, serviceKey);

  try {
    // 1) staff operacional — a própria RLS de `messages` decide
    let row: Record<string, unknown> | null = null;
    const { data: viaRls } = await userClient
      .from("messages")
      .select("id, conversation_id, type, media_url, media_type, metadata")
      .eq("id", messageId)
      .maybeSingle();
    row = viaRls ?? null;

    // 2) papel expedicao — acesso restrito à conversa concedida
    if (!row) {
      if (!UUID_RE.test(conversationId)) return json({ error: "forbidden" }, 403);
      const { data: allowed } = await userClient
        .rpc("expedicao_can_access_conversation", { _conversation_id: conversationId });
      if (allowed !== true) return json({ error: "forbidden" }, 403);

      const { data: viaAdmin } = await admin
        .from("messages")
        .select("id, conversation_id, type, media_url, media_type, metadata")
        .eq("id", messageId)
        .eq("conversation_id", conversationId)
        .maybeSingle();
      row = viaAdmin ?? null;
    }

    if (!row) return json({ error: "not_found" }, 404);

    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const mime = typeof row.media_type === "string" ? row.media_type : "";
    const ext = EXT_BY_MIME[mime.toLowerCase()] ?? mime.split("/").pop()?.split(";")[0] ?? "bin";

    const path =
      (typeof metadata.media_path === "string" && metadata.media_path) ||
      pathFromSignedUrl(typeof row.media_url === "string" ? row.media_url : null) ||
      `${row.conversation_id}/in/${row.id}.${ext}`;

    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(path, TTL);

    if (signErr || !signed?.signedUrl) {
      console.error("[chat-media] sign error", signErr?.message);
      return json({ error: "media_unavailable" }, 404);
    }

    return json({
      ok: true,
      url: signed.signedUrl,
      path,
      media_type: mime || null,
      filename: typeof metadata.media_filename === "string" ? metadata.media_filename : null,
      expires_in: TTL,
    });
  } catch (e) {
    console.error("[chat-media] error", e instanceof Error ? e.message : String(e));
    return json({ error: "internal_error" }, 500);
  }
});
