import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/audio/transcriptions";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: service-role/user JWT OR X-Panel-Token (used by the pg_cron safety net)
  const panelToken = req.headers.get('x-panel-token');
  let panelOk = false;
  if (panelToken) {
    const { validatePanelToken } = await import("../_shared/panel.ts");
    panelOk = await validatePanelToken(req);
  }
  if (!panelOk) {
    const { requireAuth } = await import("../_shared/auth.ts");
    const authFail = await requireAuth(req, corsHeaders);
    if (authFail) return authFail;
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[MessageGrouper] Starting message grouping...');

    // Messages that blew past the 2h recovery window: flagged as expired (never "processed")
    const { data: expiredCount, error: expireError } = await supabase.rpc('expire_stale_message_grouping');
    if (expireError) {
      console.error('[MessageGrouper] Error expiring stale messages:', expireError);
    } else if (expiredCount) {
      console.log(`[MessageGrouper] Expired ${expiredCount} stale queue entries (no client message sent)`);
    }

    // ATOMIC CLAIM (lease-based). processed stays false until the work really succeeds.
    const { data: readyMessages, error: fetchError } = await supabase
      .rpc('claim_message_grouping_batch', { p_limit: 50 });

    if (fetchError) {
      console.error('[MessageGrouper] Error claiming messages:', fetchError);
      throw fetchError;
    }

    if (!readyMessages || readyMessages.length === 0) {
      console.log('[MessageGrouper] No messages claimed');

      // Check pending messages (future OR already due but unclaimed) and schedule re-invocation
      await scheduleNextProcessing(supabase, supabaseUrl, supabaseServiceKey);

      return new Response(JSON.stringify({ processed: 0, groups: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[MessageGrouper] Claimed ${readyMessages.length} messages`);

    // Group messages by phone number
    const grouped: Record<string, typeof readyMessages> = {};
    for (const msg of readyMessages) {
      const phone = msg.message_data?.from;
      if (!phone) continue;
      if (!grouped[phone]) grouped[phone] = [];
      grouped[phone].push(msg);
    }

    const groupCount = Object.keys(grouped).length;
    console.log(`[MessageGrouper] Grouped into ${groupCount} phone numbers`);

    let processedCount = 0;

    // Marks queue rows as truly processed (only after the group succeeded)
    const markProcessed = async (rows: any[]) => {
      const ids = rows.map((m) => m.id);
      if (ids.length === 0) return;
      await supabase
        .from('message_grouping_queue')
        .update({ processed: true })
        .in('id', ids);
    };

    // Process each group
    for (const [phoneNumber, messages] of Object.entries(grouped)) {
      try {
        console.log(`[MessageGrouper] Processing group for ${phoneNumber} with ${messages.length} messages`);

        // Get the phone_number_id from the first message
        const phoneNumberId = messages[0].phone_number_id;

        // Get owner settings for this phone_number_id
        const { data: ownerSettings } = await supabase
          .from('nina_settings')
          .select('user_id, whatsapp_access_token')
          .eq('whatsapp_phone_number_id', phoneNumberId)
          .maybeSingle();

        // Get all message_ids from the queue entries
        const messageIds = messages.map(m => m.message_id).filter(Boolean);
        
        if (messageIds.length === 0) {
          console.log(`[MessageGrouper] No message_ids found for group ${phoneNumber}, skipping`);
          continue;
        }

        // Fetch the actual messages from the database
        const { data: dbMessages, error: dbMsgError } = await supabase
          .from('messages')
          .select('*')
          .in('id', messageIds)
          .order('sent_at', { ascending: true });

        if (dbMsgError || !dbMessages || dbMessages.length === 0) {
          console.error('[MessageGrouper] Error fetching messages from DB:', dbMsgError);
          continue;
        }

        // Get the last message's conversation for context
        const lastDbMessage = dbMessages[dbMessages.length - 1];
        const conversationId = lastDbMessage.conversation_id;

        // Get conversation details
        const { data: conversation } = await supabase
          .from('conversations')
          .select('*, contacts(*)')
          .eq('id', conversationId)
          .single();

        if (!conversation) {
          console.error('[MessageGrouper] Conversation not found:', conversationId);
          continue;
        }

        // Combine content and handle audio transcription
        const combinedContent = await combineAndTranscribeMessages(
          supabase,
          messages,
          dbMessages,
          ownerSettings,
          lovableApiKey
        );

        console.log(`[MessageGrouper] Combined content for ${phoneNumber}:`, combinedContent.substring(0, 200));

        // Update the last message with combined content if multiple messages
        if (dbMessages.length > 1) {
          await supabase
            .from('messages')
            .update({
              content: combinedContent,
              metadata: {
                ...lastDbMessage.metadata,
                grouped_messages: messageIds,
                message_count: messageIds.length
              }
            })
            .eq('id', lastDbMessage.id);
          
          console.log(`[MessageGrouper] Updated last message with combined content`);
        } else if (dbMessages[0].type === 'audio' && combinedContent !== dbMessages[0].content) {
          // Update single audio message with transcription
          await supabase
            .from('messages')
            .update({ content: combinedContent })
            .eq('id', dbMessages[0].id);
          
          console.log(`[MessageGrouper] Updated audio message with transcription`);
        }

        // If conversation is handled by Nina, queue for AI processing.
        // Idempotent at the DB level: unique index on nina_processing_queue(message_id).
        if (conversation.status === 'nina') {
          const { error: ninaQueueError } = await supabase
            .from('nina_processing_queue')
            .upsert({
              message_id: lastDbMessage.id,
              conversation_id: conversationId,
              contact_id: conversation.contact_id,
              priority: 1,
              context_data: {
                phone_number_id: phoneNumberId,
                contact_name: conversation.contacts?.name || conversation.contacts?.call_name,
                message_type: lastDbMessage.type,
                grouped_count: messageIds.length,
                combined_content: combinedContent
              }
            }, { onConflict: 'message_id', ignoreDuplicates: true });

          if (ninaQueueError) {
            // Do NOT mark as processed: the lease expires and the message is retried.
            console.error('[MessageGrouper] Error queuing for Nina:', ninaQueueError);
            continue;
          }

          console.log('[MessageGrouper] Message queued for Nina processing');

          // Trigger nina-orchestrator
          fetch(`${supabaseUrl}/functions/v1/nina-orchestrator`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({ triggered_by: 'message-grouper' })
          }).catch(err => console.error('[MessageGrouper] Error triggering nina-orchestrator:', err));
        }

        // Only now the entries are truly processed
        await markProcessed(messages);

        processedCount += messages.length;
        console.log(`[MessageGrouper] Group ${phoneNumber} processed successfully`);


      } catch (groupError) {
        console.error(`[MessageGrouper] Error processing group ${phoneNumber}:`, groupError);
      }
    }

    console.log(`[MessageGrouper] Completed. Processed ${processedCount} messages in ${groupCount} groups`);

    // Check if there are more pending messages and schedule re-invocation
    await scheduleNextProcessing(supabase, supabaseUrl, supabaseServiceKey);

    return new Response(JSON.stringify({ 
      processed: processedCount, 
      groups: groupCount 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[MessageGrouper] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Combine content from multiple messages and transcribe audio / describe media
async function combineAndTranscribeMessages(
  supabase: any,
  queueMessages: any[],
  dbMessages: any[],
  settings: any,
  lovableApiKey: string
): Promise<string> {
  const {
    fetchWhatsAppMediaInfo,
    downloadWhatsAppBinary,
    uploadMediaToStorage,
    describeImageWithGpt,
    describeDocumentWithGpt,
  } = await import("../_shared/media.ts");

  const contentParts: string[] = [];
  const accessToken: string | undefined = settings?.whatsapp_access_token;

  for (let i = 0; i < queueMessages.length; i++) {
    const queueMsg = queueMessages[i];
    const dbMsg = dbMessages.find(m => m.id === queueMsg.message_id);
    const messageData = queueMsg.message_data;
    
    if (!dbMsg) continue;

    let content = dbMsg.content || '';

    // Handle audio: persist no storage + transcrição
    if (messageData.type === 'audio') {
      const audioMediaId = messageData.audio?.id;
      if (audioMediaId && accessToken) {
        console.log('[MessageGrouper] Processing audio:', audioMediaId);
        const info = await fetchWhatsAppMediaInfo(accessToken, audioMediaId);
        const audioBuffer = info ? await downloadWhatsAppBinary(accessToken, info.url) : null;

        if (audioBuffer && info) {
          const uploaded = await uploadMediaToStorage(supabase, audioBuffer, {
            conversationId: dbMsg.conversation_id,
            messageId: dbMsg.id,
            mimeType: info.mime_type,
            direction: 'in',
          });

          let transcription: string | null = null;
          if (lovableApiKey) {
            transcription = await transcribeAudio(audioBuffer, lovableApiKey);
          }
          if (transcription) content = transcription;

          await supabase
            .from('messages')
            .update({
              ...(transcription ? { content: transcription } : {}),
              media_url: uploaded?.signedUrl ?? null,
              media_type: info.mime_type,
              metadata: { ...(dbMsg.metadata || {}), media_path: uploaded?.path ?? null },
            })
            .eq('id', dbMsg.id);
        }
      }
    }

    // Handle image: persist + GPT vision description
    if (messageData.type === 'image') {
      const mediaId = messageData.image?.id;
      const caption: string = messageData.image?.caption || '';
      if (mediaId && accessToken) {
        console.log('[MessageGrouper] Processing image:', mediaId);
        const info = await fetchWhatsAppMediaInfo(accessToken, mediaId);
        if (info) {
          const buf = await downloadWhatsAppBinary(accessToken, info.url);
          if (buf) {
            const uploaded = await uploadMediaToStorage(supabase, buf, {
              conversationId: dbMsg.conversation_id,
              messageId: dbMsg.id,
              mimeType: info.mime_type,
              direction: 'in',
            });
            let description: string | null = null;
            if (lovableApiKey) {
              description = await describeImageWithGpt(buf, info.mime_type, lovableApiKey, caption);
            }

            const parts: string[] = [];
            parts.push(caption ? `[imagem com legenda: "${caption}"]` : '[imagem recebida]');
            if (description) parts.push(`Descrição da imagem: ${description}`);
            content = parts.join('\n');

            await supabase
              .from('messages')
              .update({
                content,
                media_url: uploaded?.signedUrl ?? null,
                media_type: info.mime_type,
                metadata: { ...(dbMsg.metadata || {}), media_path: uploaded?.path ?? null },
              })
              .eq('id', dbMsg.id);
          }
        }
      }
    }

    // Handle document: persist + GPT summary
    if (messageData.type === 'document') {
      const mediaId = messageData.document?.id;
      const filename: string = messageData.document?.filename || 'documento';
      if (mediaId && accessToken) {
        console.log('[MessageGrouper] Processing document:', mediaId, filename);
        const info = await fetchWhatsAppMediaInfo(accessToken, mediaId);
        if (info) {
          const buf = await downloadWhatsAppBinary(accessToken, info.url);
          if (buf) {
            const uploaded = await uploadMediaToStorage(supabase, buf, {
              conversationId: dbMsg.conversation_id,
              messageId: dbMsg.id,
              mimeType: info.mime_type,
              direction: 'in',
            });
            let summary: string | null = null;
            if (lovableApiKey && info.mime_type === 'application/pdf') {
              summary = await describeDocumentWithGpt(buf, info.mime_type, filename, lovableApiKey);
            }
            const parts: string[] = [`[documento recebido: ${filename}]`];
            if (summary) parts.push(`Resumo do documento: ${summary}`);
            content = parts.join('\n');

            await supabase
              .from('messages')
              .update({
                content,
                media_url: uploaded?.signedUrl ?? null,
                media_type: info.mime_type,
                metadata: {
                  ...(dbMsg.metadata || {}),
                  media_path: uploaded?.path ?? null,
                  media_filename: filename,
                },
              })
              .eq('id', dbMsg.id);
          }
        }
      }
    }

    // Handle video: persist only (no visual analysis for now)
    if (messageData.type === 'video') {
      const mediaId = messageData.video?.id;
      const caption: string = messageData.video?.caption || '';
      if (mediaId && accessToken) {
        console.log('[MessageGrouper] Processing video:', mediaId);
        const info = await fetchWhatsAppMediaInfo(accessToken, mediaId);
        if (info) {
          const buf = await downloadWhatsAppBinary(accessToken, info.url);
          if (buf) {
            const uploaded = await uploadMediaToStorage(supabase, buf, {
              conversationId: dbMsg.conversation_id,
              messageId: dbMsg.id,
              mimeType: info.mime_type,
              direction: 'in',
            });
            content = caption ? `[vídeo com legenda: "${caption}"]` : '[vídeo recebido]';
            await supabase
              .from('messages')
              .update({
                content,
                media_url: uploaded?.signedUrl ?? null,
                media_type: info.mime_type,
                metadata: { ...(dbMsg.metadata || {}), media_path: uploaded?.path ?? null },
              })
              .eq('id', dbMsg.id);
          }
        }
      }
    }

    if (content && content !== '[áudio - processando transcrição...]') {
      contentParts.push(content);
    }
  }

  return contentParts.join('\n');
}

// Download media from WhatsApp API
async function downloadWhatsAppMedia(settings: any, mediaId: string): Promise<ArrayBuffer | null> {
  if (!settings?.whatsapp_access_token) {
    console.error('[MessageGrouper] No WhatsApp access token configured');
    return null;
  }

  try {
    const mediaInfoResponse = await fetch(
      `https://graph.facebook.com/v18.0/${mediaId}`,
      {
        headers: {
          'Authorization': `Bearer ${settings.whatsapp_access_token}`
        }
      }
    );

    if (!mediaInfoResponse.ok) {
      console.error('[MessageGrouper] Failed to get media info:', await mediaInfoResponse.text());
      return null;
    }

    const mediaInfo = await mediaInfoResponse.json();
    const mediaUrl = mediaInfo.url;

    if (!mediaUrl) {
      console.error('[MessageGrouper] No media URL in response');
      return null;
    }

    const mediaResponse = await fetch(mediaUrl, {
      headers: {
        'Authorization': `Bearer ${settings.whatsapp_access_token}`
      }
    });

    if (!mediaResponse.ok) {
      console.error('[MessageGrouper] Failed to download media:', await mediaResponse.text());
      return null;
    }

    return await mediaResponse.arrayBuffer();
  } catch (error) {
    console.error('[MessageGrouper] Error downloading media:', error);
    return null;
  }
}

// Transcribe audio using Lovable AI Gateway (Whisper)
async function transcribeAudio(audioBuffer: ArrayBuffer, lovableApiKey: string): Promise<string | null> {
  try {
    console.log('[MessageGrouper] Transcribing audio, size:', audioBuffer.byteLength, 'bytes');

    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: 'audio/ogg' });
    formData.append('file', audioBlob, 'audio.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');

    const response = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[MessageGrouper] Transcription error:', response.status, errorText);
      return null;
    }

    const result = await response.json();
    const transcription = result.text;
    
    console.log('[MessageGrouper] Transcription result:', transcription);
    return transcription || null;
  } catch (error) {
    console.error('[MessageGrouper] Error transcribing audio:', error);
    return null;
  }
}

