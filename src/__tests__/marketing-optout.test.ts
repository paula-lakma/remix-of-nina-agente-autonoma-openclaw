import { describe, it, expect } from "vitest";
import {
  buildTemplateComponents, extractButton, isMarketingOptOut, buildOptOutConsent,
  OPTOUT_PAYLOAD, OPTOUT_TEMPLATE,
} from "../../supabase/functions/_shared/marketingOptout";
import { readFileSync } from "fs";

const V2 = { from_type: "human", metadata: { template_name: OPTOUT_TEMPLATE } };
const click = (o: Record<string, unknown> = {}) => ({
  id: "wamid.IN1", type: "button", timestamp: "1760460000",
  context: { id: "wamid.OUT1" },
  button: { text: "Não quero receber", payload: OPTOUT_PAYLOAD }, ...o,
});
const webhook = readFileSync("supabase/functions/whatsapp-webhook/index.ts", "utf8");

describe("sender", () => {
  it("1: v2 sai com quick_reply índice 0 e payload canônico", () => {
    expect(buildTemplateComponents(OPTOUT_TEMPLATE, {})).toEqual([
      { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: "lakma_mkt_optout_v1" }] },
    ]);
  });
  it("2: template sem botão fica idêntico", () => {
    expect(buildTemplateComponents("aviso_rastreio", { body: ["A", 2] })).toEqual([
      { type: "body", parameters: [{ type: "text", text: "A" }, { type: "text", text: "2" }] },
    ]);
    expect(buildTemplateComponents("lancamentos_plla_ghkcu_lakma", {})).toEqual([]);
  });
  it("3: retomada da Letícia sem botão", () => {
    expect(buildTemplateComponents("retomada_atendimento_lakma", { body: ["Ana"] }))
      .toEqual([{ type: "body", parameters: [{ type: "text", text: "Ana" }] }]);
  });
  it("13: rastreio com header+body sem regressão", () => {
    const c = buildTemplateComponents("pedido_enviado", { header: ["H"], body: ["X"] });
    expect(c.map((x) => x.type)).toEqual(["header", "body"]);
  });
});

describe("regra de opt-out", () => {
  it("4: botão + payload + contexto v2 => opt-out", () => expect(isMarketingOptOut(click(), V2)).toBe(true));
  it("5: texto digitado não gera", () => {
    expect(isMarketingOptOut({ id: "x", type: "text", text: { body: "Não quero receber" }, context: { id: "wamid.OUT1" } }, V2)).toBe(false);
  });
  it("6: payload diferente não gera (inclui cliques antigos sem payload)", () => {
    expect(isMarketingOptOut(click({ button: { text: "Não quero receber", payload: "Não quero receber" } }), V2)).toBe(false);
  });
  it("7: payload certo em outro template não gera", () => {
    expect(isMarketingOptOut(click(), { from_type: "human", metadata: { template_name: "lancamentos_plla_ghkcu_lakma" } })).toBe(false);
  });
  it("8: sem context.id ou outbound inexistente não gera", () => {
    expect(isMarketingOptOut(click({ context: undefined }), V2)).toBe(false);
    expect(isMarketingOptOut(click(), null)).toBe(false);
    expect(isMarketingOptOut(click(), { from_type: "user", metadata: { template_name: OPTOUT_TEMPLATE } })).toBe(false);
  });
  it("12: registro é sempre opted_out marketing com evidência", () => {
    const b = extractButton(click())!;
    const r = buildOptOutConsent({ contactId: "c", inboundWaId: "wamid.IN1", occurredAt: "2026-10-14T16:40:00.000Z", button: b, templateName: OPTOUT_TEMPLATE });
    expect(r).toMatchObject({ status: "opted_out", purpose: "marketing", channel: "whatsapp", source: "whatsapp_template_button", occurred_at: "2026-10-14T16:40:00.000Z" });
    expect(r.evidence).toEqual({ inbound_message_id: "wamid.IN1", button_text: "Não quero receber", button_payload: OPTOUT_PAYLOAD, context_id: "wamid.OUT1", template_name: OPTOUT_TEMPLATE });
  });
});

describe("webhook", () => {
  it("10: aceita type=button e salva metadata.button", () => {
    expect(webhook).toContain("case 'button':");
    expect(webhook).toMatch(/button: \{ text: button\.text, payload: button\.payload, context_id: button\.context_id \}/);
  });
  it("9: duplicado tolerado (23505) no consentimento", () => {
    expect(webhook).toMatch(/cErr\.code !== '23505'/);
  });
  it("11: clique de botão não entra na fila da Nina", () => {
    const i = webhook.indexOf("if (button) {\n            try { await handleButton()");
    const q = webhook.indexOf("from('message_grouping_queue')\n            .insert");
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(q);
  });
});
