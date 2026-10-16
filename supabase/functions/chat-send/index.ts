// chat-send — envio manual do Chat completo (admin/manager/equipe operacional).
// O navegador NUNCA grava na fila de envio: a mensagem é gravada com a sessão da
// pessoa (RLS + trava da janela de 24h) e a fila é criada aqui no servidor.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { handleChatSend } from "./logic.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const admin = createClient(url, serviceKey);

  let userId: string | null = null;
  if (token && token !== anonKey) {
    const { data } = await userClient.auth.getUser(token);
    userId = data?.user?.id ?? null;
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_e) { body = {}; }

  try {
    const result = await handleChatSend({
      userId,
      isStaff: async (id) => {
        const { data, error } = await admin.rpc("is_operational_staff", { _user_id: id });
        if (error) throw error;
        return data === true;
      },
      loadConversation: async (id) => {
        const { data } = await userClient.from("conversations").select("id, contact_id").eq("id", id).maybeSingle();
        return data ?? null;
      },
      findByRequestId: async (conversationId, requestId) => {
        const { data } = await admin.from("messages").select("id, status")
          .eq("conversation_id", conversationId).eq("metadata->>client_request_id", requestId).maybeSingle();
        if (!data) return null;
        const { data: q } = await admin.from("send_queue").select("id").eq("message_id", data.id).limit(1).maybeSingle();
        return { id: data.id, status: data.status, queued: !!q || data.status !== "processing" && data.status !== "failed" };
      },
      insertMessage: async (row) => {
        const { data, error } = await userClient.from("messages").insert(row).select("id").single();
        return error ? { error } : { id: data.id };
      },
      insertQueue: async (row) => {
        const { error } = await admin.from("send_queue").insert(row);
        return error ? { error } : {};
      },
      markFailed: async (messageId, reason) => {
        await admin.from("messages").update({ status: "failed", metadata: { source: "chat_manual", send_error: reason } })
          .eq("id", messageId);
      },
      triggerSender: async () => {
        await fetch(`${url}/functions/v1/whatsapp-sender`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ triggered_by: "chat-send" }),
        });
      },
    }, {
      conversationId: body.conversation_id as string,
      content: body.content as string,
      requestId: body.request_id as string,
    });
    return json(result.body, result.status);
  } catch (e) {
    console.error("[chat-send] error:", e instanceof Error ? e.message : String(e));
    return json({ ok: false, error: "internal_error", message: "Falha interna ao enviar. Tente novamente." }, 500);
  }
});
