// Lógica pura (sem backend) do formulário de envio manual de rastreio.

export type Carrier = 'correios' | 'jadlog';
export type CarrierSelection = Carrier | '';

export const CARRIERS: Record<Carrier, { label: string; template: string; link: string }> = {
  correios: {
    label: 'Correios',
    template: 'pedido_enviado_correios',
    link: 'https://rastreamento.correios.com.br/',
  },
  jadlog: {
    label: 'Jadlog',
    template: 'pedido_enviado_jadlog',
    link: 'https://www.jadlog.com.br/jadlog/rastreie',
  },
};

export interface ManualTrackingInput {
  customer_name: string;
  phone_number: string;
  order_number: string;
  tracking_number: string;
  carrier: Carrier;
}

/** Estado do formulário: a transportadora começa vazia (escolha consciente). */
export interface ManualTrackingForm extends Omit<ManualTrackingInput, 'carrier'> {
  carrier: CarrierSelection;
}

/** Normaliza para o padrão brasileiro internacional (55 + DDD + número). */
export function normalizePhoneClient(raw: string): string | null {
  let d = raw.replace(/\D/g, '').replace(/^0+/, '');
  if (!d) return null;
  if (!d.startsWith('55')) d = '55' + d;
  return /^55\d{10,11}$/.test(d) ? d : null;
}

export function validateTrackingForm(form: ManualTrackingForm): Record<string, string> {
  const e: Record<string, string> = {};
  if (!form.customer_name.trim()) e.customer_name = 'Informe o nome do cliente.';
  if (!form.phone_number.trim() || !normalizePhoneClient(form.phone_number)) {
    e.phone_number = 'Informe um telefone válido com DDD.';
  }
  if (!form.order_number.trim()) e.order_number = 'Informe o número do pedido.';
  if (!form.carrier || !CARRIERS[form.carrier as Carrier]) {
    e.carrier = 'Selecione a transportadora.';
  }
  if (!form.tracking_number.trim()) e.tracking_number = 'Informe o código de rastreio.';
  return e;
}

/** Retorna null enquanto o formulário estiver incompleto. */
export function buildTemplatePreview(input: ManualTrackingForm): string | null {
  const name = input.customer_name.trim();
  const order = input.order_number.trim().replace(/^#/, '');
  const code = input.tracking_number.trim().toUpperCase();
  if (!name || !order || !code || !input.carrier || !CARRIERS[input.carrier as Carrier]) return null;
  const first = name.split(/\s+/)[0];
  const c = CARRIERS[input.carrier as Carrier];
  const via = input.carrier === 'correios' ? 'pelos Correios' : 'pela Jadlog';
  return `Boa notícia, ${first}! Seu pedido #${order} foi enviado ${via}.\n\nCódigo de rastreio: ${code}\n\nAcompanhe sua entrega em:\n${c.link}`;
}
