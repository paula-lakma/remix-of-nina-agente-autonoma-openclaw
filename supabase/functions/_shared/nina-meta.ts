// Resolve Meta WhatsApp Cloud API credentials from nina_settings (single-tenant per project).
// Falls back to whatsapp_settings columns for a consistent shape.

// deno-lint-ignore no-explicit-any
export async function getNinaMetaCreds(supabase: any): Promise<{
  access_token: string;
  phone_number_id: string;
  waba_id: string;
}> {
  const { data, error } = await supabase
    .from("nina_settings")
    .select("whatsapp_access_token, whatsapp_phone_number_id, whatsapp_business_account_id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Falha ao ler nina_settings: ${error.message}`);
  if (!data) throw new Error("Nenhuma configuração ativa em nina_settings.");

  const access_token = data.whatsapp_access_token;
  const phone_number_id = data.whatsapp_phone_number_id;
  const waba_id = data.whatsapp_business_account_id;

  if (!access_token || !phone_number_id) {
    throw new Error("nina_settings sem whatsapp_access_token/phone_number_id.");
  }
  return { access_token, phone_number_id, waba_id: waba_id || "" };
}
