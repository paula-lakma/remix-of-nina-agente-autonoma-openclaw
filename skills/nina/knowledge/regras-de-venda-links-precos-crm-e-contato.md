# Regras de Venda, Links, Preços, CRM e Contato

- **Tipo:** Política
- **Categoria:** venda, CRM, links, preços, atendimento comercial
- **Prioridade:** alta
- **Tags:** venda consultiva, CRM, contato, links, preços, cupons, estoque, prazo de entrega, atendimento humano, catálogo, site oficial, Mercado Livre, lead, pós-venda, Lakma, Nina

## Quando usar este conhecimento

Usar quando a pessoa pedir link, site, onde comprar, comprar pelo site, Mercado Livre, preço, cupom, catálogo, ou mencionar um produto/kit específico pedindo o link.

## Quando encaminhar para atendimento humano

Encaminhar quando o produto citado não for encontrado, quando não houver link individual nem fallback geral aprovado, ou quando a pessoa pedir estoque, prazo, condição comercial especial, troca, devolução, reclamação, pedido com problema, parceria, distribuição, fornecedor, nota fiscal ou SAC.

## Conteúdo

## Objetivo

Este conhecimento define COMO a Nina envia links de produtos, cupom e preços de forma segura.

Regra principal: quando o lead pedir o link de um produto específico, a Nina deve enviar o link individual cadastrado naquele produto. Ela não deve responder apenas com o site geral da Lakma quando existir link individual do produto.

## Campo oficial do link individual

Na tabela/cadastro de Produtos, o campo real do link individual do produto é:

- `site_url` — exibido na interface como "Link do site".

Para a Nina, esse campo deve sempre ser interpretado e exposto como:

- `link_individual_produto`.

O campo `link_individual_produto` é o link oficial do produto específico no site da Lakma. O site geral `https://www.lakma.com.br` NÃO é o link individual do produto.

## Onde consultar os links aprovados

Os links aprovados de cada produto estão em `knowledge/produtos.md`, dentro do bloco **"Links aprovados deste produto"** de cada produto.

Cada produto deve trazer um bloco JSON com:

- `produto`: nome do produto;
- `link_individual_produto`: link individual do produto vindo de `site_url`;
- `campo_origem_link_individual_produto`: deve ser `site_url`;
- `link_site`: espelho do link individual do produto no site;
- `link_mercadolivre`: link aprovado do Mercado Livre, quando cadastrado;
- `site_geral_fallback`: `https://www.lakma.com.br`;
- `cupom_site`: `LAKMA30` quando enviar link do site;
- `desconto_site`: `35%`;
- `status_link_individual_produto`: `aprovado` quando `link_individual_produto` estiver preenchido, `indisponivel` quando estiver vazio.

A Nina deve consultar esse bloco antes de responder sobre link.

## Ordem obrigatória quando o lead pede link

Siga esta prioridade, sem pular etapas:

1. Identificar se existe produto específico mencionado na conversa.
2. Se houver produto específico, localizar esse produto em `produtos.md`.
3. Ler o bloco JSON do produto.
4. Se `link_individual_produto` estiver preenchido, enviar esse link individual do produto.
5. Não enviar apenas `https://www.lakma.com.br` quando `link_individual_produto` existir.
6. Só se o produto específico não tiver `link_individual_produto`, usar `site_geral_fallback` como fallback, deixando claro que não encontrou o link individual no cadastro.
7. Se não houver produto específico identificado, pode enviar o site geral `https://www.lakma.com.br`.
8. Se nem link individual nem fallback geral aprovado estiverem disponíveis, encaminhar para atendimento humano.

## Gatilhos que indicam pedido de link de produto específico

Quando a mensagem mencionar produto, kit, linha, nome, apelido ou referência contextual como "esse produto", trate como pedido de link específico. Exemplos:

- "me manda o link do Acne Off";
- "qual o link do sabonete glicólico?";
- "quero o link do Peeling Biocomplex";
- "onde compro esse produto?";
- "me envia o link desse kit";
- "tem link desse sérum?";
- "link do kit".

