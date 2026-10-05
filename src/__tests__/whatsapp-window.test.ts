import { describe, it, expect } from "vitest";
import { computeWhatsAppWindow, windowClosedPayload } from "../../supabase/functions/_shared/whatsappWindow";

const BASE = Date.parse("2026-10-05T12:00:00.000Z");
const at = (min: number) => new Date(BASE + min * 60_000);
const user = (min: number) => ({ from_type: "user", sent_at: at(min).toISOString() });
const H = 60;

describe("whatsapp 24h window", () => {
  it("23h54 → free text allowed", () => {
    const w = computeWhatsAppWindow([user(0)], at(23 * H + 54));
    expect(w.is_freeform_safe).toBe(true); expect(w.is_window_open).toBe(true);
  });
  it("exactly 23h55 → human free text blocked", () => {
    expect(computeWhatsAppWindow([user(0)], at(23 * H + 55)).is_freeform_safe).toBe(false);
  });
  it("23h59 → real window open but free text blocked by margin", () => {
    const w = computeWhatsAppWindow([user(0)], at(23 * H + 59));
    expect(w.is_window_open).toBe(true); expect(w.is_freeform_safe).toBe(false);
  });
  it("exactly 24h → closed", () => {
    expect(computeWhatsAppWindow([user(0)], at(24 * H)).is_window_open).toBe(false);
  });
  it("24h01 → closed", () => {
    const w = computeWhatsAppWindow([user(0)], at(24 * H + 1));
    expect(w.is_window_open).toBe(false); expect(w.is_freeform_safe).toBe(false);
  });
  it("new customer message reopens", () => {
    const w = computeWhatsAppWindow([user(0), user(30 * H)], at(31 * H));
    expect(w.is_freeform_safe).toBe(true);
    expect(w.window_open_until).toBe(at(54 * H).toISOString());
  });
  it("late-arriving message uses its real sent_at", () => {
    // processed late, but sent_at is old → window counted from sent_at
    const w = computeWhatsAppWindow([{ from_type: "user", sent_at: at(0).toISOString() }], at(25 * H));
    expect(w.is_window_open).toBe(false);
    expect(w.last_customer_message_at).toBe(at(0).toISOString());
  });
  it("Nina, human, outbound template and failed outbound do not open", () => {
    const msgs = [user(0),
      { from_type: "nina", sent_at: at(30 * H).toISOString() },
      { from_type: "human", sent_at: at(30 * H).toISOString() },
      { from_type: "human", sent_at: at(30 * H).toISOString(), template_name: "x" },
      { from_type: "human", sent_at: at(30 * H).toISOString(), status: "failed" }];
    expect(computeWhatsAppWindow(msgs, at(30 * H + 1)).is_window_open).toBe(false);
  });
  it("no inbound → closed", () => {
    const w = computeWhatsAppWindow([{ from_type: "nina", sent_at: at(0).toISOString() }], at(1));
    expect(w.is_window_open).toBe(false); expect(w.is_freeform_safe).toBe(false);
    expect(w.last_customer_message_at).toBeNull();
  });
  it("maps DB guard error to whatsapp_window_closed payload", () => {
    const p = windowClosedPayload({ message: "whatsapp_window_closed", details: JSON.stringify({ last_customer_message_at: "a", window_open_until: "b" }) });
    expect(p).toMatchObject({ error: "whatsapp_window_closed", last_customer_message_at: "a", window_open_until: "b" });
    expect(windowClosedPayload({ message: "forbidden" })).toBeNull();
  });
});
