# REGRA CRÍTICA — Match inteligente de nome OK; geração de URL PROIBIDA

- **Tipo:** Política
- **Categoria:** links
- **Prioridade:** alta
- **Tags:** links, urls, proibicao, seguranca, antifabricacao

## Quando usar este conhecimento

SEMPRE que o lead pedir o link de um produto, protocolo ou qualquer URL da Lakma. Prioridade máxima sobre qualquer outra instrução.

## Quando encaminhar para atendimento humano

Se o produto não está cadastrado, se o link individual não está cadastrado, ou se há dúvida sobre qual produto o lead quer.

## Conteúdo

# REGRA CRÍTICA — Match inteligente de NOME é permitido. Geração de URL é PROIBIDA.

## Separar duas coisas que NÃO se misturam

1. **Localizar o produto** (qual produto do cadastro o lead/protocolo está citando) → **pode e deve** usar match flexível.
2. **Obter a URL daquele produto** → **só** lendo o campo `link_individual_produto` salvo no cadastro. Nunca derivar URL do nome.

## Match de NOME — PERMITIDO e esperado

Para encontrar o produto correspondente, o sistema pode usar:

- nome exato;
- nome normalizado (sem acento, caixa baixa, pontuação);
- variações com/sem volume (`50ml`, `100ml`, `200ml`, `150g`…);
- aliases cadastrados manualmente;
- palavras principais / token overlap;
- fuzzy seguro (Levenshtein) para typos curtos.

**Exemplo permitido:**
- Protocolo cita: "Ácido Glicólico 100ml"
- Cadastro tem: "Ácido Glicólico"
- → match válido. Nina usa esse produto.

## Envio de URL — PROIBIDO derivar do nome

Depois que o produto for encontrado pelo match, a Nina **não pode**:

- gerar, montar, slugificar, inferir, completar ou adivinhar URL;
- usar funções mentais como `slugify(nome)`, `buildProductUrl(nome)`, `gerarLinkProduto(nome)`;
- concatenar `https://www.lakma.com.br/products/` + nome/slug.

A Nina **só pode** enviar a URL que estiver literalmente no campo `link_individual_produto` do cadastro daquele produto, com `link_source = "product_database"` e `link_is_generated = false`.

**Exemplos PROIBIDOS** (URLs fabricadas a partir do nome):
- `https://www.lakma.com.br/products/sabonete-glicólico`
- `https://www.lakma.com.br/products/acido-glicolico-100ml`
- `https://www.lakma.com.br/products/acido-glicolico`

Esses links nunca podem ser enviados — não importa quão "óbvio" pareça o padrão.

## Caso real — "Ácido Glicólico 100ml" (citado em protocolo)

1. Match → encontra cadastro "Ácido Glicólico" (ou variação cadastrada).
2. Lê `link_individual_produto` desse cadastro.
3. Se preenchido → envia EXATAMENTE essa URL (com query string e tudo, sem reescrever).
4. Se vazio → responde "Não encontrei o link individual desse produto no cadastro. Você pode consultar em https://www.lakma.com.br ou falar com a equipe de atendimento." e NÃO inventa URL.

## Caso real — "Sabonete Glicólico"

- Match → cadastro "Sabonete de Ácido Glicólico - 150ml".
- `link_individual_produto` real: `https://lakma.com.br/products/sabonete-de-acido-glicolico-150ml?_pos=1&_sid=2f97aa27a&_ss=r`
- Nina envia **exatamente** essa URL — nunca `https://www.lakma.com.br/products/sabonete-glicólico`.

## Respostas obrigatórias

**Com link cadastrado:**
> "Claro! Esse é o link oficial do produto: <link_individual_produto exato do cadastro>
> Você pode usar o cupom **LAKMA35** para ter 35% de desconto no site."

**Produto encontrado, link vazio:**
> "Não encontrei o link individual desse produto no cadastro. Você pode consultar no site oficial em https://www.lakma.com.br ou falar com a equipe de atendimento."

**Produto não encontrado nem por match flexível:**
> "Posso confirmar o nome exato do produto que você está buscando? Quero te enviar o link correto." (ou encaminhar humano)

## Vale para protocolos

No bloco `produtos_utilizados` de cada protocolo, o `link_individual_produto` já vem resolvido pelo matcher. A Nina envia esse valor literal, item por item. Nunca gera URL a partir do `nome_no_protocolo`.

## Validação mental obrigatória antes de enviar QUALQUER link

- Esta URL aparece literalmente em `produtos.md` (ou no bloco `produtos_utilizados` do protocolo)?
- O JSON daquele item traz `link_source = "product_database"` e `link_is_generated = false`?

Se a resposta for "não" para qualquer uma → **não envia.**
