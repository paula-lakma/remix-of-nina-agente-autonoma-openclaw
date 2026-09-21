import { describe, it, expect } from 'vitest';
import { detectHandoffTarget } from '../../supabase/functions/_shared/handoff.ts';

// Motivos aceitos para a concessão de acesso da Carla (espelha
// public.is_parcerias_handoff_reason).
const PARCERIAS_GRANT_REASONS = new Set([
  'influencer', 'influenciadora', 'content_creator', 'criadora_conteudo',
  'collab', 'partnership', 'parceria', 'parceria_divulgacao', 'permuta',
  'relacionamento_influenciadoras',
]);

describe('parcerias (Carla) — roteamento e concessão de acesso', () => {
  it('influenciadora vai para parcerias com motivo que gera concessão', () => {
    const t = detectHandoffTarget('Sou influenciadora e queria fazer parceria');
    expect(t?.destination).toBe('parcerias');
    expect(PARCERIAS_GRANT_REASONS.has(String(t?.reason))).toBe(true);
  });

  it('criadora de conteúdo e collab também vão para a Carla', () => {
    for (const msg of ['Sou criadora de conteúdo, quero divulgar a marca', 'Topam uma collab?']) {
      const t = detectHandoffTarget(msg);
      expect(t?.destination).toBe('parcerias');
      expect(PARCERIAS_GRANT_REASONS.has(String(t?.reason))).toBe(true);
    }
  });

  it('cupom genérico NÃO vai para a Carla', () => {
    const t = detectHandoffTarget('Meu cupom de desconto não funciona');
    expect(t?.destination).not.toBe('parcerias');
  });

  it('cupom com contexto de influenciadora vai para a Carla', () => {
    const t = detectHandoffTarget('Sou influenciadora e meu cupom não está funcionando');
    expect(t?.destination).toBe('parcerias');
  });

  it('logística continua com a Leticia e distribuidor com a Paula', () => {
    expect(detectHandoffTarget('Meu pedido ainda não chegou')?.destination).toBe('financeiro');
    expect(detectHandoffTarget('Quero ser distribuidor da Lakma.')?.destination).toBe('comercial');
  });
});
