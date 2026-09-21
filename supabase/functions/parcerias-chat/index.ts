// parcerias-chat — único caminho de leitura/escrita do Chat ao Vivo para o papel
// `parcerias` (Carla / influenciadoras). Revalida no servidor: sessão autenticada
// → papel `parcerias` → team_member do próprio auth.uid() → conversa atribuída →
// concessão ativa com motivo de parcerias. Nunca usa service_role para dados da
// conversa: as RPCs rodam com o JWT do usuário e obtêm auth.uid() internamente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const url = Deno.env.get("SUPABASE_URL")!;
  if (!token || token === anonKey) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const userId = userData.user.id;

  // papel obrigatório: parcerias
  const { data: roleRow } = await userClient
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "parcerias").maybeSingle();
  if (!roleRow) return json({ error: "forbidden" }, 403);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_e) { body = {}; }
  const action = String(body.action ?? "");
  const conversationId = typeof body.conversation_id === "string" ? body.conversation_id : null;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (action !== "list" && (!conversationId || !UUID_RE.test(conversationId))) {
    return json({ error: "invalid conversation_id" }, 400);
  }

  try {
    if (action === "probe") {
      return json({ ok: true, role: "parcerias" });
    }

    if (action === "list") {
      const { data, error } = await userClient.rpc("list_my_parcerias_conversations");
      if (error) throw error;
      return json({ ok: true, conversations: data ?? [] });
    }

    const { data: allowed, error: allowErr } = await userClient
      .rpc("parcerias_can_access_conversation", { _conversation_id: conversationId });
    if (allowErr) throw allowErr;
    if (allowed !== true) return json({ error: "forbidden" }, 403);

    if (action === "messages") {
      const { data, error } = await userClient
        .rpc("get_my_parcerias_messages", { _conversation_id: conversationId });
      if (error) throw error;
      return json({ ok: true, messages: data ?? [] });
    }

    if (action === "reply") {
      const content = typeof body.content === "string" ? body.content.trim() : "";
      if (!content) return json({ error: "empty content" }, 400);
      if (content.length > 4000) return json({ error: "content too long" }, 400);
      const { data, error } = await userClient
        .rpc("parcerias_reply", { _conversation_id: conversationId, _content: content });
      if (error) throw error;
      try { await userClient.functions.invoke("whatsapp-sender"); } catch (_e) { /* fila processa depois */ }
      return json({ ok: true, message_id: data });
    }

    if (action === "finish") {
      const { data, error } = await userClient
        .rpc("parcerias_finish_conversation", { _conversation_id: conversationId });
      if (error) throw error;
      return json({ ok: true, finished: data });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const forbidden = /forbidden|permission|row-level/i.test(msg);
    console.error("[parcerias-chat] error:", msg);
    return json({ error: forbidden ? "forbidden" : "internal_error" }, forbidden ? 403 : 500);
  }
});
