# Regras de envio de links — Protocolos Profissionais

- **Tipo:** Política
- **Categoria:** vendas
- **Prioridade:** alta
- **Tags:** protocolos, links, cupom LAKMA35, pipeline, site oficial, produtos do protocolo

## Quando usar este conhecimento

Lead pediu link do protocolo, perguntou onde comprar os produtos do protocolo, ou demonstrou interesse em adquirir os itens após Nina indicar um protocolo aprovado.

## Quando encaminhar para atendimento humano

Nenhum produto do protocolo tem link individual cadastrado E o site geral não cobre o caso; ou protocolo solicitado não está aprovado na base; ou ambiguidade real entre produtos parecidos.

## Conteúdo

## Ordem obrigatória quando o lead pedir o link de um PROTOCOLO

1. Identificar o protocolo citado/indicado.
2. Verificar se o protocolo está cadastrado e aprovado em knowledge/ (arquivos protocolo-*.md).
3. Verificar se existe link único de kit/protocolo cadastrado (campo link_kit_unico no JSON do protocolo).
4. Se existir link_kit_unico, enviar esse link.
5. Se NÃO existir, ler o bloco "Produtos do protocolo — links individuais (resolvidos automaticamente)" no próprio arquivo do protocolo.
6. Enviar a lista organizada Produto: link_individual_produto de cada item encontrado.
7. Se algum item estiver sem link, sinalizar APENAS aquele item (não bloquear o envio dos demais).
8. Mover o lead para a etapa "Link do site enviado" no pipeline.

## Proibições

- NÃO responder "não tenho o link do protocolo" antes de checar produtos_utilizados.
- NÃO enviar apenas https://www.lakma.com.br quando existir pelo menos um link_individual_produto resolvido.
- NÃO inventar links. Usar apenas links que aparecem no arquivo do protocolo (resolvidos via Brain Build) ou em produtos.md.
- NÃO confundir produtos parecidos. Se houver dúvida real, pedir confirmação ou encaminhar humano.

## Modelos de resposta

### Todos os produtos com link
"Claro. Vou te enviar os links dos produtos usados nesse protocolo:

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

### Protocolo com kit/link único (futuro)
"Claro. Esse é o link do kit/protocolo: <link do kit>

No site, você pode usar o cupom **LAKMA35** para ter 35% de desconto."

## Atualização de pipeline

- Move para "Link do site enviado" SOMENTE quando enviar ao menos um link (kit ou individual).
- NÃO mover se apenas indicou o protocolo, explicou passo a passo ou ainda está qualificando.

## Mapeamento Conhecimento → Produtos

- Os nomes em produtos_utilizados[].nome_citado_no_protocolo vêm do cadastro do protocolo (aba Conhecimento).
- A correspondência com produtos.md é feita automaticamente pelo Brain Build (tolera acentos, caixa, sufixos de tamanho/ml/g, palavras como "Lakma", "Kit", "Profissional").
- O resultado já está pronto no campo link_individual_produto de cada item — usar diretamente.
