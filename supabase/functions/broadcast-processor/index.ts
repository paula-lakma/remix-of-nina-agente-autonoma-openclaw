import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_EXECUTION_MS = 50000;
const SEND_TIMEOUT_MS = 15000;
const LOCK_DURATION_S = 90;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { campaign_id } = await req.json();
    if (!campaign_id) throw new Error("campaign_id is required");

    const { data: campaign, error: campaignError } = await supabase
      .from("broadcast_campaigns").select("*").eq("id", campaign_id).single();
    if (campaignError || !campaign) throw new Error(`Campaign not found: ${campaignError?.message}`);

    if (["paused", "completed", "failed"].includes(campaign.status)) {
      return jsonResponse({ success: true, message: `Campaign is ${campaign.status}` });
    }

    if (campaign.status === "draft") {
      const { data: r } = await supabase.from("broadcast_campaigns")
        .update({ status: "processing", started_at: new Date().toISOString(), next_batch_at: null })
        .eq("id", campaign_id).eq("status", "draft").select("id");
      if (!r?.length) return jsonResponse({ success: true, message: "Another invocation is processing" });
    } else {
      if (campaign.next_batch_at) {
        const nb = new Date(campaign.next_batch_at).getTime();
        if (nb > Date.now()) {
          await sleep(Math.min(nb - Date.now(), 23000));
          selfInvoke(supabase, campaign_id);
          return jsonResponse({ success: true, message: "Waiting for next batch" });
        }
      }
      const lockUntil = new Date(Date.now() + LOCK_DURATION_S * 1000).toISOString();
      const nowIso = new Date().toISOString();
      let locked = false;
      const { data: l1 } = await supabase.from("broadcast_campaigns").update({ next_batch_at: lockUntil })
        .eq("id", campaign_id).is("next_batch_at", null).select("id");
      locked = !!l1?.length;
      if (!locked) {
        const { data: l2 } = await supabase.from("broadcast_campaigns").update({ next_batch_at: lockUntil })
          .eq("id", campaign_id).lt("next_batch_at", nowIso).select("id");
        locked = !!l2?.length;
      }
      if (!locked) return jsonResponse({ success: true, message: "Another invocation is processing" });
    }

    const isTemplate = campaign.message_type === "template";
    const isMedia = ["image", "video", "document"].includes(campaign.message_type);
    const batchSize = campaign.batch_size || 10;
    const delayMinMs = campaign.delay_min_ms || 5000;
    const delayMaxMs = campaign.delay_max_ms || 15000;
    const delayBetweenBatchesMinMs = (campaign.delay_between_batches || 300) * 1000;
    const delayBetweenBatchesMaxMs = (campaign.delay_between_batches_max || campaign.delay_between_batches || 300) * 1000;

    const mediaUrls: string[] = campaign.media_urls || [];
    const mediaRotationMode: string = campaign.media_rotation_mode || "random";
    let mediaSeq = 0;

    const { data: recipients, error: recErr } = await supabase.from("broadcast_recipients")
      .select("*").eq("campaign_id", campaign_id).eq("status", "pending")
      .order("created_at", { ascending: true }).limit(batchSize);
    if (recErr) throw new Error(recErr.message);

    if (!recipients?.length) {
      await supabase.from("broadcast_campaigns").update({
        status: "completed", completed_at: new Date().toISOString(), next_batch_at: null,
      }).eq("id", campaign_id);
      return jsonResponse({ success: true, message: "Campaign completed", processed: 0 });
    }

    const startTime = Date.now();
    let processed = 0, sent = 0, failed = 0, hitTimeout = false;

    for (const recipient of recipients) {
      if (Date.now() - startTime + SEND_TIMEOUT_MS + 2000 > MAX_EXECUTION_MS) { hitTimeout = true; break; }
      if (processed > 0 && processed % 5 === 0) {
        const { data: curr } = await supabase.from("broadcast_campaigns").select("status").eq("id", campaign_id).single();
        if (curr?.status === "paused") break;
      }

      try {
        const { text: spintaxResolved, indices } = resolveSpintaxWithIndices(campaign.message_template);
        const messageContent = applyTemplate(spintaxResolved, recipient.variables || {});
        const normalizedPhone = normalizeBrazilianPhone(recipient.phone_number) ?? recipient.phone_number.replace(/\D/g, "");

        let sendMediaUrl = campaign.media_url || undefined;
        if (isMedia && mediaUrls.length) {
          if (mediaUrls.length === 1) sendMediaUrl = mediaUrls[0];
          else if (mediaRotationMode === "sequential") { sendMediaUrl = mediaUrls[mediaSeq % mediaUrls.length]; mediaSeq++; }
          else if (mediaRotationMode === "fixed") sendMediaUrl = mediaUrls[0];
          else sendMediaUrl = mediaUrls[Math.floor(Math.random() * mediaUrls.length)];
        }

        // deno-lint-ignore no-explicit-any
        let payload: Record<string, any>;
        if (isTemplate) {
          const bodyVars: string[] = [];
          const vars = recipient.variables || {};
          const matches = (campaign.message_template || "").match(/\{\{([^}]+)\}\}/g) || [];
          for (const m of matches) {
            const n = m.replace(/\{\{|\}\}/g, "");
            bodyVars.push(vars[n] ?? n);
          }
          // deno-lint-ignore no-explicit-any
          const templateVars: Record<string, string[]> = {};
          if (bodyVars.length) templateVars.body = bodyVars;
          const headerMedia = campaign.template_header_media || {};
          payload = {
            phone_number: normalizedPhone,
            message_type: "template",
            template_name: campaign.template_name,
            template_language: campaign.template_language || "pt_BR",
            template_variables: templateVars,
            header_media: headerMedia?.type ? headerMedia : undefined,
          };
        } else {
          payload = {
            phone_number: normalizedPhone,
            content: messageContent,
            message_type: campaign.message_type || "text",
            media_url: sendMediaUrl,
          };
        }

        const { data: sendResult, error: sendError } = await invokeWithTimeout(
          supabase, "send-meta-message", payload, SEND_TIMEOUT_MS
        );
        if (sendError) throw new Error(sendError.message || "Send function error");
        if (!sendResult?.success) throw new Error(sendResult?.error || "Send failed");

        await supabase.from("broadcast_recipients").update({
          status: "sent", sent_at: new Date().toISOString(),
          variation_indices: indices, sent_media_url: sendMediaUrl || null,
        }).eq("id", recipient.id);
        sent++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        await supabase.from("broadcast_recipients").update({ status: "failed", error_message: msg }).eq("id", recipient.id);
        failed++;
      }

      processed++;
      if (processed < recipients.length) {
        const d = randDelay(delayMinMs, delayMaxMs);
        if (Date.now() - startTime + d + SEND_TIMEOUT_MS > MAX_EXECUTION_MS) { hitTimeout = true; break; }
        await sleep(d);
      }
    }

    await supabase.from("broadcast_campaigns").update({
      sent_count: (campaign.sent_count || 0) + sent,
      failed_count: (campaign.failed_count || 0) + failed,
    }).eq("id", campaign_id);

    const { count: remaining } = await supabase.from("broadcast_recipients")
      .select("*", { count: "exact", head: true }).eq("campaign_id", campaign_id).eq("status", "pending");

    if ((remaining || 0) > 0) {
      const { data: latest } = await supabase.from("broadcast_campaigns").select("status").eq("id", campaign_id).single();
      if (latest?.status === "processing") {
        if (!hitTimeout && processed >= recipients.length) {
          const pause = randDelay(delayBetweenBatchesMinMs, delayBetweenBatchesMaxMs);
          await supabase.from("broadcast_campaigns")
            .update({ next_batch_at: new Date(Date.now() + pause).toISOString() }).eq("id", campaign_id);
        } else {
          await supabase.from("broadcast_campaigns").update({ next_batch_at: null }).eq("id", campaign_id);
        }
        await sleep(500);
        selfInvoke(supabase, campaign_id);
      } else {
        await supabase.from("broadcast_campaigns").update({ next_batch_at: null }).eq("id", campaign_id);
      }
    } else {
      await supabase.from("broadcast_campaigns").update({
        status: "completed", completed_at: new Date().toISOString(), next_batch_at: null,
      }).eq("id", campaign_id);
    }

    return jsonResponse({ success: true, processed, sent, failed, remaining: remaining || 0 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[broadcast-processor] Error: ${msg}`);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// deno-lint-ignore no-explicit-any
function jsonResponse(body: Record<string, any>) {
  return new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
// deno-lint-ignore no-explicit-any
function selfInvoke(supabase: any, campaign_id: string) {
  supabase.functions.invoke("broadcast-processor", { body: { campaign_id } }).catch(console.error);
}
// deno-lint-ignore no-explicit-any
async function invokeWithTimeout(supabase: any, fn: string, body: any, timeout: number) {
  return await Promise.race([
    supabase.functions.invoke(fn, { body }),
    new Promise<{ data: null; error: Error }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: new Error(`Timeout after ${timeout}ms`) }), timeout)
    ),
  ]);
}
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function randDelay(min: number, max: number) { return Math.floor(min + Math.random() * (max - min + 1)); }

// deno-lint-ignore no-explicit-any
function applyTemplate(template: string, variables: Record<string, any>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, k) => (variables[k.trim()] ?? "") + "");
}

function resolveSpintaxWithIndices(text: string): { text: string; indices: number[] } {
  const indices: number[] = [];
  const re = /\{([^{}]+)\}/g;
  let out = text;
  let m;
  while ((m = re.exec(out)) !== null) {
    const options = m[1].split("|");
    if (options.length < 2) continue;
    const idx = Math.floor(Math.random() * options.length);
    indices.push(idx);
    out = out.slice(0, m.index) + options[idx] + out.slice(m.index + m[0].length);
    re.lastIndex = m.index + options[idx].length;
  }
  return { text: out, indices };
}

function normalizeBrazilianPhone(raw: string): string | null {
  let d = String(raw).replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return null;
  if (d.length === 10) { const ddd = d.slice(0, 2); const rest = d.slice(2); return "55" + ddd + "9" + rest; }
  return "55" + d;
}
