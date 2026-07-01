import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getNinaMetaCreds } from "../_shared/nina-meta.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const conn = await getNinaMetaCreds(supabase);

    const { data: pending, error } = await supabase
      .from("meta_templates").select("id, meta_template_id, status")
      .eq("status", "PENDING").not("meta_template_id", "is", null);
    if (error) throw error;
    if (!pending?.length) {
      return new Response(JSON.stringify({ updated: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let updated = 0;
    for (const t of pending) {
      try {
        const res = await fetch(`${GRAPH_API}/${t.meta_template_id}?access_token=${conn.access_token}`);
        const data = await res.json();
        if (data.status && data.status !== t.status) {
          await supabase.from("meta_templates").update({ status: data.status, updated_at: new Date().toISOString() }).eq("id", t.id);
          updated++;
        }
      } catch (e) { console.error(`sync error for ${t.id}:`, e); }
    }
    return new Response(JSON.stringify({ updated, checked: pending.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
