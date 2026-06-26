
ALTER TABLE public.brain_products
  ADD COLUMN IF NOT EXISTS valor_sem_desconto NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS protocolo_pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS indicacao_curta TEXT,
  ADD COLUMN IF NOT EXISTS quando_indicar_direto TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS tipo_uso TEXT,
  ADD COLUMN IF NOT EXISTS categoria_intencao TEXT[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.brain_products
  DROP CONSTRAINT IF EXISTS brain_products_tipo_uso_check;
ALTER TABLE public.brain_products
  ADD CONSTRAINT brain_products_tipo_uso_check
    CHECK (tipo_uso IS NULL OR tipo_uso IN ('profissional','home_care','ambos'));

INSERT INTO public.brain_knowledge (
  owner_user_id, knowledge_type, title, slug, content_md, position, priority, tags
)
SELECT
  p.owner_user_id,
  'guia',
  'Fluxo comercial aprovado por Paula — peeling, clareamento, manchas, acne, hidratação, rejuvenescimento, limpeza de pele',
  'fluxo-comercial-paula-uso-profissional-vs-home-care',
  $$# Fluxo comercial aprovado pela Paula (LEITURA OBRIGATÓRIA)

Quando o lead manifestar intenção em **peeling**, **clareamento**, **manchas / carreamento de manchas**, **acne**, **rejuvenescimento**, **hidratação** ou **limpeza de pele** (ou pedidos equivalentes), a Nina deve seguir EXATAMENTE este fluxo curto, comercial e direto.

## Passo 1 — UMA pergunta de qualificação
Antes de indicar qualquer produto, pergunte APENAS:

> "Você procura para uso profissional ou para home care?"

Não faça outras perguntas. Exceção: casos sensíveis (gestante, lactante, alergia, reação, pele sensibilizada/lesionada, procedimento recente, uso de medicamentos, contraindicação) → encaminhar para dermoconsultora, sem indicar produto.

## Passo 2A — Resposta: USO PROFISSIONAL
- Para **peeling / clareamento / carreamento de manchas / ácidos profissionais**, priorize o **Kit Ácidos Sem Mistérios** (se cadastrado e ativo).
- Caso contrário, escolha o kit/produto profissional aderente (`tipo_uso = 'profissional'` ou `'ambos'`, `categoria_intencao` cruzando com a necessidade).
- Formato exato:

```
Para uso profissional, eu indicaria o {{nome_do_kit_ou_produto}}.

Valor sem desconto: R$ {{valor_sem_desconto}}
Valor com cupom LAKMA35: R$ {{valor_com_cupom}}

Link oficial: {{link_individual_produto}}

Também te envio o protocolo aprovado em PDF.
```

- Enviar foto via `[[IMG:<foto_produto_url>]]` no topo (se cadastrada).
- Enviar PDF via `[[PDF:<protocolo_pdf_url>]]` no topo (se cadastrado). Se não houver PDF, REMOVER a linha "Também te envio o protocolo aprovado em PDF." e não inventar PDF.

## Passo 2B — Resposta: HOME CARE
- Para **clareamento de manchas em home care**, priorize **Vitamina C** e **Máscara Clareadora 10g** (se cadastradas e ativas).
- Para outras intenções, escolha 2 a 3 produtos com `tipo_uso = 'home_care'` ou `'ambos'` e `categoria_intencao` aderente.
- Formato exato:

```
Para home care de {{necessidade}}, temos essas opções:

{{Produto 1}}
Valor sem desconto: R$ {{valor_sem_desconto}}
Valor com cupom LAKMA35: R$ {{valor_com_cupom}}
Link: {{link_individual_produto}}

{{Produto 2}}
Valor sem desconto: R$ {{valor_sem_desconto}}
Valor com cupom LAKMA35: R$ {{valor_com_cupom}}
Link: {{link_individual_produto}}

Quer que eu te explique como usar e quais cuidados precisa ter?
```

- Enviar a foto de cada produto via `[[IMG:<foto_produto_url>]]` no TOPO, uma linha por foto. Só envie se houver `foto_produto_url`.

## Regra de preço (CRÍTICA)
- Só informe valor quando `valor_sem_desconto` estiver preenchido e numérico.
- Cupom **LAKMA35** = 35% off → `valor_com_cupom = valor_sem_desconto * 0,65`.
- Formato brasileiro com 2 casas (ex.: R$ 129,90 → R$ 84,44).
- Se `valor_sem_desconto` estiver vazio, NÃO inventar preço. Substituir as duas linhas de preço por:

  > "Você consegue consultar o valor atualizado diretamente no link oficial."

- Nunca informar valor com desconto manual — sempre derivar de `valor_sem_desconto`.

## Regra de mídia (CRÍTICA)
- **Foto**: apenas se `foto_produto_url` cadastrada. Linha exata no topo: `[[IMG:<url>]]`.
- **PDF**: apenas se `protocolo_pdf_url` cadastrado. Linha exata no topo: `[[PDF:<url>]]`.
- **Link**: somente `link_individual_produto` literal. Proibido gerar link a partir de nome/slug/URL base.

## Continuidade
Após indicação home care, a pergunta de fechamento é sempre:
> "Quer que eu te explique como usar e quais cuidados precisa ter?"

Só explique modo de uso/cuidados **depois** que o lead pedir.

## Casos sensíveis → dermoconsultora
Gestante, lactante, alergia, reação, pele sensibilizada/lesionada, procedimento recente, uso de medicamentos, contraindicação, dúvida técnica sensível, adaptação ou troca de produto em protocolo. NÃO indicar produto — handoff para dermoconsultora.
$$,
  -20,
  'high',
  ARRAY['fluxo-comercial','paula','peeling','clareamento','home-care','profissional','cupom-lakma35','preco','pdf-protocolo']
FROM (
  SELECT DISTINCT owner_user_id FROM public.brain_products
  UNION
  SELECT user_id AS owner_user_id FROM public.user_roles WHERE role = 'admin'
) p
ON CONFLICT (owner_user_id, slug) DO UPDATE SET
  content_md = EXCLUDED.content_md,
  title = EXCLUDED.title,
  knowledge_type = EXCLUDED.knowledge_type,
  position = EXCLUDED.position,
  priority = EXCLUDED.priority,
  tags = EXCLUDED.tags,
  updated_at = now();
