import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  isRecipientOptedOut, phoneVariants, type ConsentStore,
} from "../../supabase/functions/broadcast-processor/optout";

type Ev = { contact_id: string; channel: string; purpose: string; status: string; occurred_at: string; created_at?: string };

// Fake que reproduz contact_consent_current (DISTINCT ON ... ORDER BY occurred_at DESC, created_at DESC).
function store(contacts: Record<string, string>, events: Ev[], fail?: "contacts" | "consents"): ConsentStore {
  return {
    async findContactIds(phones) {
      if (fail === "contacts") throw new Error("db down");
      return Object.entries(contacts).filter(([, p]) => phones.includes(p)).map(([id]) => id);
    },
    async currentMarketingStatuses(ids) {
      if (fail === "consents") throw new Error("db down");
      const latest = new Map<string, Ev>();
      for (const e of events) {
        const k = `${e.contact_id}|${e.channel}|${e.purpose}`;
        const cur = latest.get(k);
        const key = (x: Ev) => x.occurred_at + "|" + (x.created_at ?? "");
        if (!cur || key(e) > key(cur)) latest.set(k, e);
      }
      return [...latest.values()].filter((e) => ids.includes(e.contact_id) && e.channel === "whatsapp" && e.purpose === "marketing").map((e) => e.status);
    },
  };
}
const ev = (status: string, at: string, o: Partial<Ev> = {}): Ev =>
  ({ contact_id: "c1", channel: "whatsapp", purpose: "marketing", status, occurred_at: at, ...o });
const C = { c1: "5514997835777" };

describe("opt-out nas Campanhas", () => {
  it("1: opted_out atual bloqueia", async () => expect(await isRecipientOptedOut(store(C, [ev("opted_out", "2026-10-14")]), "5514997835777")).toBe(true));
  it("3: sem consentimento não bloqueia", async () => expect(await isRecipientOptedOut(store(C, []), "5514997835777")).toBe(false));
  it("3b: telefone sem contato não bloqueia", async () => expect(await isRecipientOptedOut(store(C, []), "5511900000000")).toBe(false));
  it("4: opted_in atual não bloqueia", async () => expect(await isRecipientOptedOut(store(C, [ev("opted_in", "2026-10-14")]), "5514997835777")).toBe(false));
  it("5: opted_in antigo + opted_out recente bloqueia", async () =>
    expect(await isRecipientOptedOut(store(C, [ev("opted_in", "2026-10-01"), ev("opted_out", "2026-10-14")]), "5514997835777")).toBe(true));
  it("6: opted_out antigo + opted_in recente não bloqueia", async () =>
    expect(await isRecipientOptedOut(store(C, [ev("opted_out", "2026-10-01"), ev("opted_in", "2026-10-14")]), "5514997835777")).toBe(false));
  it("7: opted_out de outro channel não bloqueia", async () =>
    expect(await isRecipientOptedOut(store(C, [ev("opted_out", "2026-10-14", { channel: "email" })]), "5514997835777")).toBe(false));
  it("8: opted_out de outro purpose não bloqueia", async () =>
    expect(await isRecipientOptedOut(store(C, [ev("opted_out", "2026-10-14", { purpose: "service" })]), "5514997835777")).toBe(false));
  it("9: telefone com máscara/sem 55 encontra contato", async () =>
    expect(await isRecipientOptedOut(store(C, [ev("opted_out", "2026-10-14")]), "(14) 99783-5777")).toBe(true));
  it("10: contato legado sem o 9 é reconhecido (e vice-versa)", async () => {
    expect(phoneVariants("14997835777")).toContain("551497835777");
    expect(await isRecipientOptedOut(store({ c1: "551497835777" }, [ev("opted_out", "2026-10-14")]), "5514997835777")).toBe(true);
    expect(await isRecipientOptedOut(store(C, [ev("opted_out", "2026-10-14")]), "551497835777")).toBe(true);
  });
  it("11: vários contatos no telefone, um opted_out => bloqueia", async () =>
    expect(await isRecipientOptedOut(store({ c1: "5514997835777", c2: "551497835777" },
      [ev("opted_in", "2026-10-14", { contact_id: "c1" }), ev("opted_out", "2026-10-14", { contact_id: "c2" })]), "5514997835777")).toBe(true));
  it("12: falha na consulta lança consent_check_failed (não envia)", async () => {
    await expect(isRecipientOptedOut(store(C, [], "contacts"), "5514997835777")).rejects.toThrow(/consent_check_failed/);
    await expect(isRecipientOptedOut(store(C, [], "consents"), "5514997835777")).rejects.toThrow(/consent_check_failed/);
  });
});

const src = readFileSync("supabase/functions/broadcast-processor/index.ts", "utf8");
describe("broadcast-processor", () => {
  const check = src.indexOf("isRecipientOptedOut(consentStore");
  const send = src.indexOf('invokeWithTimeout(\n          supabase, "send-meta-message"');
  const optBlock = src.slice(src.indexOf("if (optedOut) {"), src.indexOf("if (optedOut) {") + 300);
  it("2: checagem acontece antes do send-meta-message e opted_out faz continue", () => {
    expect(check).toBeGreaterThan(0);
    expect(send).toBeGreaterThan(check);
    expect(optBlock).toMatch(/status: "skipped", error_message: "opted_out"/);
    expect(optBlock).toMatch(/continue;/);
  });
  it("14: opt-out não incrementa failed", () => expect(optBlock).not.toMatch(/failed\+\+/));
  it("15: nada volta recipient para pending", () => {
    expect(src).not.toMatch(/broadcast_recipients"\)\.update\(\{[^}]*status: "pending"/);
  });
  it("13: falha pausa campanha e encerra sem autochamada", () => {
    const fail = src.slice(src.indexOf("} catch (e) {\n        const msg = e instanceof Error ? e.message : \"consent_check_failed\""), check + 900);
    expect(fail).toMatch(/status: "paused"/);
    expect(fail).toMatch(/break;/);
    const ret = src.slice(src.indexOf("if (consentFailed) {"), src.indexOf("if (consentFailed) {") + 300);
    expect(ret).toMatch(/return jsonResponse/);
    expect(src.indexOf("if (consentFailed) {")).toBeLessThan(src.indexOf("selfInvoke(supabase, campaign_id);\n      } else"));
  });
  it("16: fluxos operacionais não usam a regra de Campanhas", () => {
    for (const f of ["whatsapp-sender", "send-meta-message", "expedicao-chat"]) {
      expect(readFileSync(`supabase/functions/${f}/index.ts`, "utf8")).not.toMatch(/broadcast-processor\/optout|isRecipientOptedOut/);
    }
  });
});
