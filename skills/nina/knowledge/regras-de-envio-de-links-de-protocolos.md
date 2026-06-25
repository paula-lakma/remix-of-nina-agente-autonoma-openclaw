# Regras de envio de links — Protocolos Profissionais

- **Tipo:** Política
- **Categoria:** vendas
- **Prioridade:** alta
- **Tags:** protocolos, links, cupom LAKMA35, pipeline, site oficial, produtos do protocolo

## Quando usar este conhecimento

Gatilho 1 (explícito): lead pediu link do protocolo, perguntou onde comprar os produtos do protocolo, demonstrou interesse em adquirir os itens após Nina indicar um protocolo aprovado.

Gatilho 2 (CONTEXTO — obrigatório):
A Nina ACABOU de mencionar um protocolo profissional aprovado na conversa (qualquer mensagem anterior dela com nome de protocolo: "Protocolo Limpeza de Pele Sem Dor", "Protocolo ACNE OFF", "Protocolo Quarteto Fantástico de Peeling", "Protocolo Olheiras OFF", etc.) E o lead respondeu com QUALQUER UMA destas frases curtas:

- "pode me enviar o link?"
- "me manda o link"
- "me envia o link"
- "manda os links"
- "me manda os links"
- "qual o link?"
- "onde compro?"
- "onde comprar?"
- "quero comprar"
- "quero os produtos"
- "me envia os produtos"
- "me envia os produtos do protocolo"
- "link do protocolo"
- "tem link?"
- "me passa o link"
- "como faço pra comprar"

Mesmo que o lead NÃO repita o nome do protocolo, a Nina DEVE interpretar a frase como pedido dos links dos produtos do ÚLTIMO PROTOCOLO mencionado na conversa e aplicar este conhecimento.

## Quando encaminhar para atendimento humano

Nenhum produto do protocolo tem link individual cadastrado E o site geral não cobre o caso; ou protocolo solicitado não está aprovado na base; ou ambiguidade real entre produtos parecidos.

## Conteúdo

## Memória de contexto da conversa (REGRA OBRIGATÓRIA)

Antes de responder "link", "onde compro", "quero comprar" etc., a Nina DEVE olhar para trás na conversa e identificar o último protocolo profissional aprovado que ela mesma mencionou.

- Se a última recomendação da Nina foi um protocolo (ex.: "Esse é o Protocolo Limpeza de Pele Sem Dor..."), e o lead respondeu com qualquer frase curta de pedido de link/compra, o pedido REFERE-SE a esse protocolo — mesmo sem o lead repetir o nome.
- A Nina NÃO deve responder com o site geral (`https://www.lakma.com.br`) sozinho neste cenário.
- A Nina NÃO deve dizer "não tenho o link do protocolo" sem antes consultar o bloco "Produtos do protocolo — links individuais (resolvidos automaticamente)" no arquivo `knowledge/protocolo-*.md` correspondente.

## Ordem obrigatória quando o lead pedir o link de um PROTOCOLO

1. Identificar o protocolo do contexto (último protocolo mencionado pela Nina, ou o protocolo que o lead nomeou explicitamente).
2. Abrir o arquivo `knowledge/protocolo-<slug>.md` correspondente.
3. Verificar se existe `link_kit_unico` no bloco JSON do protocolo.
4. Se existir `link_kit_unico`, enviar esse link.
5. Se NÃO existir, ler `produtos_utilizados[]` do bloco JSON e enviar a lista organizada `Nome do produto: link_individual_produto` de cada item encontrado.
6. Se algum item estiver sem link, sinalizar APENAS aquele item (não bloquear o envio dos demais).
7. Informar o cupom **LAKMA35** = 35% de desconto no site.
8. Mover o lead para a etapa "Link do site enviado" no pipeline.

## Proibições

- NÃO responder apenas `https://www.lakma.com.br` quando o contexto da conversa é um protocolo aprovado e existe ao menos um `link_individual_produto` resolvido.
- NÃO responder "não tenho o link do protocolo" antes de checar `produtos_utilizados`.
- NÃO inventar links. Usar apenas links que aparecem no arquivo do protocolo (resolvidos via Brain Build) ou em `produtos.md`.
- NÃO confundir produtos parecidos. Se houver dúvida real, pedir confirmação ou encaminhar humano.

## Fallback (ordem)

1. `link_kit_unico` do protocolo (se existir).
2. Lista de `link_individual_produto` dos `produtos_utilizados`.
3. Para itens individuais sem link, citar `https://www.lakma.com.br` como fallback APENAS daquele item.
4. Encaminhar para humano somente se nenhum item tiver link individual E o site geral também não for aprovado para o caso.

## Modelos de resposta

### Cenário canônico (todos os produtos com link)
Lead: "Pode me enviar o link?"
Contexto anterior: Nina falou do Protocolo Limpeza de Pele Sem Dor.

Resposta:
"Claro. Vou te enviar os links dos produtos usados no Protocolo Limpeza de Pele Sem Dor:

- Produto A: <link individual>
- Produto B: <link individual>
- Produto C: <link individual>

No site, você pode usar o cupom **LAKMA35** para ter 35% de desconto."

### Alguns produtos sem link
"Claro. Vou te enviar os links que encontrei dos produtos usados nesse protocolo:

- Produto A: <link>
- Produto B: <link>

Não encontrei o link individual de **Produto C** no cadastro. Para esse item, você pode consultar no site oficial da Lakma ou falar com a equipe de atendimento.

No site, você pode usar o cupom **LAKMA35** para ter 35% de desconto."

### Protocolo com kit/link único
"Claro. Esse é o link do kit/protocolo: <link do kit>

No site, você pode usar o cupom **LAKMA35** para ter 35% de desconto."

## Cenários de teste obrigatórios

### Cenário 1 — Limpeza de Pele Sem Dor
Lead: "Sou esteticista e quero o Protocolo Limpeza de Pele Sem Dor."
Nina: explica o protocolo.
Lead: "Pode me enviar o link?"
Esperado: Nina envia lista de `link_individual_produto` dos produtos do Protocolo Limpeza de Pele Sem Dor.

### Cenário 2 — ACNE OFF
Lead: "Quero fazer o protocolo ACNE OFF. Me manda os links dos produtos."
Esperado: Nina envia lista de `link_individual_produto` dos produtos do Protocolo ACNE OFF.

### Cenário 3 — Quarteto Fantástico de Peeling
Lead: "Me passa o link do Protocolo Quarteto Fantástico de Peeling."
Esperado: Se não houver `link_kit_unico`, Nina envia lista de `link_individual_produto` dos produtos do protocolo.

## Atualização de pipeline

- Move para "Link do site enviado" SOMENTE quando enviar ao menos um link (kit ou individual).
- NÃO mover se apenas indicou o protocolo, explicou passo a passo ou ainda está qualificando.

## Mapeamento Conhecimento → Produtos

- Os nomes em `produtos_utilizados[].nome_citado_no_protocolo` vêm do cadastro do protocolo (aba Conhecimento).
- A correspondência com `produtos.md` é feita automaticamente pelo Brain Build (tolera acentos, caixa, sufixos de tamanho/ml/g, palavras como "Lakma", "Kit", "Profissional").
- O resultado já está pronto no campo `link_individual_produto` de cada item — usar diretamente.
