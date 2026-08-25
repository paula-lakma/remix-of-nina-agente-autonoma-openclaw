/**
 * POST /nina-reply
 * Callback assíncrono do agente OpenClaw: recebe a resposta de um run e a
 * enfileira em send_queue, reaproveitando o fluxo do whatsapp-sender.
 * NÃO mexe no whatsapp-sender nem no schema das filas — só INSERE em send_queue.
 *
 * F5b: runs de TESTE (run_id com prefixo 'test-') NÃO vão pro send_queue — são
 * gravados na tabela dedicada nina_test_results (lida pela edge fn nina-test).
 * Garante que a resposta de teste jamais seja enviada a um WhatsApp real.
 * O caminho de PRODUÇÃO (run_id sem 'test-') segue 100% inalterado.
 *
 * Auth: X-Panel-Token.
 * Body: { conversation_id, run_id, content, status }  (status = 'sent' | 'error')
 * Retorna: { queued: true, send_queue_id } | { test: true } | 204.
 */
import {
  adminClient,
  corsHeaders,
  errorResponse,
  jsonResponse,
  validatePanelToken,
} from "../_shared/panel.ts";
import {
  applyHandoff,
  isExpedicaoGrantReason,
  detectHandoffTarget,
  extractHandoffMarker,
  isOutsideDermoHours,
  resolveHandoffReason,
} from "../_shared/handoff.ts";


