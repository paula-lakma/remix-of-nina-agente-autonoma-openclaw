import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MetaTemplate {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
  meta_template_id?: string | null;
  components: unknown;
  samples?: unknown;
  labels?: unknown;
  validation_score?: number | null;
  created_at: string;
  updated_at: string;
}

const FN_ERROR_TEXT: Record<string, string> = {
  unauthorized: "Sessão inválida. Entre novamente.",
  forbidden: "Somente admin ou gerente pode gerenciar templates.",
};

/** Lê o corpo de respostas 4xx/5xx das funções para mostrar o motivo real. */
async function readFnError(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const b = await ctx.clone().json();
      const code = String(b?.error ?? "");
      return FN_ERROR_TEXT[code] || b?.message || (b?.hint ? `${code} — ${b.hint}` : code) || fallback;
    } catch { /* corpo não-JSON */ }
  }
  return (error as Error)?.message || fallback;
}

export function useMetaTemplates() {
  const [templates, setTemplates] = useState<MetaTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("meta_templates").select("*").order("created_at", { ascending: false });
    setTemplates((data || []) as unknown as MetaTemplate[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch();
    const ch = supabase.channel("meta-templates-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "meta_templates" }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetch]);

  const submit = async (templateData: unknown, opts?: { isEdit?: boolean; templateId?: string; metaTemplateId?: string }) => {
    const { data, error } = await supabase.functions.invoke("submit-template", {
      body: { templateData, ...opts },
    });
    if (error) throw new Error(await readFnError(error, "Erro ao submeter template"));
    if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
    await fetch();
    return data;
  };

  const syncStatuses = async (opts?: { dryRun?: boolean }) => {
    const { data, error } = await supabase.functions.invoke("sync-template-status", {
      body: { dryRun: opts?.dryRun ?? false },
    });
    if (error) throw new Error(await readFnError(error, "Falha ao sincronizar com a Meta."));
    const res = data as {
      ok?: boolean;
      error?: string;
      hint?: string;
      errors?: Array<{ name: string; error: string }>;
      updated?: number;
      inserted?: number;
      unchanged?: number;
      failed?: number;
    } | null;
    if (!res || res.ok === false || res.error) {
      const detail = res?.hint ? `${res?.error} — ${res.hint}` : res?.error;
      throw new Error(detail || "Falha ao sincronizar com a Meta.");
    }
    if ((res.failed ?? 0) > 0) {
      const first = res.errors?.[0];
      throw new Error(
        `Sincronização parcial: ${res.failed} template(s) falharam${first ? ` (${first.name}: ${first.error})` : ""}.`,
      );
    }
    await fetch();
    return res;
  };


  const remove = async (id: string) => {
    await supabase.from("meta_templates").delete().eq("id", id);
  };

  return { templates, loading, fetch, submit, syncStatuses, remove };
}
