// Proteção de opt-out de marketing WhatsApp nas Campanhas. Regras puras + store injetável.

export function normalizeBrazilianPhone(raw: string): string | null {
  let d = String(raw).replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return null;
  if (d.length === 10) return "55" + d.slice(0, 2) + "9" + d.slice(2);
  return "55" + d;
}

/** Formas do mesmo telefone que podem estar salvas em contacts (com e sem o 9). */
export function phoneVariants(raw: string): string[] {
  const out = new Set<string>();
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits) out.add(digits);
  const n = normalizeBrazilianPhone(raw);
  if (n) {
    out.add(n);
    if (n.length === 13 && n[4] === "9") out.add(n.slice(0, 4) + n.slice(5));
  }
  return [...out];
}

export interface ConsentStore {
  /** ids de contatos cujo phone_number está em `phones`. Lança em erro. */
  findContactIds(phones: string[]): Promise<string[]>;
  /** status atual (contact_consent_current) whatsapp/marketing desses contatos. Lança em erro. */
  currentMarketingStatuses(contactIds: string[]): Promise<string[]>;
}

export class ConsentCheckError extends Error {
  constructor(cause: unknown) {
    super("consent_check_failed: " + (cause instanceof Error ? cause.message : String(cause)));
  }
}

/** true = opted_out vigente em qualquer contato correspondente. Ausência de registro => false. */
export async function isRecipientOptedOut(store: ConsentStore, phone: string): Promise<boolean> {
  try {
    const ids = await store.findContactIds(phoneVariants(phone));
    if (!ids.length) return false;
    const statuses = await store.currentMarketingStatuses(ids);
    return statuses.includes("opted_out");
  } catch (e) {
    throw new ConsentCheckError(e);
  }
}

// deno-lint-ignore no-explicit-any
export function supabaseConsentStore(supabase: any): ConsentStore {
  return {
    async findContactIds(phones) {
      const { data, error } = await supabase.from("contacts").select("id").in("phone_number", phones);
      if (error) throw error;
      // deno-lint-ignore no-explicit-any
      return (data ?? []).map((r: any) => r.id);
    },
    async currentMarketingStatuses(ids) {
      const { data, error } = await supabase.from("contact_consent_current").select("status")
        .in("contact_id", ids).eq("channel", "whatsapp").eq("purpose", "marketing");
      if (error) throw error;
      // deno-lint-ignore no-explicit-any
      return (data ?? []).map((r: any) => r.status);
    },
  };
}
