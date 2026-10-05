import { describe, it, expect } from "vitest";
import { resolveComposerWindow, isWindowClosedError } from "@/lib/whatsappWindow";

const BASE = Date.parse("2026-10-05T12:00:00.000Z");
const at = (min: number) => new Date(BASE + min * 60_000);
const msg = (from_type: string, min: number) => ({ from_type, sent_at: at(min).toISOString() });
const H = 60;
const C = "conv-1";

describe("composer window (tela)", () => {
  it("A) 23h54 → habilitado", () => {
    expect(resolveComposerWindow(C, [msg("user", 0)], at(23 * H + 54), null).canSendFreeform).toBe(true);
  });
  it("B) exatamente 23h55 → bloqueado", () => {
    expect(resolveComposerWindow(C, [msg("user", 0)], at(23 * H + 55), null).canSendFreeform).toBe(false);
  });
  it("C) 23h59 → bloqueado", () => {
    expect(resolveComposerWindow(C, [msg("user", 0)], at(23 * H + 59), null).canSendFreeform).toBe(false);
  });
  it("D) nova mensagem do cliente reabre", () => {
    expect(resolveComposerWindow(C, [msg("user", 0), msg("user", 30 * H)], at(31 * H), null).canSendFreeform).toBe(true);
  });
  it("E/F/G) Nina, humano e template não reabrem", () => {
    const list = [msg("user", 0), msg("nina", 30 * H), msg("human", 30 * H), { ...msg("human", 30 * H), template_name: "x" }];
    expect(resolveComposerWindow(C, list, at(30 * H + 1), null).canSendFreeform).toBe(false);
  });
  it("H) sem mensagem do cliente → fechado", () => {
    expect(resolveComposerWindow(C, [msg("nina", 0)], at(1), null).canSendFreeform).toBe(false);
  });
  it("I) recusa do servidor fecha mesmo se a tela achava aberto", () => {
    const list = [msg("user", 0)];
    const refusal = { conversationId: C, lastCustomerAt: at(0).toISOString() };
    expect(resolveComposerWindow(C, list, at(60), refusal).canSendFreeform).toBe(false);
    expect(resolveComposerWindow("outra", list, at(60), refusal).canSendFreeform).toBe(true);
    expect(isWindowClosedError(new Error("whatsapp_window_closed"))).toBe(true);
    expect(isWindowClosedError(new Error("forbidden"))).toBe(false);
  });
  it("J) virada automática: mesmo dado, relógio avança → bloqueia", () => {
    const list = [msg("user", 0)];
    expect(resolveComposerWindow(C, list, at(23 * H + 54), null).canSendFreeform).toBe(true);
    expect(resolveComposerWindow(C, list, at(23 * H + 55), null).canSendFreeform).toBe(false);
  });
  it("K) inbound novo libera mesmo após recusa do servidor", () => {
    const refusal = { conversationId: C, lastCustomerAt: at(0).toISOString() };
    expect(resolveComposerWindow(C, [msg("user", 0), msg("user", 26 * H)], at(26 * H + 1), refusal).canSendFreeform).toBe(true);
  });
});
