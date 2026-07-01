// Validador de números BR — normaliza para o formato E.164 com/sem 9º dígito.
// A API oficial da Meta Cloud não oferece um endpoint público de "checar se número tem WhatsApp",
// então essa função apenas normaliza e valida formato brasileiro (10 ou 11 dígitos).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalizeBrazilianPhone(raw: string): string | null {
  let d = String(raw).replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return null;
  if (d.length === 10) { const ddd = d.slice(0, 2); const rest = d.slice(2); return "55" + ddd + "9" + rest; }
  return "55" + d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { numbers } = await req.json();
    if (!Array.isArray(numbers) || !numbers.length) {
      return new Response(JSON.stringify({ error: "numbers[] is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = numbers.map((raw: string) => {
      const normalized = normalizeBrazilianPhone(raw);
      return { phone: normalized ?? String(raw).replace(/\D/g, ""), exists: !!normalized, jid: null as string | null };
    });

    const validCount = results.filter((r) => r.exists).length;
    return new Response(
      JSON.stringify({ results, validCount, invalidCount: results.length - validCount, total: results.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
