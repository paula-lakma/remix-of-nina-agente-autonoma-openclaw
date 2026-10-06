// shopify-signup — recebe inscrições da página pública da Lakma (Shopify).
// Fail closed: sem TURNSTILE_SECRET_KEY e SIGNUP_ALLOWED_ORIGINS configurados, recusa tudo.
// Toda escrita acontece em apply_shopify_signup (SECURITY DEFINER, só service_role).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  GENERIC_OK, isAllowedOrigin, parseAllowedOrigins, publicErrorMessage, validateSignup,
} from "../_shared/signup.ts";

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const allowed = parseAllowedOrigins(Deno.env.get("SIGNUP_ALLOWED_ORIGINS"));
  const origin = req.headers.get("Origin");
  const originOk = isAllowedOrigin(origin, allowed);
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": originOk ? origin! : "null",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { status: originOk ? 204 : 403, headers: cors });
  if (req.method !== "POST") return json({ ok: false, message: publicErrorMessage("method") }, 405);

  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret || allowed.length === 0) return json({ ok: false, error: "not_configured", message: "Inscrições ainda não disponíveis." }, 503);
  if (!originOk) return json({ ok: false, error: "forbidden_origin", message: publicErrorMessage("origin") }, 403);

  let body: unknown;
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_payload", message: publicErrorMessage("x") }, 400); }
  const v = validateSignup(body);
  if (!v.ok) return json({ ok: false, error: v.error, message: publicErrorMessage(v.error) }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const salt = Deno.env.get("SUPABASE_URL") ?? "";
  const ip = (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim();
  const phoneHash = await sha256(`${salt}|phone|${v.phone.canonical}`);
  const netHash = ip ? await sha256(`${salt}|net|${ip}`) : null;

  const { data: withinLimit, error: rlErr } = await admin.rpc("signup_rate_check", { _phone_hash: phoneHash, _net_hash: netHash });
  if (rlErr) { console.error("[shopify-signup] rate", rlErr.message); return json({ ok: false, error: "internal_error", message: publicErrorMessage("x") }, 500); }
  if (withinLimit !== true) return json({ ok: false, error: "rate_limited", message: publicErrorMessage("rate_limited") }, 429);

  // Turnstile no servidor
  const form = new URLSearchParams({ secret, response: v.turnstile_token });
  if (ip) form.set("remoteip", ip);
  let ts: { success?: boolean; hostname?: string; challenge_ts?: string } = {};
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    ts = await r.json();
  } catch (e) {
    console.error("[shopify-signup] turnstile", e instanceof Error ? e.message : String(e));
  }
  if (ts.success !== true) return json({ ok: false, error: "turnstile_failed", message: publicErrorMessage("turnstile_failed") }, 400);

  const evidence = {
    origin,
    page: req.headers.get("Referer")?.slice(0, 300) ?? null,
    turnstile: { success: true, hostname: ts.hostname ?? null, challenge_ts: ts.challenge_ts ?? null },
  };
  const { error } = await admin.rpc("apply_shopify_signup", {
    _phone: v.phone.canonical, _legacy_phone: v.phone.legacy, _name: v.name, _contact_type: v.contact_type,
    _version: v.consent_version, _consent_text: v.consent_text, _evidence: evidence,
  });
  if (error) { console.error("[shopify-signup] apply", error.message); return json({ ok: false, error: "internal_error", message: publicErrorMessage("x") }, 500); }
  return json({ ok: true, message: GENERIC_OK });
});
