import { describe, it, expect } from "vitest";
import {
  decideStatusUpdate, applyStatusWithRetry, metaTimestampToIso,
  type CurrentState, type StatusRow, type StatusStore,
} from "../../supabase/functions/whatsapp-webhook/status";

const NOW = "2026-10-05T15:00:00.000Z";
const T = (s: number) => String(1790000000 + s);
const iso = (s: number) => metaTimestampToIso(T(s))!;
const st = (o: Partial<CurrentState> = {}): CurrentState =>
  ({ status: "sent", delivered_at: null, read_at: null, metadata: {}, ...o });
const ev = (status: string, s?: number, extra: object = {}) =>
  ({ id: "wamid.1", status, ...(s !== undefined ? { timestamp: T(s) } : {}), ...extra });
const apply = (c: CurrentState, e: object) => {
  const d = decideStatusUpdate(c, e, NOW);
  return { d, next: d.update ? { ...c, ...d.patch } as CurrentState : c };
};
const err = (o: object) => ({ errors: [o] });

describe("whatsapp status precedence", () => {
  it("1: sent -> delivered -> read with Meta timestamps", () => {
    let c = st();
    c = apply(c, ev("delivered", 1)).next;
    expect(c.status).toBe("delivered"); expect(c.delivered_at).toBe(iso(1));
    c = apply(c, ev("read", 2)).next;
    expect(c.status).toBe("read"); expect(c.read_at).toBe(iso(2)); expect(c.delivered_at).toBe(iso(1));
  });
  it("2: delivered -> sent ignored", () => {
    expect(decideStatusUpdate(st({ status: "delivered", delivered_at: iso(1) }), ev("sent", 5), NOW).update).toBe(false);
  });
  it("3: read -> delivered ignored", () => {
    expect(decideStatusUpdate(st({ status: "read", read_at: iso(1) }), ev("delivered", 5), NOW).update).toBe(false);
  });
  it("4: read -> sent ignored", () => {
    expect(decideStatusUpdate(st({ status: "read", read_at: iso(1) }), ev("sent", 5), NOW).update).toBe(false);
  });
  it("5: repeated status does not rewrite timestamp", () => {
    const c = st({ status: "delivered", delivered_at: iso(1) });
    expect(decideStatusUpdate(c, ev("delivered", 9), NOW).update).toBe(false);
  });
  it("6: same second — natural order decides", () => {
    let c = apply(st(), ev("delivered", 3)).next;
    c = apply(c, ev("read", 3)).next;
    expect(c.status).toBe("read");
    expect(decideStatusUpdate(c, ev("delivered", 3), NOW).update).toBe(false);
  });
  it("7: late read (older ts) after delivered still advances", () => {
    const c = apply(st(), ev("delivered", 10)).next;
    const n = apply(c, ev("read", 8)).next;
    expect(n.status).toBe("read"); expect(n.read_at).toBe(iso(8));
  });
  it("8: failed after read keeps read and stores failure", () => {
    const c = st({ status: "read", read_at: iso(1), delivered_at: iso(1) });
    const { next } = apply(c, ev("failed", 5, err({ code: 131047 })));
    expect(next.status).toBe("read"); expect(next.read_at).toBe(iso(1));
    expect((next.metadata as any).whatsapp_failure.code).toBe(131047);
    expect((next.metadata as any).whatsapp_status.failed_ignored.reason).toBe("already_delivered");
  });
  it("9: failed after delivered keeps delivered and stores failure", () => {
    const { next } = apply(st({ status: "delivered", delivered_at: iso(1) }), ev("failed", 5, err({ code: 1 })));
    expect(next.status).toBe("delivered");
    expect((next.metadata as any).whatsapp_failure.code).toBe(1);
  });
  it("10: delivered after failed with newer ts corrects", () => {
    const f = apply(st(), ev("failed", 5)).next;
    const n = apply(f, ev("delivered", 6)).next;
    expect(n.status).toBe("delivered"); expect(n.delivered_at).toBe(iso(6));
  });
  it("11: read after failed with newer ts corrects", () => {
    const f = apply(st(), ev("failed", 5)).next;
    expect(apply(f, ev("read", 7)).next.status).toBe("read");
  });
  it("12: delivered/read after failed with older or equal ts keeps failed", () => {
    const f = apply(st(), ev("failed", 5)).next;
    expect(apply(f, ev("delivered", 4)).next.status).toBe("failed");
    expect(apply(f, ev("read", 5)).next.status).toBe("failed");
  });
  it("13: old failed without failed_ts keeps failed and logs diagnostic", () => {
    const old = st({ status: "failed" });
    const { next } = apply(old, ev("read", 99));
    expect(next.status).toBe("failed"); expect(next.read_at).toBeNull();
    expect((next.metadata as any).whatsapp_status.ignored_after_failed.status).toBe("read");
    expect(decideStatusUpdate(next, ev("read", 99), NOW).update).toBe(false);
  });
  it("14: repeated failed with same error is idempotent", () => {
    const f = apply(st(), ev("failed", 5, err({ code: 131047, title: "x" }))).next;
    expect(decideStatusUpdate(f, ev("failed", 5, err({ code: 131047, title: "x" })), NOW).update).toBe(false);
  });
  it("15: repeated failed with extra error data enriches", () => {
    const f = apply(st(), ev("failed", 5)).next;
    expect((f.metadata as any).whatsapp_failure).toBeUndefined();
    const g = apply(f, ev("failed", 5, err({ code: 131047, error_data: { details: "24h" } }))).next;
    expect(g.status).toBe("failed");
    expect((g.metadata as any).whatsapp_failure).toMatchObject({ code: 131047, details: "24h" });
    expect((g.metadata as any).whatsapp_status.failed_ts).toBe(iso(5));
  });
  it("16: existing metadata preserved", () => {
    const { next } = apply(st({ metadata: { template_name: "t", source: "manual" } }), ev("delivered", 1));
    expect(next.metadata).toMatchObject({ template_name: "t", source: "manual" });
  });
  it("17: no timestamp — conservative, never invents Meta time", () => {
    const { next } = apply(st(), ev("delivered"));
    expect(next.status).toBe("delivered"); expect(next.delivered_at).toBe(NOW);
    expect((next.metadata as any).whatsapp_status.last_ts).toBeUndefined();
    expect(decideStatusUpdate(next, ev("sent"), NOW).update).toBe(false);
    expect(apply(st({ status: "read", read_at: iso(1) }), ev("failed")).next.status).toBe("read");
    expect(metaTimestampToIso("abc")).toBeNull();
  });
  it("18: historical sent + read_at is never downgraded", () => {
    const h = st({ status: "sent", read_at: iso(1), delivered_at: iso(1) });
    expect(decideStatusUpdate(h, ev("delivered", 9), NOW).update).toBe(false);
    expect(apply(h, ev("failed", 9)).next.status).toBe("sent");
  });
  it("19: historical delivered + read_at counts as read", () => {
    const h = st({ status: "delivered", read_at: iso(1), delivered_at: iso(2) });
    expect(decideStatusUpdate(h, ev("read", 9), NOW).update).toBe(false);
    expect(apply(h, ev("failed", 9)).next.status).toBe("delivered");
  });
  it("20: concurrent change → reread, recompute, retry once", async () => {
    let row: StatusRow = { id: "m1", ...st() };
    let calls = 0;
    const store: StatusStore = {
      read: async () => ({ ...row }),
      conditionalUpdate: async (exp, patch) => {
        calls++;
        if (calls === 1) { row = { ...row, status: "read", read_at: iso(3) }; return false; } // someone else won
        if (exp.status !== row.status) return false;
        row = { ...row, ...patch } as StatusRow; return true;
      },
    };
    const r = await applyStatusWithRetry(store, ev("delivered", 2), () => NOW);
    expect(r.outcome).toBe("noop"); // after reread it's already read → no downgrade
    expect(row.status).toBe("read");
    expect(calls).toBe(1);
  });
  it("20b: persistent conflict stops after one retry", async () => {
    let calls = 0;
    const store: StatusStore = { read: async () => ({ id: "m", ...st() }), conditionalUpdate: async () => { calls++; return false; } };
    const r = await applyStatusWithRetry(store, ev("delivered", 2), () => NOW);
    expect(r.outcome).toBe("conflict"); expect(calls).toBe(2);
  });
});
