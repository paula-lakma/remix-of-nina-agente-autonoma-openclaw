// Temporary one-off provisioning function.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MEMBERS = [
  { name: "Paula Rodrigues", email: "comerciallakma0@gmail.com", team_member_id: "22222222-0000-4000-a000-000000000001" },
  { name: "Carla", email: "carla@lakma.com.br", team_member_id: "22222222-0000-4000-a000-000000000002" },
  { name: "Cris", email: "atendimento3@lakma.com.br", team_member_id: "22222222-0000-4000-a000-000000000003" },
  { name: "Leticia", email: "financeiro@lakma.com.br", team_member_id: "22222222-0000-4000-a000-000000000004" },
];

const PASSWORD = "Lakma4647!@";
const PROTECTED_EMAIL = "paula@lakma.com.br";

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const results: unknown[] = [];

  for (const m of MEMBERS) {
    if (m.email.toLowerCase() === PROTECTED_EMAIL) continue;

    let userId: string | null = null;
    let action = "reused";

    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users?.find((u) => u.email?.toLowerCase() === m.email.toLowerCase());

    if (existing) {
      userId = existing.id;
      await admin.auth.admin.updateUserById(existing.id, {
        password: PASSWORD,
        email_confirm: true,
      });
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: m.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: m.name },
      });
      if (error) { results.push({ ...m, error: error.message }); continue; }
      userId = data.user!.id;
      action = "created";
    }

    // profile (trigger normally creates it; ensure it exists)
    const { data: prof } = await admin.from("profiles").select("id").eq("user_id", userId).maybeSingle();
    let profileId = prof?.id ?? null;
    if (!profileId) {
      const { data: ins } = await admin
        .from("profiles")
        .insert({ user_id: userId, full_name: m.name, email: m.email })
        .select("id")
        .single();
      profileId = ins?.id ?? null;
    } else {
      await admin.from("profiles").update({ full_name: m.name, email: m.email }).eq("id", profileId);
    }

    // minimal operational role
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const hasSdr = (roles ?? []).some((r: { role: string }) => r.role === "sdr");
    if (!hasSdr) await admin.from("user_roles").insert({ user_id: userId, role: "sdr" });
    // remove elevated roles if any
    await admin.from("user_roles").delete().eq("user_id", userId).in("role", ["admin", "manager"]);

    await admin
      .from("team_members")
      .update({ user_id: userId, status: "active", role: "agent" })
      .eq("id", m.team_member_id);

    results.push({ ...m, action, user_id: userId, profile_id: profileId, role: "sdr", status: "active" });
  }

  return new Response(JSON.stringify({ results }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