// EdgeRuntime é global no runtime de Edge Functions do Supabase (pode não existir
// em outros runtimes — por isso checamos antes de usar).
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  if (!(await validatePanelToken(req))) return errorResponse("Token inválido", 401);

  let body: {
    conversation_id?: string;
    run_id?: string;
    content?: string;
    status?: string;
    /** Motivo estruturado do handoff (fonte da verdade do roteamento). */
    handoff_reason?: string;
    handoff?: { reason?: string };
  };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Body JSON inválido", 400);
  }

  const conversationId = body.conversation_id;
  const runId = body.run_id;
  const content = (body.content ?? "").trim();
  const agentStatus = body.status === "error" ? "error" : "sent";

  // ── F5b: run de TESTE — grava no canal dedicado, NUNCA no send_queue ────────
  // A row já foi pré-criada (status='pending') pela edge fn nina-test; aqui só
  // preenchemos content/status. Retorna cedo — não toca send_queue de jeito nenhum.
  if (runId && runId.startsWith("test-")) {
    const admin = adminClient();
    const { error: updErr } = await admin
      .from("nina_test_results")
      .update({ content, status: agentStatus, updated_at: new Date().toISOString() })
      .eq("run_id", runId);
    if (updErr) {
      console.error("[nina-reply] nina_test_results update error:", updErr);
      return errorResponse("Erro ao registrar resultado de teste", 500);
    }
    console.log(`[nina-reply] resultado de teste registrado (run_id=${runId}, status=${agentStatus})`);
    return jsonResponse({ test: true, run_id: runId });
  }
  // ────────────────────────────────────────────────────────────────────────────

  if (!conversationId) return errorResponse("conversation_id obrigatório", 400);

  const supabase = adminClient();

  // send_queue exige contact_id (NOT NULL) — resolve a partir da conversa.
  // Traz também a client_memory do contato (p/ o analyze-conversation mesclar — GAP6).
  const { data: conversation, error: convErr } = await supabase
    .from("conversations")
    .select("id, contact_id, contact:contacts(client_memory)")
    .eq("id", conversationId)
    .maybeSingle();

  if (convErr) {
    console.error("[nina-reply] conversation lookup error:", convErr);
    return errorResponse("Erro ao buscar conversa", 500);
  }
  if (!conversation) return errorResponse("Conversa não encontrada", 404);

  // Run com erro ou sem conteúdo: nada a enviar ao lead (apenas registra).
  if (agentStatus === "error" || !content) {
    console.log(`[nina-reply] run ${runId} sem conteúdo enviável (status=${agentStatus})`);
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // DEDUP: se já existe resposta da Nina nesta conversa criada DEPOIS da última
  // msg do lead, PULA o insert. Cobre: (a) fallback Lovable respondeu + VPS
  // respondeu depois; (b) reaper recuperou + VPS depois. Não bloqueia o 1º turno
  // legítimo (aí ainda não há resposta da Nina após a última msg do lead).
  const { data: lastLead } = await supabase
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversation.id)
    .eq("from_type", "user")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastLead?.created_at) {
    const since = lastLead.created_at;
    const dupSq = await supabase
      .from("send_queue").select("id")
      .eq("conversation_id", conversation.id).eq("from_type", "nina")
      .gt("created_at", since).limit(1).maybeSingle();
    let alreadyReplied = !!dupSq.data;
    if (!alreadyReplied) {
      const dupMsg = await supabase
        .from("messages").select("id")
        .eq("conversation_id", conversation.id).eq("from_type", "nina")
        .gt("created_at", since).limit(1).maybeSingle();
      alreadyReplied = !!dupMsg.data;
    }
    if (alreadyReplied) {
      console.log(`[nina-reply] dedup: resposta já existe nesta conversa (run_id=${runId}) — pulando insert`);
      return jsonResponse({ deduped: true, run_id: runId ?? null });
    }
  }

  // ── Parse de marcadores [[IMG:url]] e [[PDF:url]] embutidos pela Nina ──────
  // A Nina é instruída (em produtos.md) a colocar uma linha [[IMG:<url>]] e/ou
  // [[PDF:<url>]] no TOPO da resposta quando indicar um produto/kit com mídia
  // cadastrada. Aqui extraímos cada marcador, validamos http(s) e enfileiramos
  // mensagens WhatsApp (`image` / `document`) ANTES do texto. O texto sem os
  // marcadores segue como `text` normal.
  // Marcador estruturado de handoff [[HANDOFF:<reason>]] — determina o DESTINO
  // do encaminhamento independentemente do texto escrito ao cliente. É removido
  // do conteúdo antes do envio.
  const markerParse = extractHandoffMarker(content);
  const structuredTarget =
    resolveHandoffReason(body.handoff_reason ?? body.handoff?.reason) ?? markerParse.target;

  const IMG_RE = /\[\[IMG:(https?:\/\/[^\s\]]+)\]\]/gi;
  const PDF_RE = /\[\[PDF:(https?:\/\/[^\s\]]+)\]\]/gi;
  const imageUrls: string[] = [];
  const pdfUrls: string[] = [];
  let cleaned = markerParse.cleaned
    .replace(IMG_RE, (_m, url) => {
      imageUrls.push(String(url).trim());
      return "";
    })
    .replace(PDF_RE, (_m, url) => {
      pdfUrls.push(String(url).trim());
      return "";
    });
  // colapsa linhas em branco que os marcadores deixaram para trás
  cleaned = cleaned.replace(/^\s+/, "").replace(/\n{3,}/g, "\n\n").trim();

  const queuedIds: string[] = [];
  const mediaItems: Array<{ type: "image" | "document"; url: string; filename?: string }> = [
    ...imageUrls.map((url) => ({ type: "image" as const, url })),
    ...pdfUrls.map((url) => {
      // tenta extrair filename amigável do path; cai pra 'protocolo.pdf'
      let filename = "protocolo.pdf";
      try {
        const u = new URL(url);
        const tail = decodeURIComponent(u.pathname.split("/").pop() || "");
        if (tail) filename = tail.toLowerCase().endsWith(".pdf") ? tail : `${tail}.pdf`;
      } catch (_e) { /* keep default */ }
      return { type: "document" as const, url, filename };
    }),
  ];

  // Mídias primeiro (uma mensagem por arquivo, com pequeno offset para ordenar)
  for (let i = 0; i < mediaItems.length; i++) {
    const item = mediaItems[i];
    if (!/^https?:\/\//i.test(item.url)) continue;
    const { data: mediaRow, error: mediaErr } = await supabase
      .from("send_queue")
      .insert({
        conversation_id: conversation.id,
        contact_id: conversation.contact_id,
        message_type: item.type,
        from_type: "nina",
        // Para `document`, o whatsapp-sender usa `content` como filename — passamos o nome do arquivo.
        content: item.type === "document" ? (item.filename ?? "protocolo.pdf") : "",
        media_url: item.url,
        status: "pending",
        scheduled_at: new Date(Date.now() + i * 400).toISOString(),
        metadata: {
          source: "openclaw",
          run_id: runId ?? null,
          agent_status: agentStatus,
          marker: item.type === "document" ? "pdf_marker" : "image_marker",
        },
      })
      .select("id")
      .single();
    if (mediaErr) {
      console.error(`[nina-reply] send_queue ${item.type} insert error:`, mediaErr);
    } else if (mediaRow) {
      queuedIds.push(mediaRow.id);
    }
  }

  // Texto (se sobrou) — agendado depois das imagens
  let textQueueId: string | null = null;
  if (cleaned) {
    const textOffset = mediaItems.length * 400;
    const { data: queued, error: insErr } = await supabase
      .from("send_queue")
      .insert({
        conversation_id: conversation.id,
        contact_id: conversation.contact_id,
        message_type: "text",
        from_type: "nina",
        content: cleaned,
        status: "pending",
        scheduled_at: textOffset > 0 ? new Date(Date.now() + textOffset).toISOString() : null,
        metadata: { source: "openclaw", run_id: runId ?? null, agent_status: agentStatus },
      })
      .select("id")
      .single();
    if (insErr || !queued) {
      console.error("[nina-reply] send_queue insert error:", insErr);
      if (queuedIds.length === 0) return errorResponse("Erro ao enfileirar resposta", 500);
    } else {
      textQueueId = queued.id;
      queuedIds.push(queued.id);
    }
  }

  if (queuedIds.length === 0) {
    console.log(`[nina-reply] nada a enfileirar (run_id=${runId})`);
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  const queued = { id: textQueueId ?? queuedIds[0] };

  // Aciona o whatsapp-sender pra DRENAR a fila — mesmo padrão do nina-orchestrator
  // (mesma função alvo + header service-role). No caminho OpenClaw assíncrono
  // ninguém mais aciona o envio; sem isto a resposta fica 'pending' pra sempre.
  // EdgeRuntime.waitUntil mantém o disparo vivo após a resposta, sem bloqueá-la.
  // NÃO altera o whatsapp-sender nem o schema da fila — só ACIONA o sender existente.
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const triggerSender = fetch(`${supabaseUrl}/functions/v1/whatsapp-sender`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
    body: JSON.stringify({ triggered_by: "nina-reply" }),
  }).catch((err) => console.error("[nina-reply] Error triggering whatsapp-sender:", err));

  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(triggerSender);
  }

  // GAP6: dispara analyze-conversation pra atualizar a client_memory do lead também
  // no caminho openclaw. O orchestrator só dispara no caminho lovable; o ramo
  // openclaw faz o dispatch async e retorna antes -> a memória nunca atualizava.
  // Espelha o trigger do orchestrator (mesmo alvo + header service-role + body).
  // 1x por reply, só no caminho real (o de teste já retornou cedo). NÃO altera o
  // analyze-conversation nem o caminho lovable.
  const currentMemory = (conversation as any).contact?.client_memory ?? {};
  const triggerAnalyze = (async () => {
    // user_message = última mensagem do lead nesta conversa (pode faltar -> '').
    let userMessage = "";
    try {
      const { data: lastUserMsg } = await supabase
        .from("messages")
        .select("content")
        .eq("conversation_id", conversation.id)
        .eq("from_type", "user")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      userMessage = lastUserMsg?.content ?? "";
    } catch (_e) {
      // segue com user_message vazio
    }
    await fetch(`${supabaseUrl}/functions/v1/analyze-conversation`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({
        contact_id: conversation.contact_id,
        conversation_id: conversation.id,
        user_message: userMessage,
        ai_response: cleaned || content,
        current_memory: currentMemory,
      }),
    });
  })().catch((err) => console.error("[nina-reply] Error triggering analyze-conversation:", err));

  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(triggerAnalyze);
  }

  // ── HANDOFF HUMANO (matriz de destinos em _shared/handoff.ts) ──────────────
  // DETERMINÍSTICO: o destino vem do `handoff_reason` estruturado (body ou
  // marcador [[HANDOFF:reason]]). O texto enviado ao cliente NÃO decide o
  // destino. A regex antiga permanece apenas como fallback legado.
  // Para dermoconsultora, as regras de horário comercial seguem preservadas.
  try {
    let target: { reason: string; destination: "comercial" | "parcerias" | "financeiro" | "dermoconsultant" } | null =
      structuredTarget;
    let source: "structured" | "regex_fallback" = "structured";

    if (!target) {
      // ⚠️ FALLBACK LEGADO — só quando não houve motivo estruturado.
      const confirmedHandoffRegex = /\bvou\s+(deixar|encaminhar|passar)\b|deixar.{0,15}encaminhad[oa]|encaminhar (sua |seu )?(d[úu]vida|caso|atendimento|solicita[çc][ãa]o)|vou\s+chamar\s+(a|o)\s+respons[áa]vel/i;
      const askingOnlyRegex = /(voc[êe] (quer|prefere)|deseja).{0,80}(encaminhar|deixar.{0,15}encaminhad|aguardar)/i;

      if (confirmedHandoffRegex.test(content) && !askingOnlyRegex.test(content)) {
        let leadText = "";
        try {
          const { data: lastMsg } = await supabase
            .from("messages").select("content")
            .eq("conversation_id", conversation.id).eq("from_type", "user")
            .order("sent_at", { ascending: false }).limit(1).maybeSingle();
          leadText = lastMsg?.content ?? "";
        } catch (_e) { /* ignore */ }

        target =
          detectHandoffTarget(content) ??
          detectHandoffTarget(leadText);
        source = "regex_fallback";
      }
    }

    if (target) {
      const { outsideHours, weekday, hour } =
        target.destination === "dermoconsultant"
          ? isOutsideDermoHours()
          : { outsideHours: false, weekday: "", hour: 0 };

      const handoffResult = await applyHandoff(supabase, {
        conversationId: conversation.id,
        contactId: conversation.contact_id,
        destination: target.destination,
        reason: target.reason,
        runId: runId ?? null,
        snippet: content,
        outsideHours,
        extraMetadata: {
          reason_source: source,
          ...(target.destination === "dermoconsultant"
            ? { tz: "America/Sao_Paulo", weekday, hour }
            : {}),
        },
      });

      // ── FASE A (desativada por padrão) ───────────────────────────────────
      // Concessão controlada de acesso da expedição ao Chat ao Vivo.
      // Só ocorre com a flag EXPEDICAO_CHAT_HANDOFF_ENABLED=true, motivo
      // ESTRUTURADO (nunca regex) e dentro da allowlist fechada.
      try {
        const grantEnabled = (Deno.env.get("EXPEDICAO_CHAT_HANDOFF_ENABLED") ?? "false") === "true";
        if (
          grantEnabled &&
          source === "structured" &&
          isExpedicaoGrantReason(target.reason) &&
          handoffResult.team_member_id
        ) {
          const { data: grant, error: grantErr } = await supabase.rpc(
            "internal_grant_expedicao_access",
            {
              _conversation_id: conversation.id,
              _team_member_id: handoffResult.team_member_id,
              _reason: target.reason,
              _origin: "nina",
              _trigger_message_id: null,
              _trigger_snippet: cleaned || content,
            },
          );
          if (grantErr) console.error("[nina-reply] grant expedicao error:", grantErr);
          else console.log("[nina-reply] grant expedicao:", JSON.stringify(grant));
        }
      } catch (ge) {
        console.error("[nina-reply] grant expedicao exception:", ge);
      }
    }
  } catch (e) {
    console.error("[nina-reply] handoff resolution error:", e);
  }


  return jsonResponse({ queued: true, send_queue_id: queued.id });
});
