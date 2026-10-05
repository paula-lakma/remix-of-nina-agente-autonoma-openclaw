import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { computeLeticiaExceptions } from "../lib/leticiaExceptions";

const L = "leticia-id";
const P = "paula-id";
const PROMISE = "Entendi! Vou te encaminhar para a Leticia, que vai verificar seu pedido.";
const T0 = "2026-10-01T12:00:00.000Z";
const now = new Date("2026-10-01T13:00:00.000Z");
const msg = (content: string, sent_at = T0, conversation_id = "c1") => ({ id: "m", conversation_id, from_type: "nina", content, sent_at });
const conv = (over = {}) => ({ id: "c1", status: "nina", assigned_user_id: null, handoff_reason: null, contact_name: "X", ...over });
const run = (o: Partial<Parameters<typeof computeLeticiaExceptions>[0]>) =>
  computeLeticiaExceptions({ messages: [msg(PROMISE)], grants: [], events: [], conversations: [conv()], leticiaId: L, now, ...o });

describe("Exceções Letícia", () => {
  it("promessa real sem acesso após 2 min aparece", () => expect(run({})).toHaveLength(1));
  it("dentro dos 2 min ainda não aparece", () => expect(run({ now: new Date("2026-10-01T12:01:30Z") })).toHaveLength(0));
  it("Letícia com acesso ativo não aparece", () =>
    expect(run({ grants: [{ conversation_id: "c1", team_member_id: L, is_active: true, created_at: "2026-10-01T12:00:30Z", revoked_at: null }] })).toHaveLength(0));
  it("acesso recebido e finalizado depois não aparece", () =>
    expect(run({ grants: [{ conversation_id: "c1", team_member_id: L, is_active: false, created_at: "2026-10-01T12:00:30Z", revoked_at: "2026-10-01T12:30:00Z" }] })).toHaveLength(0));
  it("acesso encerrado antes da promessa não conta", () =>
    expect(run({ grants: [{ conversation_id: "c1", team_member_id: L, is_active: false, created_at: "2026-09-01T00:00:00Z", revoked_at: "2026-09-02T00:00:00Z" }] })).toHaveLength(1));
  it("pergunta/oferta não aparece", () => {
    expect(run({ messages: [msg("Quer que eu te encaminhe para a Leticia?")] })).toHaveLength(0);
    expect(run({ messages: [msg("Se precisar, posso passar para a Leticia.")] })).toHaveLength(0);
  });
  it("oferta condicional estilo c788b549 não aparece", () =>
    expect(run({ messages: [msg("Seu pedido está a caminho. Qualquer dúvida, a Leticia pode te ajudar.")] })).toHaveLength(0));
  it("handoff posterior para Paula não aparece", () =>
    expect(run({ events: [{ conversation_id: "c1", handoff_reason: "refund_request", created_at: "2026-10-01T12:05:00Z" }] })).toHaveLength(0));
  it("handoff posterior para Carla não aparece", () =>
    expect(run({ events: [{ conversation_id: "c1", handoff_reason: "coupon_issue", created_at: "2026-10-01T12:05:00Z" }] })).toHaveLength(0));
  it("atribuída a outra pessoa não aparece", () => expect(run({ conversations: [conv({ assigned_user_id: P })] })).toHaveLength(0));
  it("corrigida depois sai da lista", () => {
    expect(run({})).toHaveLength(1);
    expect(run({ grants: [{ conversation_id: "c1", team_member_id: L, is_active: true, created_at: "2026-10-01T12:50:00Z", revoked_at: null }] })).toHaveLength(0);
  });
  it("não altera os dados de entrada", () => {
    const input = { messages: [msg(PROMISE)], grants: [], events: [], conversations: [conv()], leticiaId: L, now };
    const snap = JSON.stringify(input);
    computeLeticiaExceptions(input);
    expect(JSON.stringify(input)).toBe(snap);
  });
  it("lista só leitura e só admin/manager", () => {
    const hook = readFileSync("src/hooks/useLeticiaExceptions.ts", "utf8");
    expect(hook).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
    const ui = readFileSync("src/components/ChatInterface.tsx", "utf8");
    expect(ui).toContain("role === 'admin' || role === 'manager'");
  });
});
