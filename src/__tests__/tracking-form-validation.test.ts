import { describe, it, expect } from 'vitest';
import {
  validateTrackingForm, buildTemplatePreview, type ManualTrackingForm,
} from '@/lib/trackingForm';

const valid: ManualTrackingForm = {
  customer_name: 'Maria Silva',
  phone_number: '(11) 99888-7777',
  order_number: '1885',
  tracking_number: 'AA123456789BR',
  carrier: 'correios',
};

describe('validateTrackingForm', () => {
  it('aceita formulário completo', () => {
    expect(validateTrackingForm(valid)).toEqual({});
  });

  it('nome vazio', () => {
    expect(validateTrackingForm({ ...valid, customer_name: '' }).customer_name)
      .toBe('Informe o nome do cliente.');
  });

  it('telefone vazio', () => {
    expect(validateTrackingForm({ ...valid, phone_number: '' }).phone_number)
      .toBe('Informe um telefone válido com DDD.');
  });

  it('telefone inválido', () => {
    expect(validateTrackingForm({ ...valid, phone_number: '123' }).phone_number)
      .toBe('Informe um telefone válido com DDD.');
  });

  it('pedido vazio', () => {
    expect(validateTrackingForm({ ...valid, order_number: '' }).order_number)
      .toBe('Informe o número do pedido.');
  });

  it('transportadora não selecionada', () => {
    expect(validateTrackingForm({ ...valid, carrier: '' }).carrier)
      .toBe('Selecione a transportadora.');
  });

  it('código vazio', () => {
    expect(validateTrackingForm({ ...valid, tracking_number: '' }).tracking_number)
      .toBe('Informe o código de rastreio.');
  });

  it('somente espaços em branco em todos os campos', () => {
    const errs = validateTrackingForm({
      customer_name: '   ',
      phone_number: '   ',
      order_number: '   ',
      tracking_number: '   ',
      carrier: '',
    });
    expect(Object.keys(errs).sort()).toEqual(
      ['carrier', 'customer_name', 'order_number', 'phone_number', 'tracking_number'],
    );
  });
});

describe('buildTemplatePreview', () => {
  it('não assume Correios antes da escolha', () => {
    expect(buildTemplatePreview({ ...valid, carrier: '' })).toBeNull();
  });

  it('retorna null enquanto incompleto', () => {
    expect(buildTemplatePreview({ ...valid, tracking_number: '  ' })).toBeNull();
  });

  it('substitui todas as variáveis (Correios)', () => {
    const p = buildTemplatePreview(valid)!;
    expect(p).toContain('Maria!');
    expect(p).toContain('#1885');
    expect(p).toContain('AA123456789BR');
    expect(p).toContain('pelos Correios');
    expect(p).toContain('https://rastreamento.correios.com.br/');
  });

  it('troca para Jadlog', () => {
    const p = buildTemplatePreview({ ...valid, carrier: 'jadlog' })!;
    expect(p).toContain('pela Jadlog');
    expect(p).toContain('https://www.jadlog.com.br/jadlog/rastreie');
  });
});
