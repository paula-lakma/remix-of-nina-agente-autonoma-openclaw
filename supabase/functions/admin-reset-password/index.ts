// admin-reset-password
// Rotação administrativa de senha temporária. Só sessão real de `admin`.
// Para cada user_id: confere conta ativa, gera senha forte aleatória e
// independente, aplica via Admin API do Auth e devolve a senha UMA vez.
// A senha nunca é gravada em tabela/metadata nem registrada em log.
// Não altera papéis, perfil, equipe nem bloqueio.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getJwtUser } from "../_shared/userauth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function strongPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const user = await getJwtUser(req);
  if (!user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (roleErr) return json({ error: "role_check_failed" }, 500);
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let body: { user_ids?: unknown } = {};
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const ids = Array.isArray(body.user_ids) ? body.user_ids.map(String) : [];
  if (ids.length === 0 || ids.length > 10) return json({ error: "invalid_user_ids" }, 400);

  const results: unknown[] = [];
  const used = new Set<string>();
  for (const id of ids) {
    const { data: got, error: getErr } = await admin.auth.admin.getUserById(id);
    const u = got?.user;
    if (getErr || !u) { results.push({ user_id: id, ok: false, error: "not_found" }); continue; }
    const banned = u.banned_until && new Date(u.banned_until).getTime() > Date.now();
    if (banned) { results.push({ user_id: id, email: u.email, ok: false, error: "account_banned" }); continue; }

    let pw = strongPassword();
    while (used.has(pw)) pw = strongPassword();
    used.add(pw);

    const { error: upErr } = await admin.auth.admin.updateUserById(id, { password: pw });
    if (upErr) { results.push({ user_id: id, email: u.email, ok: false, error: "update_failed" }); continue; }
    results.push({ user_id: id, email: u.email, ok: true, temporary_password: pw });
  }
  return json({ ok: true, results });
});
