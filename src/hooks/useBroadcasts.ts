import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BroadcastCampaign {
  id: string;
  name: string;
  status: string;
  message_type: string;
  message_template: string;
  template_name?: string | null;
  template_language?: string | null;
  template_variables?: Record<string, unknown> | null;
  template_header_media?: Record<string, unknown> | null;
  media_url?: string | null;
  media_urls?: string[] | null;
  media_rotation_mode?: string | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  delivered_count: number;
  read_count: number;
  batch_size: number;
  delay_min_ms: number;
  delay_max_ms: number;
  delay_between_batches: number;
  delay_between_batches_max?: number | null;
  scheduled_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export function useBroadcasts() {
  const [campaigns, setCampaigns] = useState<BroadcastCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("broadcast_campaigns").select("*").order("created_at", { ascending: false });
    if (!error && data) setCampaigns(data as BroadcastCampaign[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch();
    const ch = supabase.channel("broadcasts-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "broadcast_campaigns" }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetch]);

  const create = async (payload: Partial<BroadcastCampaign>, recipients: Array<{ phone_number: string; variables?: Record<string, unknown> }>) => {
    const { data: campaign, error } = await supabase.from("broadcast_campaigns").insert({
      ...payload, total_recipients: recipients.length, status: "draft",
    } as any).select().single();
    if (error) throw error;
    if (recipients.length) {
      const rows = recipients.map((r) => ({ campaign_id: campaign.id, phone_number: r.phone_number, variables: r.variables || {} }));
      const chunks = chunk(rows, 500);
      for (const c of chunks) {
        const { error: e } = await supabase.from("broadcast_recipients").insert(c as any);
        if (e) throw e;
      }
    }
    await fetch();
    return campaign as BroadcastCampaign;
  };

  const start = async (id: string) => {
    await supabase.from("broadcast_campaigns").update({ status: "draft", next_batch_at: null }).eq("id", id);
    await supabase.functions.invoke("broadcast-processor", { body: { campaign_id: id } });
  };
  const pause = async (id: string) => { await supabase.from("broadcast_campaigns").update({ status: "paused" }).eq("id", id); };
  const resume = async (id: string) => {
    await supabase.from("broadcast_campaigns").update({ status: "processing", next_batch_at: null }).eq("id", id);
    await supabase.functions.invoke("broadcast-processor", { body: { campaign_id: id } });
  };
  const remove = async (id: string) => { await supabase.from("broadcast_campaigns").delete().eq("id", id); };

  return { campaigns, loading, fetch, create, start, pause, resume, remove };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
