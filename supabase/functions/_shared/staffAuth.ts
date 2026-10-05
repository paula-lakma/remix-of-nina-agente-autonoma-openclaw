// Exige sessão real de admin/manager. Chave pública/anônima nunca passa.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getJwtUser } from "./userauth.ts";
import { canManageTemplates } from "./templateRules.ts";

export async function requireAdminOrManager(
  req: Request,
): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const user = await getJwtUser(req);
  if (!user) return { ok: false, status: 401, error: "unauthorized" };
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  if (error) return { ok: false, status: 500, error: "role_check_failed" };
  const roles = (data ?? []).map((r: { role: string }) => String(r.role));
  if (!canManageTemplates(roles)) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true, userId: user.id };
}
