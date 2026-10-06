import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  resumeSafeName, resumeBody, resumeErrorCode, resumeErrorText, RESUME_TEMPLATE_NAME,
} from "../../supabase/functions/_shared/resumeTemplate";

const mig = readdirSync("drizzle/migrations").find((f) => f.includes("expedicao_resume_template"))!;
const sql = readFileSync(`drizzle/migrations/${mig}`, "utf8");
const edge = readFileSync("supabase/functions/expedicao-chat/index.ts", "utf8");
const ui = readFileSync("src/components/ExpedicaoChat.tsx", "utf8");
const dermo = readFileSync("src/components/DermoChat.tsx", "utf8");
const parc = readFileSync("src/components/ParceriasChat.tsx", "utf8");

describe("nome para {{1}}", () => {
  it("call_name válido é usado", () => expect(resumeSafeName("Ana Paula", "Maria Souza")).toBe("Ana Paula"));
  it("call_name inválido → primeiro nome de name", () => expect(resumeSafeName("Ana2", "Maria Souza")).toBe("Maria"));
  it("acentos, hífen e apóstrofo aceitos", () => {
    expect(resumeSafeName("Jéssica", null)).toBe("Jéssica");
    expect(resumeSafeName("Ana-Luíza", null)).toBe("Ana-Luíza");
    expect(resumeSafeName("D'Ávila", null)).toBe("D'Ávila");
  });
  it("ambos inválidos → null (não envia)", () => expect(resumeSafeName("", "5511999998888")).toBeNull());
  it("números recusados", () => expect(resumeSafeName("Maria1", "Jo4o")).toBeNull());
  it("emoji recusado", () => expect(resumeSafeName("Maria 💕", "💕")).toBeNull());
  it("1 caractere ou >30 recusado", () => {
    expect(resumeSafeName("A", "B")).toBeNull();
    expect(resumeSafeName("A".repeat(31), null)).toBeNull();
  });
  it("corpo idêntico ao aprovado", () =>
    expect(resumeBody("Maria")).toBe("Olá, Maria! Aqui é a equipe da Lakma Dermocosméticos. Estamos retornando o seu atendimento. Quando puder, responda esta mensagem para continuarmos por aqui."));
});

describe("regras no banco", () => {
  it("modelo e idioma fixos no servidor", () => {
    expect(sql).toContain("'retomada_atendimento_lakma'");
    expect(sql).toContain("'pt_BR'");
    expect(sql).toContain("status = 'APPROVED'");
  });
  it("idempotência 10 min ignorando failed", () => {
    expect(sql).toContain("interval '10 minutes'");
    expect(sql).toContain("m.status <> 'failed'");
  });
  it("janela oficial fechada exigida e não alterada", () => {
    expect(sql).toContain("is_window_open");
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.whatsapp_freeform_window/);
  });
  it("fila como template e evento kind=resume_template", () => {
    expect(sql).toContain("'human', 'template', 2");
    expect(sql).toContain("'kind', 'resume_template'");
    expect(sql).toContain("'source', 'expedicao_resume'");
  });
  it("exige acesso de expedição e conversa não finalizada", () => {
    expect(sql).toContain("expedicao_can_access_conversation");
    expect(sql).toContain("attendance_finished");
  });
});

describe("erros e escopo", () => {
  it("mapeia exceção do banco", () => {
    expect(resumeErrorCode("resume_recent_duplicate")).toBe("resume_recent_duplicate");
    expect(resumeErrorCode("algo")).toBeNull();
    expect(resumeErrorText("resume_invalid_name")).toBe("Nome do cliente inválido para o modelo — peça a um gerente para corrigir o nome do contato.");
  });
  it("edge function não aceita nome nem modelo vindos da tela", () => {
    expect(edge).toContain('"expedicao_send_resume_template", { _conversation_id: conversationId }');
  });
  it("botão só na Expedição", () => {
    expect(ui).toContain("resumeTemplate: true");
    expect(dermo).not.toContain("resumeTemplate");
    expect(parc).not.toContain("resumeTemplate");
  });
  it("nome do modelo consistente", () => expect(RESUME_TEMPLATE_NAME).toBe("retomada_atendimento_lakma"));
});
