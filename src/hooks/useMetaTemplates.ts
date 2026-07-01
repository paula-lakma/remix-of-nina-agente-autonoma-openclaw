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
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    await fetch();
    return data;
  };

  const syncStatuses = async () => {
    const { data, error } = await supabase.functions.invoke("sync-template-status", { body: {} });
    if (error) throw error;
    await fetch();
    return data;
  };

  const remove = async (id: string) => {
    await supabase.from("meta_templates").delete().eq("id", id);
  };

  return { templates, loading, fetch, submit, syncStatuses, remove };
}