// Schedule next processing if there are pending messages with future process_after
async function scheduleNextProcessing(
  supabase: any,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<void> {
  try {
    // Check for pending messages with future process_after
    const { data: pendingMessages, error } = await supabase
      .from('message_grouping_queue')
      .select('id, process_after')
      .eq('processed', false)
      .gt('process_after', new Date().toISOString())
      .order('process_after', { ascending: true })
      .limit(1);

    if (error) {
      console.error('[MessageGrouper] Error checking pending messages:', error);
      return;
    }

    if (!pendingMessages || pendingMessages.length === 0) {
      console.log('[MessageGrouper] No pending messages to schedule');
      return;
    }

    const nextProcessAt = new Date(pendingMessages[0].process_after);
    const now = Date.now();
    const delayMs = Math.max(nextProcessAt.getTime() - now + 500, 1000); // +500ms buffer, min 1s
    
    // Cap delay at 30 seconds to prevent edge function timeout issues
    const cappedDelayMs = Math.min(delayMs, 30000);

    console.log(`[MessageGrouper] Scheduling self-invocation in ${cappedDelayMs}ms for pending message ${pendingMessages[0].id}`);

    // Use EdgeRuntime.waitUntil for background task
    (globalThis as any).EdgeRuntime?.waitUntil?.(
      new Promise<void>((resolve) => {
        setTimeout(async () => {
          try {
            console.log('[MessageGrouper] Self-invoking after scheduled delay');
            await fetch(`${supabaseUrl}/functions/v1/message-grouper`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`
              },
              body: JSON.stringify({ triggered_by: 'self-reschedule' })
            });
            console.log('[MessageGrouper] Self-invocation completed');
          } catch (err) {
            console.error('[MessageGrouper] Self-reschedule error:', err);
          }
          resolve();
        }, cappedDelayMs);
      })
    );
  } catch (error) {
    console.error('[MessageGrouper] Error scheduling next processing:', error);
  }
}
