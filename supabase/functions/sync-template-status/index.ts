import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getNinaMetaCreds } from "../_shared/nina-meta.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";

interface MetaTpl {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components?: unknown;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const conn = await getNinaMetaCreds(supabase);

    if (!conn.waba_id) {
      return json(
        { error: "whatsapp_business_account_id ausente em nina_settings. Configure o WABA ID para listar templates." },
        400,
      );
    }

    // 1. Fetch all templates from Meta (paginated)
    const fetched: MetaTpl[] = [];
    let url: string | null =
      `${GRAPH_API}/${conn.waba_id}/message_templates` +
      `?fields=name,language,status,category,components,id&limit=200` +
      `&access_token=${encodeURIComponent(conn.access_token)}`;

    let pages = 0;
    while (url && pages < 20) {
      const res = await fetch(url);
      const payload = await res.json();
      if (payload?.error) {
        console.error("[sync-templates] Meta error:", payload.error);
        return json(
          {
            error: `Meta Graph API error: ${payload.error.message}`,
            code: payload.error.code,
            type: payload.error.type,
            hint:
              payload.error.code === 190 || payload.error.code === 200
                ? "Token pode estar expirado ou sem o escopo 'whatsapp_business_management'."
                : undefined,
          },
          400,
        );
      }
      const list: MetaTpl[] = payload?.data ?? [];
      fetched.push(...list);
      url = payload?.paging?.next ?? null;
      pages++;
    }

    console.log(`[sync-templates] Fetched ${fetched.length} templates from Meta`);

    // 2. Load existing local rows keyed by (name+language)
    const { data: existing, error: exErr } = await supabase
      .from("meta_templates")
      .select("id, name, language, status, meta_template_id");
    if (exErr) throw exErr;

    const keyOf = (n: string, l: string) => `${n}::${l}`;
    const localMap = new Map<string, { id: string; status: string; meta_template_id: string | null }>();
    (existing ?? []).forEach((r: any) =>
      localMap.set(keyOf(r.name, r.language), {
        id: r.id,
        status: r.status,
        meta_template_id: r.meta_template_id,
      }),
    );

    let inserted = 0;
    let updated = 0;
    const errors: Array<{ name: string; error: string }> = [];

    for (const t of fetched) {
      const k = keyOf(t.name, t.language);
      const local = localMap.get(k);
      const row = {
        name: t.name,
        language: t.language,
        status: t.status,
        category: t.category,
        components: t.components ?? [],
        meta_template_id: t.id,
        updated_at: new Date().toISOString(),
      };

      try {
        if (!local) {
          const { error: insErr } = await supabase.from("meta_templates").insert(row);
          if (insErr) throw insErr;
          inserted++;
        } else if (
          local.status !== t.status ||
          local.meta_template_id !== t.id
        ) {
          const { error: updErr } = await supabase
            .from("meta_templates")
            .update(row)
            .eq("id", local.id);
          if (updErr) throw updErr;
          updated++;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[sync-templates] upsert failed for ${t.name}/${t.language}:`, msg);
        errors.push({ name: `${t.name}/${t.language}`, error: msg });
      }
    }

    console.log(`[sync-templates] Done. fetched=${fetched.length} inserted=${inserted} updated=${updated} errors=${errors.length}`);

    return json({
      fetched: fetched.length,
      inserted,
      updated,
      errors,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("[sync-templates] fatal:", msg);
    return json({ error: msg }, 500);
  }
});
