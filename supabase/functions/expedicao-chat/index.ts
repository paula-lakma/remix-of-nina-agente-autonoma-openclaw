// expedicao-chat — Fase A
// Único caminho de escrita/leitura do Chat ao Vivo para o papel `expedicao`.
// Revalida no servidor: sessão autenticada → papel `expedicao` → team_member do
// próprio auth.uid() → conversa atribuída → concessão ativa com motivo da
// allowlist. Nunca usa service_role para dados da conversa: as RPCs rodam com
// o JWT do usuário e obtêm auth.uid() internamente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { windowClosedPayload } from "../_shared/whatsappWindow.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { computeConversationPriority, type PriorityMessage } from "../_shared/priority.ts";
import { resumeErrorCode } from "../_shared/resumeTemplate.ts";

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

  // cliente com o JWT do usuário: RLS + auth.uid() aplicados
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const userId = userData.user.id;

  // papel obrigatório: expedicao
  const { data: roleRow } = await userClient
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "expedicao").maybeSingle();
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
      return json({ ok: true, role: "expedicao" });
    }

    if (action === "list") {
      const { data, error } = await userClient.rpc("list_my_expedicao_conversations");
      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      // Prioridade só de leitura; se falhar, a lista continua igual.
      try {
        const ids = rows.map((r) => String(r.conversation_id));
        if (ids.length) {
          const [m, c] = await Promise.all([
            userClient.from("messages").select("conversation_id, from_type, content, sent_at, status, metadata")
              .in("conversation_id", ids).order("sent_at", { ascending: true }).limit(20000),
            userClient.from("conversations").select("id, attendance_finished_at").in("id", ids),
          ]);
          if (!m.error && !c.error) {
            const fin = new Map((c.data ?? []).map((x) => [x.id, x.attendance_finished_at]));
            const byConv = new Map<string, PriorityMessage[]>();
            for (const x of m.data ?? []) {
              const list = byConv.get(x.conversation_id) ?? [];
              list.push({ from_type: x.from_type, content: x.content, sent_at: x.sent_at, status: x.status,
                template_name: (x.metadata as Record<string, unknown> | null)?.template_name as string | null ?? null });
              byConv.set(x.conversation_id, list);
            }
            const now = new Date();
            for (const r of rows) {
              const id = String(r.conversation_id);
              r.priority = computeConversationPriority({ messages: byConv.get(id) ?? [], finishedAt: fin.get(id) ?? null, now });
            }
          }
        }
      } catch (e) {
        console.error("[expedicao-chat] priority error:", e instanceof Error ? e.message : String(e));
      }
      return json({ ok: true, conversations: rows });
    }

    // dupla checagem explícita de posse antes de qualquer operação por conversa
    const { data: allowed, error: allowErr } = await userClient
      .rpc("expedicao_can_access_conversation", { _conversation_id: conversationId });
    if (allowErr) throw allowErr;
    if (allowed !== true) return json({ error: "forbidden" }, 403);

    if (action === "messages") {
      const { data, error } = await userClient
        .rpc("get_my_expedicao_messages", { _conversation_id: conversationId });
      if (error) throw error;
      const list = (data ?? []) as Array<Record<string, unknown>>;
      // Só leitura: marca mensagens de modelo (ex.: retomada) para o histórico.
      try {
        const { data: meta } = await userClient.from("messages").select("id, metadata, status")
          .eq("conversation_id", conversationId).not("metadata->>template_name", "is", null);
        const byId = new Map((meta ?? []).map((x) => [x.id, x.metadata as Record<string, unknown> | null]));
        const statusById = new Map((meta ?? []).map((x) => [x.id, x.status as string]));
        for (const m of list) {
          const md = byId.get(String(m.id));
          if (md) { m.template_name = md.template_name ?? null; m.template_source = md.source ?? null; m.status = statusById.get(String(m.id)) ?? m.status ?? null; }
        }
      } catch (_e) { /* histórico segue sem marcação */ }
      return json({ ok: true, messages: list });
    }

    if (action === "resume_status") {
      const { data, error } = await userClient
        .rpc("expedicao_resume_template_status", { _conversation_id: conversationId });
      if (error) throw error;
      return json({ ok: true, ...(data as Record<string, unknown>) });
    }

    if (action === "resume_template") {
      const { data, error } = await userClient
        .rpc("expedicao_send_resume_template", { _conversation_id: conversationId });
      if (error) {
        const code = resumeErrorCode(error.message);
        if (code) return json({ error: code }, code === "forbidden" ? 403 : 409);
        throw error;
      }
      try { await userClient.functions.invoke("whatsapp-sender"); } catch (_e) { /* fila processa depois */ }
      return json({ ok: true, message_id: data });
    }

    if (action === "reply") {
      const content = typeof body.content === "string" ? body.content.trim() : "";
      if (!content) return json({ error: "empty content" }, 400);
      if (content.length > 4000) return json({ error: "content too long" }, 400);
      const { data, error } = await userClient
        .rpc("expedicao_reply", { _conversation_id: conversationId, _content: content });
      if (error) {
        const closed = windowClosedPayload(error);
        if (closed) return json(closed, 409);
        throw error;
      }
      // dispara o sender existente (fila já criada pela RPC)
      try { await userClient.functions.invoke("whatsapp-sender"); } catch (_e) { /* fila processa depois */ }
      return json({ ok: true, message_id: data });
    }

    if (action === "finish") {
      const { data, error } = await userClient
        .rpc("expedicao_finish_conversation", { _conversation_id: conversationId });
      if (error) throw error;
      return json({ ok: true, finished: data });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const forbidden = /forbidden|permission|row-level/i.test(msg);
    console.error("[expedicao-chat] error:", msg);
    return json({ error: forbidden ? "forbidden" : "internal_error" }, forbidden ? 403 : 500);
  }
});
