// admin-set-password
// Define uma senha provisória para uma conta EXISTENTE via Admin API do Auth.
// Não cria conta, não altera e-mail, role, team_members, profiles ou permissões.
// Acesso restrito à service role (uso administrativo pontual).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireServiceRole } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const denied = requireServiceRole(req, corsHeaders);
  if (denied) return denied;

  let body: { user_id?: string; password?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const userId = String(body.user_id ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "invalid_user_id" }, 400);

  const password = String(body.password ?? "");
  if (password.length < 12) return json({ error: "invalid_password" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) {
    console.error("[admin-set-password] update failed", error.message);
    return json({ error: "update_failed", detail: error.message }, 500);
  }

  return json({
    ok: true,
    user_id: data.user?.id ?? null,
    email: data.user?.email ?? null,
  });
});
