import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { formatWaiting, isHighlighted, LEVEL_LABEL, reasonTexts, sortByPriority, type PriorityInfo } from "../lib/priorityDisplay";

const now = new Date("2026-10-05T12:00:00Z").getTime();
const D = 24 * 3600_000;
const p = (level: PriorityInfo["priority_level"], reasons: string[], waitedMs = D, attempts: number | null = 1): PriorityInfo => ({
  priority_level: level, priority_reasons: reasons, waiting: true,
  waiting_since: new Date(now - waitedMs).toISOString(), waiting_minutes: null, contact_attempt_number: attempts,
});

describe("ordenação", () => {
  const list = [
    { id: "n1", priority: p("NORMAL", []) },
    { id: "h1", priority: p("HIGH", ["angry_customer"]) },
    { id: "c1", priority: p("CRITICAL", ["legal_escalation"]) },
    { id: "n2" },
    { id: "h2", priority: p("HIGH", ["waiting_over_7_days"], 9 * D) },
  ];
  const ids = sortByPriority(list).map((x) => x.id);
  it("CRITICAL antes de HIGH", () => expect(ids.indexOf("c1")).toBeLessThan(ids.indexOf("h1")));
  it("HIGH antes de NORMAL e estável", () => expect(ids).toEqual(["c1", "h1", "h2", "n1", "n2"]));
});

describe("textos", () => {
  it("rótulos", () => { expect(LEVEL_LABEL.CRITICAL).toBe("CRÍTICO"); expect(LEVEL_LABEL.HIGH).toBe("ALTO"); });
  it("judicial", () => expect(reasonTexts(p("CRITICAL", ["legal_escalation"]), now)).toEqual(["Possível medida judicial"]));
  it("irritado", () => expect(reasonTexts(p("HIGH", ["angry_customer"]), now)).toEqual(["Cliente irritado"]));
  it("2º/3º contato", () => {
    expect(reasonTexts(p("HIGH", ["repeated_contact"], D, 2), now)).toEqual(["2º contato"]);
    expect(reasonTexts(p("HIGH", ["repeated_contact"], D, 3), now)).toEqual(["3º contato"]);
    expect(reasonTexts(p("HIGH", ["repeated_contact"], D, null), now)).toEqual(["Contato repetido"]);
  });
  it("dias aguardando", () => expect(reasonTexts(p("HIGH", ["waiting_over_7_days"], 9 * D + 3600_000), now)).toEqual(["9 dias aguardando"]));
  it("horas aguardando", () => expect(formatWaiting(p("NORMAL", [], 5 * 3600_000), now)).toBe("5 h aguardando"));
  it("múltiplos motivos juntos", () =>
    expect(reasonTexts(p("CRITICAL", ["legal_escalation", "repeated_contact", "waiting_over_7_days"], 9 * D, 2), now).join(" · "))
      .toBe("Possível medida judicial · 2º contato · 9 dias aguardando"));
  it("NORMAL sem destaque", () => { expect(isHighlighted(p("NORMAL", []))).toBe(false); expect(isHighlighted(p("HIGH", ["angry_customer"]))).toBe(true); });
});

describe("tela da Letícia", () => {
  const src = readFileSync("src/components/ExpedicaoChat.tsx", "utf8");
  it("prioridade fica fora do bloco da janela (aparece com janela fechada)", () => {
    expect(src).toContain("<PriorityBadge priority={selected.priority}");
    expect(src).toContain("<PriorityBadge priority={c.priority}");
  });
  // Parte B (retomada) liberou o botão só via flag da Expedição; nome do modelo nunca fica fixo na tela.
  it("botão de retomada só por flag e sem nome de modelo fixo na tela", () => {
    expect(src).toContain("config.resumeTemplate &&");
    expect(src).not.toMatch(/retomada_atendimento_lakma/);
  });
});
