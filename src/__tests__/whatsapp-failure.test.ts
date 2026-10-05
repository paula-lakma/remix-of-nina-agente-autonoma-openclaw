import { describe, it, expect } from "vitest";
import { extractWhatsAppFailure, mergeFailureMetadata } from "../../supabase/functions/whatsapp-webhook/failure";

const T = "2026-10-05T15:00:00.000Z";
const full = {
  id: "wamid.X", status: "failed", recipient_id: "5511999999999",
  errors: [{ code: 131047, title: "Re-engagement message", message: "Re-engagement message",
    error_data: { details: "More than 24 hours have passed" }, href: "https://developers.facebook.com/x" }],
};

describe("whatsapp failure metadata", () => {
  it("A: saves code/title/message/details/href", () => {
    expect(extractWhatsAppFailure(full, T)).toEqual({
      code: 131047, title: "Re-engagement message", message: "Re-engagement message",
      details: "More than 24 hours have passed", href: "https://developers.facebook.com/x", received_at: T,
    });
  });
  it("B: only code → only code", () => {
    expect(extractWhatsAppFailure({ status: "failed", errors: [{ code: 131026 }] }, T))
      .toEqual({ code: 131026, received_at: T });
  });
  it("C: existing metadata preserved", () => {
    const f = extractWhatsAppFailure(full, T)!;
    const m = mergeFailureMetadata({ template_name: "x", source: "manual" }, f);
    expect(m.template_name).toBe("x");
    expect(m.source).toBe("manual");
    expect(m.whatsapp_failure).toEqual(f);
  });
  it("D: duplicate webhook keeps original received_at", () => {
    const first = mergeFailureMetadata({}, extractWhatsAppFailure(full, T)!);
    const again = mergeFailureMetadata(first, extractWhatsAppFailure(full, "2026-10-06T00:00:00Z")!);
    expect(again.whatsapp_failure).toBe(first.whatsapp_failure);
  });
  it("E/F: delivered/read do not create failure", () => {
    expect(extractWhatsAppFailure({ status: "delivered", errors: full.errors }, T)).toBeNull();
    expect(extractWhatsAppFailure({ status: "read" }, T)).toBeNull();
  });
  it("G: failed without errors → nothing invented", () => {
    expect(extractWhatsAppFailure({ status: "failed" }, T)).toBeNull();
    expect(extractWhatsAppFailure({ status: "failed", errors: [] }, T)).toBeNull();
    expect(extractWhatsAppFailure({ status: "failed", errors: [{}] }, T)).toBeNull();
  });
  it("no personal data copied", () => {
    const s = JSON.stringify(extractWhatsAppFailure(full, T));
    expect(s).not.toContain("5511999999999");
    expect(s).not.toContain("wamid");
  });
});
