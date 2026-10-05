import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  templateStatusLabel, isMetaDuplicateNameError, mergeTemplateLabels, categoryChange, canManageTemplates,
} from "../../supabase/functions/_shared/templateRules";

const submitSrc = readFileSync("supabase/functions/submit-template/index.ts", "utf8");
const syncSrc = readFileSync("supabase/functions/sync-template-status/index.ts", "utf8");

describe("permissão da aba Templates", () => {
  it("admin e manager podem", () => {
    expect(canManageTemplates(["admin"])).toBe(true);
    expect(canManageTemplates(["manager"])).toBe(true);
  });
  it("demais papéis e sem papel bloqueados", () => {
    for (const r of ["user", "sdr", "dermo", "expedicao", "rastreio", "parcerias"]) expect(canManageTemplates([r])).toBe(false);
    expect(canManageTemplates([])).toBe(false);
  });
  it("submit e sync exigem admin/manager antes de qualquer coisa", () => {
    for (const src of [submitSrc, syncSrc]) {
      expect(src).toContain("requireAdminOrManager(req)");
      expect(src.indexOf("requireAdminOrManager(req)")).toBeLessThan(src.indexOf("getNinaMetaCreds(supabase)"));
    }
  });
});

describe("duplicação", () => {
  it("renomeação automática _vXXXX removida", () => {
    expect(submitSrc).not.toMatch(/_v\$\{/);
    expect(submitSrc).toContain("template_already_exists_meta");
  });
  it("duplicado local checado no servidor antes da Meta", () => {
    expect(submitSrc.indexOf("template_already_exists_local")).toBeLessThan(submitSrc.indexOf("message_templates`"));
  });
  it("detecta erro de nome duplicado da Meta", () => {
    expect(isMetaDuplicateNameError({ code: 100, error_subcode: 2388093 })).toBe(true);
    expect(isMetaDuplicateNameError({ code: 100, error_subcode: 2388024 })).toBe(true);
    expect(isMetaDuplicateNameError({ message: "Template name already exists" })).toBe(true);
    expect(isMetaDuplicateNameError({ code: 100, message: "Invalid parameter" })).toBe(false);
  });
});

describe("rejected_reason e labels", () => {
  it("guarda motivo quando a Meta informa e preserva outras chaves", () => {
    const l = mergeTemplateLabels({ x: 1 }, { rejected_reason: "INVALID_FORMAT", status: "REJECTED" });
    expect(l).toEqual({ x: 1, rejected_reason: "INVALID_FORMAT" });
  });
  it("NONE ou vazio não é gravado", () => {
    expect(mergeTemplateLabels(null, { rejected_reason: "NONE", status: "REJECTED" })).toEqual({});
    expect(mergeTemplateLabels(undefined, { status: "PENDING" })).toEqual({});
  });
  it("categoria pedida gravada uma vez", () => {
    const l = mergeTemplateLabels({ requested_category: "UTILITY" }, { requested_category: "MARKETING" });
    expect(l.requested_category).toBe("UTILITY");
  });
  it("aviso quando a Meta muda a categoria", () => {
    expect(categoryChange({ requested_category: "UTILITY" }, "MARKETING")).toEqual({ requested: "UTILITY", current: "MARKETING" });
    expect(categoryChange({ requested_category: "UTILITY" }, "UTILITY")).toBeNull();
    expect(categoryChange(null, "MARKETING")).toBeNull();
  });
});

describe("status", () => {
  it("mapeia e mantém desconhecido", () => {
    expect(templateStatusLabel("APPROVED")).toBe("Aprovado");
    expect(templateStatusLabel("PENDING")).toBe("Em análise pela Meta");
    expect(templateStatusLabel("REJECTED")).toBe("Rejeitado");
    expect(templateStatusLabel("PAUSED")).toBe("Pausado");
    expect(templateStatusLabel("DISABLED")).toBe("Desativado");
    expect(templateStatusLabel("IN_APPEAL")).toBe("Em recurso na Meta");
    expect(templateStatusLabel("WEIRD_NEW")).toBe("WEIRD_NEW");
  });
});
