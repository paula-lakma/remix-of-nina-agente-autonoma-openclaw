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
// - SEM `role` no corpo: comportamento original (não mexe em papéis).
// - COM `role` (lista permitida em FINAL_ROLES): a conta nasce BLOQUEADA para
//   login; o papel automático do gatilho é substituído pelo papel final; o
//   estado é relido e só com SOMENTE o papel final a conta é desbloqueada e a
//   senha temporária é devolvida UMA vez. Qualquer falha: conta segue bloqueada,
//   sem senha, resposta de erro. A senha nunca é gravada nem registrada em log.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getJwtUser } from "../_shared/userauth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FINAL_ROLES = ["rastreio"] as const;
const LOCK_DURATION = "876000h"; // bloqueio até a confirmação do papel

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function strongPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `Lakma-${out}`;
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

  let body: { email?: string; full_name?: string; role?: string } = {};
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
  const finalRole = body.role ? String(body.role) : null;
  if (finalRole && !(FINAL_ROLES as readonly string[]).includes(finalRole)) {
    return json({ error: "role_not_allowed" }, 400);
  }

  const tempPassword = finalRole ? strongPassword() : crypto.randomUUID() + crypto.randomUUID();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : {},
    ...(finalRole ? { ban_duration: LOCK_DURATION } : {}),
  });

  if (createErr) {
    const msg = (createErr.message ?? "").toLowerCase();
    if (msg.includes("already been registered") || msg.includes("already registered") || msg.includes("already exists")) {
      return json({ ok: true, created: false, status: "already_exists" });
    }
    console.error("[admin-create-user] create failed", createErr.message);
    return json({ error: "create_failed", detail: createErr.message }, 500);
  }
  if (!created?.user) return json({ error: "create_failed", detail: null }, 500);

  const userId = created.user.id;

  if (!finalRole) {
    return json({
      ok: true,
      created: true,
      status: "created",
      user_id: userId,
      next_step: "usuario deve usar 'Esqueci minha senha' em /auth para definir a senha",
    });
  }

  // Conta bloqueada: substitui o papel automático pelo papel final.
  const notReady = (step: string) =>
    json({ ok: false, created: true, status: "not_ready", locked: true, user_id: userId, failed_step: step }, 500);

  const { error: delErr } = await admin.from("user_roles").delete().eq("user_id", userId).neq("role", finalRole);
  if (delErr) return notReady("remove_default_role");
  const { error: insErr } = await admin
    .from("user_roles")
    .upsert({ user_id: userId, role: finalRole }, { onConflict: "user_id,role" });
  if (insErr) return notReady("assign_final_role");

  const { data: rows, error: readErr } = await admin.from("user_roles").select("role").eq("user_id", userId);
  if (readErr) return notReady("reread_roles");
  const roles = (rows ?? []).map((r: { role: string }) => r.role);
  if (roles.length !== 1 || roles[0] !== finalRole) return notReady("verify_only_final_role");

  const { error: unbanErr } = await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
  if (unbanErr) return notReady("unlock_account");

  return json({
    ok: true,
    created: true,
    status: "ready",
    user_id: userId,
    role: finalRole,
    temporary_password: tempPassword,
  });
});