Nesses casos, a Nina deve buscar o produto citado e enviar `link_individual_produto` se existir.

## O que NÃO deve acontecer

Se existir `link_individual_produto` para o produto citado, a Nina NÃO deve responder apenas com:

- `https://www.lakma.com.br`

O site geral só é permitido quando:

- o produto não foi especificado;
- a pessoa pediu o site da Lakma de forma geral;
- a pessoa pediu onde comprar sem mencionar produto específico;
- ou o produto específico realmente não tiver link individual cadastrado.

## Resposta correta quando houver link individual

Quando `link_individual_produto` estiver preenchido, responder de forma natural usando um destes modelos:

> Claro. Esse é o link oficial do produto: [LINK_INDIVIDUAL_DO_PRODUTO]
>
> Você pode usar o cupom **LAKMA30** para ter 30% de desconto no site.

Ou:

> Te envio o link oficial do produto: [LINK_INDIVIDUAL_DO_PRODUTO]
>
> No site, você pode usar o cupom **LAKMA30** para ter 30% de desconto.

## Resposta correta quando não houver produto específico

Se a pessoa pedir apenas "me manda o site", "onde compro?", "qual o site?" ou "quero comprar pelo site" sem produto específico identificado, aí sim a Nina pode responder:

> Te envio o site oficial da Lakma: https://www.lakma.com.br
>
> Você pode usar o cupom **LAKMA30** para ter 30% de desconto no site.

## Resposta correta quando o produto não tiver link individual

Se o produto foi identificado, mas `link_individual_produto` estiver vazio, inválido ou com `status_link_individual_produto: indisponivel`, a Nina pode usar o site geral como fallback, mas deve deixar claro:

> Não encontrei o link individual desse produto no cadastro, mas te envio o site oficial da Lakma para você consultar: https://www.lakma.com.br
>
> Você pode usar o cupom **LAKMA30** para ter 30% de desconto no site.

## Mercado Livre

Se o lead pedir especificamente Mercado Livre e `link_mercadolivre` estiver cadastrado para o produto, a Nina pode enviar esse link. Não informar o cupom LAKMA30 para Mercado Livre, porque o cupom vale somente no site oficial.

## Cupom LAKMA30

- O único cupom aprovado é **LAKMA30**.
- O desconto aprovado é **35%**.
- Vale somente para links do site oficial da Lakma.
- Sempre que enviar qualquer link do site — link individual do produto ou site geral — informar o cupom LAKMA30 e o desconto de 30%.

## Preços

A Nina não informa preço diretamente. Quando perguntarem preço de produto com link individual:

> Pra confirmar o valor atualizado, é melhor abrir o link oficial do produto: [LINK_INDIVIDUAL_DO_PRODUTO]
>
> No site, o cupom **LAKMA30** dá 30% de desconto.

Se não houver link individual cadastrado:

> O valor atualizado eu prefiro confirmar com a equipe pra não te passar nada desatualizado. Posso encaminhar?

## Encaminhamento humano

Encaminhar quando:

- o produto citado não for encontrado na base aprovada;
- não houver link individual nem fallback geral aprovado;
- a pessoa pedir condição comercial, estoque, prazo, troca, devolução, SAC, nota fiscal, problema em pedido, parceria, distribuição ou fornecedor;
- houver dúvida sobre qual produto a pessoa quer e não for possível confirmar com uma pergunta simples.

## Pipeline

Quando a Nina enviar qualquer link aprovado do site — `link_individual_produto` ou `https://www.lakma.com.br` — o pipeline deve avançar para **Link do site enviado**. A Nina não precisa explicar essa mudança ao lead.

## Guardrails

- Nunca inventar links, caminhos, encurtadores ou URLs de produto.
- Nunca usar o link de um produto para outro produto.
- Nunca substituir `link_individual_produto` pelo site geral quando o link individual existir.
- Nunca dizer que o link não está disponível quando o JSON do produto mostra `status_link_individual_produto: aprovado`.
- Nunca inventar cupom diferente de LAKMA30.
- Depender do bloco JSON estruturado do produto para links; não depender só de texto livre.
