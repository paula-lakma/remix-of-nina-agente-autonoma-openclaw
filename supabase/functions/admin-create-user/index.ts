// admin-create-user
// Caminho OFICIAL e ÚNICO para provisionar contas internas (dermoconsultoras,
// expedição, etc.). Usa a Admin API do Auth, que preenche corretamente todos os
// campos de token — evitando o defeito de contas criadas por SQL direto, que
// quebravam o fluxo "Esqueci minha senha" (GoTrue 500 em /recover).
//
// Regras:
// - exige sessão válida com papel `admin`;
// - não cria cadastro público e não altera a configuração de signup;
// - idempotente: se o e-mail já existir, não cria nem altera nada;
// - não mexe em roles, team_members ou permissões.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getJwtUser } from "../_shared/userauth.ts";

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

  const user = await getJwtUser(req);
  if (!user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
    _user_id: user.id,
    _role: "admin",
  });
  if (roleErr) return json({ error: "role_check_failed" }, 500);
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let body: { email?: string; full_name?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const fullName = String(body.full_name ?? "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    return json({ error: "invalid_email" }, 400);
  }

  // Idempotência: e-mail já existente não é recriado nem alterado.
  const { data: existing, error: lookupErr } = await admin
    .schema("auth")
    .from("users")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();
  if (lookupErr) return json({ error: "lookup_failed" }, 500);
  if (existing) {
    return json({ ok: true, created: false, status: "already_exists", user_id: existing.id });
  }

  // Senha temporária aleatória: nunca é exibida nem armazenada fora do Auth.
  // A pessoa define a própria senha via "Esqueci minha senha" em /auth.
  const tempPassword = crypto.randomUUID() + crypto.randomUUID();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : {},
  });

  if (createErr || !created?.user) {
    console.error("[admin-create-user] create failed", createErr?.message);
    return json({ error: "create_failed", detail: createErr?.message ?? null }, 500);
  }

  return json({
    ok: true,
    created: true,
    status: "created",
    user_id: created.user.id,
    next_step: "usuario deve usar 'Esqueci minha senha' em /auth para definir a senha",
  });
});
