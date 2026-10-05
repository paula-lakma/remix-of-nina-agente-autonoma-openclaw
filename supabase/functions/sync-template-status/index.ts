import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getNinaMetaCreds } from "../_shared/nina-meta.ts";
import { requireAdminOrManager } from "../_shared/staffAuth.ts";
import { mergeTemplateReview } from "../_shared/templateRules.ts";

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
  rejected_reason?: string;
}

/** Classifica erros da Graph API em algo legível para o operador. */
function classifyMetaError(err: { message?: string; code?: number; type?: string; error_subcode?: number }) {
  const code = err?.code;
  let kind = "meta_error";
  let hint: string | undefined;

  if (code === 190) {
    kind = "auth_error";
    hint = "Token de acesso inválido ou expirado. Gere um novo token do WhatsApp Business e salve em Configurações.";
  } else if (code === 200 || code === 10 || code === 299) {
    kind = "permission_error";
    hint = "O token não tem a permissão 'whatsapp_business_management' para este WABA.";
  } else if (code === 100) {
    kind = "waba_error";
    hint = "WABA ID inválido ou o token não tem acesso a esta conta do WhatsApp Business.";
  } else if (code === 4 || code === 613) {
    kind = "rate_limit";
    hint = "Limite de chamadas da Meta atingido. Tente novamente em alguns minutos.";
  }

  return {
    kind,
    error: err?.message || "Erro desconhecido da Graph API",
    code,
    type: err?.type,
    hint,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // Só admin/manager com sessão real. Chave pública/anônima é recusada.
  const auth = await requireAdminOrManager(req);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  let dryRun = false;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      dryRun = Boolean((body as { dryRun?: boolean })?.dryRun);
    }
  } catch (_e) {
    dryRun = false;
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let conn: { access_token: string; phone_number_id: string; waba_id: string };
    try {
      conn = await getNinaMetaCreds(supabase);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ ok: false, kind: "credentials_missing", error: msg, waba_id_present: false }, 400);
    }

    if (!conn.waba_id) {
      return json(
        {
          ok: false,
          kind: "waba_missing",
          waba_id_present: false,
          error: "whatsapp_business_account_id ausente em nina_settings.",
          hint: "Configure o WABA ID em Configurações para listar os templates da Meta.",
        },
        400,
      );
    }

    // ── 1. Lista todos os templates do WABA (paginado) ──────────────────────
    const fetched: MetaTpl[] = [];
    let url: string | null =
      `${GRAPH_API}/${conn.waba_id}/message_templates` +
      `?fields=name,language,status,category,components,id,rejected_reason&limit=200` +
      `&access_token=${encodeURIComponent(conn.access_token)}`;

    let pages = 0;
    while (url && pages < 20) {
      const res = await fetch(url);
      const payload = await res.json();
      if (payload?.error) {
        const cls = classifyMetaError(payload.error);
        console.error("[sync-templates] Meta list error:", cls);
        return json({ ok: false, waba_id_present: true, ...cls }, 400);
      }
      const list: MetaTpl[] = payload?.data ?? [];
      fetched.push(...list);
      url = payload?.paging?.next ?? null;
      pages++;
    }

    console.log(`[sync-templates] Fetched ${fetched.length} templates from Meta (pages=${pages})`);

    // ── 2. Carrega registros locais ─────────────────────────────────────────
    const { data: existing, error: exErr } = await supabase
      .from("meta_templates")
      .select("id, name, language, status, category, samples, meta_template_id");
    if (exErr) throw exErr;

    const keyOf = (n: string, l: string) => `${n}::${l}`;
    const remoteKeys = new Set(fetched.map((t) => keyOf(t.name, t.language)));

    // ── 2b. Complemento por ID: linhas locais com meta_template_id que não
    //        apareceram na listagem do WABA são consultadas diretamente.
    const byIdErrors: Array<{ name: string; error: string; code?: number }> = [];
    for (const row of existing ?? []) {
      const r = row as { name: string; language: string; meta_template_id: string | null };
      if (!r.meta_template_id) continue;
      if (remoteKeys.has(keyOf(r.name, r.language))) continue;
      try {
        const res = await fetch(
          `${GRAPH_API}/${r.meta_template_id}?fields=name,language,status,category,components,rejected_reason` +
            `&access_token=${encodeURIComponent(conn.access_token)}`,
        );
        const payload = await res.json();
        if (payload?.error) {
          const cls = classifyMetaError(payload.error);
          byIdErrors.push({ name: `${r.name}/${r.language}`, error: cls.error, code: cls.code });
          continue;
        }
        fetched.push({
          id: String(payload.id ?? r.meta_template_id),
          name: payload.name ?? r.name,
          language: payload.language ?? r.language,
          status: payload.status,
          category: payload.category,
          components: payload.components ?? [],
          rejected_reason: payload.rejected_reason,
        });
        console.log(`[sync-templates] by-id lookup ${r.name}/${r.language} -> ${payload.status}`);
      } catch (e) {
        byIdErrors.push({ name: `${r.name}/${r.language}`, error: e instanceof Error ? e.message : String(e) });
      }
    }

    type LocalRow = { id: string; status: string; category: string | null; samples: unknown; meta_template_id: string | null };
    const localMap = new Map<string, LocalRow>();
    (existing ?? []).forEach((r: LocalRow & { name: string; language: string }) =>
      localMap.set(keyOf(r.name, r.language), {
        id: r.id,
        status: r.status,
        category: r.category,
        samples: r.samples,
        meta_template_id: r.meta_template_id,
      }),
    );

    // ── 3. Aplica diferenças ────────────────────────────────────────────────
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    const errors: Array<{ name: string; error: string }> = [];
    const results: Array<{
      name: string;
      language: string;
      meta_status: string;
      local_status: string | null;
      meta_template_id: string;
      action: "inserted" | "updated" | "unchanged" | "failed" | "dry_run";
    }> = [];

    for (const t of fetched) {
      const k = keyOf(t.name, t.language);
      const local = localMap.get(k);
      const samples = mergeTemplateReview(local?.samples, { rejected_reason: t.rejected_reason, status: t.status });
      const row = {
        samples,
        name: t.name,
        language: t.language,
        status: t.status,
        category: t.category,
        components: t.components ?? [],
        meta_template_id: t.id,
        updated_at: new Date().toISOString(),
      };

      const needsInsert = !local;
      const needsUpdate = !!local && (local.status !== t.status || local.meta_template_id !== t.id ||
        local.category !== t.category || JSON.stringify(local.samples ?? {}) !== JSON.stringify(samples));

      if (dryRun) {
        results.push({
          name: t.name,
          language: t.language,
          meta_status: t.status,
          local_status: local?.status ?? null,
          meta_template_id: t.id,
          action: "dry_run",
        });
        if (needsInsert || needsUpdate) updated++;
        else unchanged++;
        continue;
      }

      try {
        if (needsInsert) {
          const { error: insErr } = await supabase.from("meta_templates").insert(row);
          if (insErr) throw insErr;
          inserted++;
          results.push({ name: t.name, language: t.language, meta_status: t.status, local_status: null, meta_template_id: t.id, action: "inserted" });
        } else if (needsUpdate) {
          const { error: updErr } = await supabase.from("meta_templates").update(row).eq("id", local!.id);
          if (updErr) throw updErr;
          updated++;
          results.push({ name: t.name, language: t.language, meta_status: t.status, local_status: local!.status, meta_template_id: t.id, action: "updated" });
        } else {
          unchanged++;
          results.push({ name: t.name, language: t.language, meta_status: t.status, local_status: local!.status, meta_template_id: t.id, action: "unchanged" });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : ((e as { message?: string })?.message ?? JSON.stringify(e));
        console.error(`[sync-templates] upsert failed for ${t.name}/${t.language}:`, msg);
        errors.push({ name: `${t.name}/${t.language}`, error: msg });
        results.push({ name: t.name, language: t.language, meta_status: t.status, local_status: local?.status ?? null, meta_template_id: t.id, action: "failed" });
      }
    }

    for (const e of byIdErrors) errors.push({ name: e.name, error: e.error });

    const failed = errors.length;
    const ok = failed === 0;

    console.log(
      `[sync-templates] done dryRun=${dryRun} fetched=${fetched.length} inserted=${inserted} updated=${updated} unchanged=${unchanged} failed=${failed}`,
    );

    return json({
      ok,
      dryRun,
      waba_id_present: true,
      fetched: fetched.length,
      inserted,
      updated,
      unchanged,
      failed,
      errors,
      results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("[sync-templates] fatal:", msg);
    return json({ ok: false, kind: "internal_error", error: msg }, 500);
  }
});
