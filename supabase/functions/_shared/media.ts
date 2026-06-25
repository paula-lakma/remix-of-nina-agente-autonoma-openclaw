// Helpers compartilhados para baixar mídia do WhatsApp, persistir num bucket
// privado e, quando faz sentido, descrever/extrair texto via Lovable AI Gateway.

const LOVABLE_CHAT_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const VISION_MODEL = "openai/gpt-5-mini";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 dias

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "video/quicktime": "mov",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
};

export function extFromMime(mime: string | undefined | null): string {
  if (!mime) return "bin";
  const lower = mime.toLowerCase();
  return EXT_BY_MIME[lower] ?? lower.split("/").pop()?.split(";")[0] ?? "bin";
}

export interface WhatsAppMediaInfo {
  url: string;
  mime_type: string;
  sha256?: string;
  file_size?: number;
}

/**
 * Busca os metadados (URL temporária + MIME) de uma mídia do WhatsApp.
 */
export async function fetchWhatsAppMediaInfo(
  accessToken: string,
  mediaId: string,
): Promise<WhatsAppMediaInfo | null> {
  try {
    const resp = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) {
      console.error("[media] info error", resp.status, await resp.text());
      return null;
    }
    const info = await resp.json();
    if (!info?.url) return null;
    return {
      url: info.url,
      mime_type: info.mime_type ?? "application/octet-stream",
      sha256: info.sha256,
      file_size: info.file_size,
    };
  } catch (err) {
    console.error("[media] info exception", err);
    return null;
  }
}

/**
 * Baixa o binário a partir da URL temporária do Graph API.
 */
export async function downloadWhatsAppBinary(
  accessToken: string,
  url: string,
): Promise<ArrayBuffer | null> {
  try {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resp.ok) {
      console.error("[media] download error", resp.status);
      return null;
    }
    return await resp.arrayBuffer();
  } catch (err) {
    console.error("[media] download exception", err);
    return null;
  }
}

export interface UploadResult {
  path: string;
  signedUrl: string | null;
}

/**
 * Salva o binário em whatsapp-media/{conversationId}/{direction}/{id}.{ext}
 * e devolve uma signed URL de 7 dias.
 */
export async function uploadMediaToStorage(
  supabase: any,
  buffer: ArrayBuffer,
  params: {
    conversationId: string;
    messageId: string;
    mimeType: string;
    direction?: "in" | "out";
  },
): Promise<UploadResult | null> {
  const direction = params.direction ?? "in";
  const ext = extFromMime(params.mimeType);
  const path = `${params.conversationId}/${direction}/${params.messageId}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("whatsapp-media")
    .upload(path, buffer, {
      contentType: params.mimeType,
      cacheControl: "3600",
      upsert: true,
    });

  if (upErr) {
    console.error("[media] upload error", upErr);
    return null;
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from("whatsapp-media")
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (signErr) {
    console.error("[media] sign error", signErr);
    return { path, signedUrl: null };
  }

  return { path, signedUrl: signed?.signedUrl ?? null };
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Pede ao GPT-5-mini para descrever a imagem em PT (com leitura de texto
 * visível). Retorna null se a chamada falhar — o caller deve seguir com
 * fallback amigável.
 */
export async function describeImageWithGpt(
  buffer: ArrayBuffer,
  mimeType: string,
  lovableApiKey: string,
  userCaption?: string,
): Promise<string | null> {
  try {
    const dataUrl = `data:${mimeType};base64,${bufferToBase64(buffer)}`;
    const captionLine = userCaption?.trim()
      ? `O cliente enviou a foto com a legenda: "${userCaption.trim()}". `
      : "";

    const resp = await fetch(LOVABLE_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Você é assistente de uma clínica de estética. Descreva em PT-BR, em até 4 linhas, o que aparece na imagem que o cliente enviou — destaque tipo de pele, condições visíveis (acne, manchas, oleosidade, vermelhidão), área do corpo/rosto e qualquer texto legível (rótulos de produto, embalagens). Seja objetivo e técnico, sem inventar diagnósticos.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `${captionLine}Descreva a imagem.` },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      console.error("[media] vision error", resp.status, await resp.text());
      return null;
    }
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === "string" ? text.trim() : null;
  } catch (err) {
    console.error("[media] vision exception", err);
    return null;
  }
}

/**
 * Extrai texto/descrição de um documento (PDF, etc.) usando o mesmo gateway.
 */
export async function describeDocumentWithGpt(
  buffer: ArrayBuffer,
  mimeType: string,
  filename: string,
  lovableApiKey: string,
): Promise<string | null> {
  try {
    const dataUrl = `data:${mimeType};base64,${bufferToBase64(buffer)}`;
    const resp = await fetch(LOVABLE_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Você é assistente de atendimento. Resuma em PT-BR, em até 5 linhas, o conteúdo do documento enviado pelo cliente (tipo, propósito e dados relevantes). Cite números/valores quando aparecerem. Não invente informações.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Resuma este documento (${filename}).` },
              {
                type: "file",
                file: { filename, file_data: dataUrl },
              },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      console.error("[media] doc error", resp.status, await resp.text());
      return null;
    }
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === "string" ? text.trim() : null;
  } catch (err) {
    console.error("[media] doc exception", err);
    return null;
  }
}
