// _shared/userauth.ts
// Resolve o usuário a partir do JWT (header Authorization: Bearer <jwt>).
// Usa getClaims() (valida localmente via JWKS) para compatibilidade com o
// sistema de signing-keys do Supabase. Retorna { id } em sucesso, ou null.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function getJwtUser(req: Request): Promise<{ id: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;

  // Ignora chamadas feitas apenas com a anon key (sem sessão de usuário).
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (token === anonKey || token === publishableKey) return null;

  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    anonKey!,
  );

  try {
    const { data, error } = await client.auth.getClaims(token);
    if (error || !data?.claims?.sub) return null;
    return { id: data.claims.sub as string };
  } catch (_e) {
    return null;
  }
}
