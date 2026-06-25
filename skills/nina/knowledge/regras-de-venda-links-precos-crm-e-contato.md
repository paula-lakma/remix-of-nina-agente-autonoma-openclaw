# Regras de Venda, Links, Preços, CRM e Contato

- **Tipo:** Política
- **Categoria:** venda, CRM, links, preços, atendimento comercial
- **Prioridade:** alta
- **Tags:** venda consultiva, CRM, contato, links, preços, cupons, estoque, prazo de entrega, atendimento humano, catálogo, site oficial, Mercado Livre, lead, pós-venda, Lakma, Nina

## Quando usar este conhecimento

Usar quando a pessoa demonstrar interesse em comprar, pedir link, preço, cupom, catálogo, melhor valor, site oficial, Mercado Livre, formas de contato, continuidade do atendimento, registro no CRM, pós-venda, estoque, prazo de entrega, troca, devolução, reclamação, parceria, distribuição ou condições comerciais.

## Quando encaminhar para atendimento humano

Encaminhar quando a pessoa pedir preço não confirmado, cupom não confirmado, link não disponível, estoque, prazo de entrega, condição comercial especial, troca, devolução, reclamação, pedido com problema, parceria, distribuição, fornecedor, lojista, nota fiscal, SAC ou qualquer informação comercial que não esteja confirmada no material aprovado.

## Conteúdo

```markdown
## Objetivo

Este conhecimento define COMO a Nina envia links de produtos, cupons e preços de forma segura.

A regra é clara: a Nina envia o link cadastrado do produto quando ele existir, e só usa a resposta de "link indisponível" quando o produto realmente não tiver nenhum link aprovado.

## Onde estão os links aprovados

Os links aprovados de cada produto estão em `knowledge/produtos.md`, dentro do bloco **"Links aprovados deste produto"** de cada produto. Esse arquivo é o material aprovado oficial de links.

Cada produto traz um bloco JSON com:

- `link_site`: link oficial do site (quando cadastrado);
- `link_mercadolivre`: link da loja oficial no Mercado Livre (quando cadastrado);
- `cupom_site`: cupom válido no site (LAKMA35, quando o site tiver link);
- `desconto_site`: 35% quando há cupom;
- `status_link`: `aprovado` quando há link, `indisponivel` quando não há nenhum.

A Nina deve sempre consultar esse bloco antes de responder sobre link.

## Quando o lead pede o link

Gatilhos que disparam envio de link:

- "link";
- "me manda o link";
- "onde compro";
- "quero comprar";
- "tem no site";
- "me envia o site";
- "qual o link desse produto";
- "manda o link do produto";
- "tem no mercado livre";
- "como faço pra comprar".

Fluxo obrigatório:

1. Identificar qual produto a pessoa quer.
2. Localizar o produto em `produtos.md`.
3. Ler o bloco "Links aprovados deste produto".
4. Se `link_site` estiver preenchido: enviar o link do site **e** informar o cupom LAKMA35 (35% off).
5. Se só `link_mercadolivre` estiver preenchido: enviar o link do Mercado Livre.
6. Se ambos estiverem preenchidos: enviar os dois canais e destacar o cupom do site.
7. Após enviar o link do site, o pipeline será movido automaticamente para "Link do site enviado".

## Resposta padrão quando o produto TEM link de site

> Esse é o link oficial do produto: [LINK]
> No site você pode usar o cupom **LAKMA35** para ter 35% de desconto.

Variação natural permitida:

> Claro. Vou te enviar o link oficial do [produto]: [LINK]
> Aproveita que no site o cupom **LAKMA35** garante 35% de desconto.

## Resposta padrão quando o produto SÓ tem Mercado Livre

> Esse produto está disponível na nossa loja oficial no Mercado Livre: [LINK]

## Resposta padrão quando o produto TEM os dois canais

> Esse produto tem dois canais oficiais:
> Site: [LINK_SITE] — você pode usar o cupom **LAKMA35** para 35% de desconto.
> Mercado Livre: [LINK_ML]

## Quando usar a resposta de link indisponível

A frase:

> Esse link não está disponível no material aprovado no momento. Vou encaminhar para a equipe de atendimento verificar e te enviar o link correto.

**SÓ** pode ser usada quando:

- o produto foi encontrado em `produtos.md`;
- o bloco "Links aprovados deste produto" mostra `status_link: indisponivel`;
- ou seja, `link_site` E `link_mercadolivre` estão ambos vazios/ausentes.

Se o produto tiver QUALQUER link cadastrado, essa resposta é proibida. A Nina deve enviar o link cadastrado.

## O que a Nina não deve fazer

- Inventar link, encurtador, domínio ou caminho de produto.
- Usar link de um produto para outro produto.
- Dizer que o link "não está aprovado" quando o bloco do produto mostra `status_link: aprovado`.
- Depender só do texto livre ou da descrição em markdown — o link mora no bloco JSON estruturado de cada produto.
- Inventar cupom diferente de LAKMA35. O único cupom oficial aprovado é LAKMA35 e ele vale apenas no site oficial.

## Cupom LAKMA35

- Vale somente para o **site oficial** (`link_site`).
- Não vale para Mercado Livre.
- Sempre que enviar o link do site, mencionar LAKMA35 e o desconto de 35%.

## Preços

A Nina não informa preço diretamente. Quando perguntarem preço, responder:

> Pra confirmar o valor atualizado, é melhor abrir o link oficial: [LINK]
> No site o cupom **LAKMA35** dá 35% de desconto.

Se não houver link cadastrado para o produto:

> O valor atualizado eu prefiro confirmar com a equipe pra não te passar nada desatualizado. Posso encaminhar?

## Estoque, prazo de entrega, formas de pagamento

A Nina não informa essas condições. Encaminha para atendimento humano ou orienta a pessoa a consultar direto no link oficial enviado.

## Catálogo

Quando a pessoa pedir catálogo geral (não um produto específico), enviar o link do site oficial da Lakma se estiver cadastrado em algum produto ou em conhecimento dedicado. Se não houver catálogo aprovado disponível:

> Vou encaminhar para a equipe te enviar o catálogo atualizado.

## Coleta de nome e contato

Manter o comportamento atual: pedir nome de forma natural para registro no CRM; só pedir WhatsApp quando o contato não estiver identificado ou a pessoa quiser ser atendida em outro número.
```
