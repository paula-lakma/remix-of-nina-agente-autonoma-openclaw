import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { handleChatSend, type ChatSendDeps } from "../../supabase/functions/chat-send/logic";

const CONV = "f7f4d8a9-9244-4fb9-a2b9-a941448906b3";
const REQ = "11111111-2222-4333-8444-555555555555";

function fake(opts: { staff?: boolean; user?: string | null; conv?: boolean; windowClosed?: boolean; queueError?: boolean } = {}) {
  const messages: any[] = [];
  const queue: any[] = [];
  let triggered = 0;
  const deps: ChatSendDeps = {
    userId: opts.user === undefined ? "u1" : opts.user,
    isStaff: async () => opts.staff ?? true,
    loadConversation: async (id) => (opts.conv === false ? null : { id, contact_id: "k1" }),
    findByRequestId: async (_c, r) => {
      const m = messages.find((x) => x.metadata.client_request_id === r);
      return m ? { id: m.id, status: m.status, queued: queue.some((q) => q.message_id === m.id) } : null;
    },
    insertMessage: async (row) => {
      if (opts.windowClosed) return { error: { message: "whatsapp_window_closed" } };
      const m = { ...row, id: `m${messages.length + 1}` };
      messages.push(m);
      return { id: m.id };
    },
    insertQueue: async (row) => {
      if (opts.queueError) return { error: { message: "rls" } };
      queue.push(row);
      return {};
    },
    markFailed: async (id) => { messages.find((m) => m.id === id).status = "failed"; },
    triggerSender: async () => { triggered++; },
  };
  return { deps, messages, queue, get triggered() { return triggered; } };
}

const input = { conversationId: CONV, content: "Bom dia!", requestId: REQ };

describe("chat-send", () => {
  it("1) autorizado + janela aberta => mensagem + fila + envio acionado", async () => {
    const f = fake();
    const r = await handleChatSend(f.deps, input);
    expect(r.status).toBe(200);
    expect(f.messages).toHaveLength(1);
    expect(f.queue).toHaveLength(1);
    expect(f.queue[0].message_id).toBe(f.messages[0].id);
    expect(f.triggered).toBe(1);
  });
  it("2) o navegador não grava na fila de envio", () => {
    const src = readFileSync("src/services/api.ts", "utf8");
    const body = src.slice(src.indexOf("sendMessage: async"), src.indexOf("sendMessage: async") + 1200);
    expect(body).toContain("chat-send");
    expect(body).not.toContain("send_queue");
  });
  it("3) janela fechada => bloqueado, nada na fila", async () => {
    const f = fake({ windowClosed: true });
    const r = await handleChatSend(f.deps, input);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("whatsapp_window_closed");
    expect(f.queue).toHaveLength(0);
  });
  it("4) sem permissão ou sem sessão => bloqueado", async () => {
    expect((await handleChatSend(fake({ staff: false }).deps, input)).status).toBe(403);
    expect((await handleChatSend(fake({ user: null }).deps, input)).status).toBe(401);
    expect((await handleChatSend(fake({ conv: false }).deps, input)).status).toBe(404);
  });
  it("5) erro na fila => mensagem vira failed (não fica em processing)", async () => {
    const f = fake({ queueError: true });
    const r = await handleChatSend(f.deps, input);
    expect(r.status).toBe(500);
    expect(f.messages[0].status).toBe("failed");
    expect(f.triggered).toBe(0);
  });
  it("6) retry com o mesmo pedido não duplica", async () => {
    const f = fake();
    await handleChatSend(f.deps, input);
    const r2 = await handleChatSend(f.deps, input);
    expect(r2.body.deduped).toBe(true);
    expect(f.messages).toHaveLength(1);
    expect(f.queue).toHaveLength(1);
  });
  it("7) erro do servidor traz mensagem útil", async () => {
    const r = await handleChatSend(fake({ queueError: true }).deps, input);
    expect(String(r.body.message)).toMatch(/fila de envio/);
  });
  it("8/9) rastreio, retomada da Letícia e dermoconsultora não usam este caminho", () => {
    const exp = readFileSync("supabase/functions/expedicao-chat/index.ts", "utf8");
    const dermo = readFileSync("supabase/functions/dermo-chat/index.ts", "utf8");
    expect(exp).not.toContain("chat-send");
    expect(dermo).toContain("dermo_reply");
  });
});
