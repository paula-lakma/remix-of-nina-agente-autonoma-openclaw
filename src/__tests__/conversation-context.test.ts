import { describe, expect, it } from "vitest";
import {
  buildAttendanceStateBlock,
  buildHistoryText,
  historyLabel,
} from "../../supabase/functions/_shared/conversation_context";

const messagesComHumano = [
  { from_type: "user", content: "Quero falar com uma dermoconsultora" },
  { from_type: "nina", content: "Vou te encaminhar para uma dermoconsultora." },
  { from_type: "human", content: "Olá, João! Sou a Barbara, dermoconsultora da Lakma." },
  { from_type: "user", content: "Oi, ainda preciso de ajuda." },
];

const messagesSemHumano = [
  { from_type: "user", content: "Oi" },
  { from_type: "nina", content: "Oi, Joao! Pode perguntar." },
];

describe("rótulos neutros do histórico", () => {
  it("rotula cada autor corretamente", () => {
    expect(historyLabel("user")).toBe("Lead");
    expect(historyLabel("nina")).toBe("Nina");
    expect(historyLabel("ai")).toBe("Nina");
    expect(historyLabel("human")).toBe("Atendente humano");
  });

  it("monta o texto com os três rótulos e sem indicar estado", () => {
    const text = buildHistoryText(messagesComHumano);
    expect(text).toContain("Lead: Quero falar com uma dermoconsultora");
    expect(text).toContain("Nina: Vou te encaminhar para uma dermoconsultora.");
    expect(text).toContain("Atendente humano: Olá, João! Sou a Barbara");
    expect(text).not.toContain("Nina: Olá, João! Sou a Barbara");
    expect(text).not.toContain("encerrado");
  });
});

describe("bloco de estado do atendimento", () => {
  it("gera o bloco com Nina no controle, sem responsável e com humano anterior", () => {
    const block = buildAttendanceStateBlock(
      { status: "nina", assigned_user_id: null, human_takeover_required: false, handoff_type: null },
      messagesComHumano,
    );
    expect(block).toContain("atendimento humano anterior foi ENCERRADO");
  });

  it("não gera o bloco quando a conversa tem responsável humano ativo", () => {
    const block = buildAttendanceStateBlock(
      {
        status: "human",
        assigned_user_id: "11111111-1111-1111-1111-111111111111",
        human_takeover_required: true,
        handoff_type: "dermoconsultora",
      },
      messagesComHumano,
    );
    expect(block).toBe("");
  });

  it("não gera o bloco quando nunca houve atendimento humano", () => {
    const block = buildAttendanceStateBlock(
      { status: "nina", assigned_user_id: null, human_takeover_required: false, handoff_type: null },
      messagesSemHumano,
    );
    expect(block).toBe("");
  });

  it("gera o bloco quando há evidência de handoff humano anterior sem mensagem humana", () => {
    const block = buildAttendanceStateBlock(
      { status: "nina", assigned_user_id: null, human_takeover_required: false, handoff_type: null },
      messagesSemHumano,
      true,
    );
    expect(block).toContain("ENCERRADO");
  });
});
