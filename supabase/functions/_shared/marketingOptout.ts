// Opt-out de marketing pelo botão QUICK_REPLY do template de lançamentos v2.
// Regras puras, sem rede: usadas pelo whatsapp-sender e whatsapp-webhook.

export const OPTOUT_TEMPLATE = "lancamentos_plla_ghkcu_lakma_v2";
export const OPTOUT_PAYLOAD = "lakma_mkt_optout_v1";

// deno-lint-ignore no-explicit-any
type Any = any;

/** Componentes do envio de template. Só a v2 ganha o botão; os demais ficam iguais a antes. */
export function buildTemplateComponents(tplName: string, vars: Any): Any[] {
  const v = vars || {};
  const components: Any[] = [];
  if (Array.isArray(v.header) && v.header.length) {
    components.push({ type: "header", parameters: v.header.map((x: string) => ({ type: "text", text: String(x) })) });
  }
  if (Array.isArray(v.body) && v.body.length) {
    components.push({ type: "body", parameters: v.body.map((x: string) => ({ type: "text", text: String(x) })) });
  }
  if (tplName === OPTOUT_TEMPLATE) {
    components.push({
      type: "button", sub_type: "quick_reply", index: "0",
      parameters: [{ type: "payload", payload: OPTOUT_PAYLOAD }],
    });
  }
  return components;
}

export interface ButtonInfo { text: string; payload: string | null; context_id: string | null }

/** Lê um inbound type=button da Meta. Retorna null para outros tipos. */
export function extractButton(message: Any): ButtonInfo | null {
  if (message?.type !== "button" || !message.button) return null;
  return {
    text: typeof message.button.text === "string" ? message.button.text : "",
    payload: typeof message.button.payload === "string" ? message.button.payload : null,
    context_id: typeof message.context?.id === "string" && message.context.id ? message.context.id : null,
  };
}

/** Regra exata: button + payload canônico + context.id de outbound nosso da v2. */
export function isMarketingOptOut(
  message: Any,
  outbound: { from_type?: string | null; metadata?: Any } | null,
): boolean {
  const b = extractButton(message);
  if (!b || b.payload !== OPTOUT_PAYLOAD || !b.context_id) return false;
  if (!outbound || outbound.from_type === "user") return false;
  return outbound.metadata?.template_name === OPTOUT_TEMPLATE;
}

export function buildOptOutConsent(args: {
  contactId: string; inboundWaId: string; occurredAt: string; button: ButtonInfo; templateName: string;
}) {
  return {
    contact_id: args.contactId,
    channel: "whatsapp",
    purpose: "marketing",
    status: "opted_out",
    source: "whatsapp_template_button",
    occurred_at: args.occurredAt,
    evidence: {
      inbound_message_id: args.inboundWaId,
      button_text: args.button.text,
      button_payload: args.button.payload,
      context_id: args.button.context_id,
      template_name: args.templateName,
    },
  };
}
