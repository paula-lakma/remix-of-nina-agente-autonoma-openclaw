# Leticia: promessa de encaminhamento sem atribuição + prioridade visual

Auditoria só de leitura (código + consultas no banco). Nada foi alterado. Os números são de 05/10/2026.

## 1. Promessas de encaminhamento para a Leticia (o que os dados mostram)

Mensagens da Nina que citam a Leticia junto com encaminhar/passar/direcionar/conectar/chamar: **46 mensagens em 38 conversas**. A Leticia "recebe" uma conversa quando ganha uma permissão de acesso ativa (é isso que faz a conversa aparecer na tela dela), e não pelo campo de responsável.

| Situação | Conversas |
|---|---|
| Ativa com a Leticia agora | 21 |
| Recebeu, depois finalizada por ela ou reatribuída (normal) | 12 |
| **Nunca recebeu** | **5** (todas sem responsável, todas dos últimos 14 dias) |
| Atribuída a outra pessoa | 0 |
| Recebeu e perdeu por rotina automática | 0 |

Das 5, **4 são falhas reais** (`0ecc5fd9`, `3b1067f5`, `93e105bf`, `a03a8d51`, de 24 a 30/09). A quinta (`c788b549`) foi a Nina explicando o rastreio e oferecendo a Leticia "se tiver dúvida", então não era promessa.

## 2. Causa (confirmada no código e nos dados)

O texto ao cliente e a atribuição são **separados, não atômicos**. A Nina escreve "vou encaminhar para a Leticia" e o servidor decide por conta própria se encaminha:
1. Primeiro tenta o motivo estruturado enviado pela Nina (`--handoff-reason` / marcador `[[HANDOFF:]]`). Nos 4 casos, ele não veio.
2. Depois tenta detectar o assunto **só na última mensagem do cliente**. Nos 4 casos, essa mensagem era:
   - só o código de rastreio (`AP5…BR`), em 3 casos;
   - "Pq vcs não me entregaram aqui", em 1 caso. A regra conhece "entregue" e "não foi entregue", mas não "entregaram".
3. Por último, tenta usar o histórico, mas só quando a última mensagem é uma confirmação curta ("sim", "isso") ou um endereço. Um código de rastreio sozinho não conta.

Resultado: nenhuma regra dispara, a conversa continua com a Nina e a promessa vai ao cliente mesmo assim. Não encontrei disputa de tempo, interferência da atualização automática nem desfazimento por finalização ou reabertura nesses casos.

Arquivos e funções: `supabase/functions/_shared/handoff.ts` (`resolveHandoffDecision`, `detectHandoffTarget`, `detectHandoffTargetFromHistory`, `isConfirmedHandoffResponse`, `applyResolvedHandoff` → função do banco `apply_expedicao_handoff`) e `supabase/functions/nina-reply/index.ts`. A atribuição manual usa outro caminho e não é afetada.

## 3. Regra atual da Leticia (no código)

Tudo que é pós-compra vai para a Leticia, mesmo com histórico de pele: pedido, entrega, frete, prazo, envio/postagem/despacho, transportadora, rastreio, código inválido ou não recebido, endereço do pedido. Casos de reembolso, troca, devolução e SAC vão para a Paula Rodrigues; influenciadoras vão para a Carla. Qualquer um desses assuntos pode terminar com promessa sem atribuição quando a mensagem do cliente é curta, só um código ou usa uma palavra que a regra não conhece.

## 4. Proposta de correção do encaminhamento (Passo A)

- Um código de rastreio sozinho na mensagem passa a valer como assunto da Leticia (`tracking_help`).
- Incluir "entregaram", "não me entregaram" e variações na regra de pedido não recebido.
- **Rede de segurança:** se a resposta da Nina cita a Leticia e confirma o encaminhamento ("vou encaminhar/passar"), sem ser pergunta, o servidor aplica o encaminhamento para a Leticia usando os motivos já aprovados.
- Lista de exceção para admin: conversas em que a Nina prometeu a Leticia e não existe acesso dela até 2 minutos depois.
- As 4 conversas atuais: reatribuir só depois da sua aprovação, uma a uma.

## 5. Prioridades

**CRÍTICO** (prevalece sobre tudo): intenção de medida jurídica ou formal. Exemplos:
- justiça, processar, advogado, medidas legais/judiciais;
- Procon, consumidor.gov, Reclame Aqui;
- boletim de ocorrência, denúncia, "meus direitos" em tom de ameaça;
- formas indiretas: "se não resolver vou…", "já falei com meu advogado", "isso vai pra justiça".

Proteções contra falso alarme:
- frase negada ("não quero precisar entrar na justiça");
- "processo de entrega/compra";
- "direitos" sem tom de reclamação;
- citação de outra pessoa.

Detecção por padrões com contexto (verbo de intenção + alvo jurídico) e lista de exclusões, com testes para cada exemplo seu.

**ALTO** (mostra todos os motivos):
- **Cliente irritado:** 2 ou mais sinais fortes na mesma conversa desde o encaminhamento, por exemplo "absurdo", "péssimo atendimento", "ninguém responde", "perdi a paciência", "cansada de esperar", "vocês não resolvem", ou várias cobranças. Uma palavra isolada não basta.
- **Contato repetido:** depois do encaminhamento, o cliente volta a escrever com intervalo de **mais de 2 horas** desde a mensagem anterior dele, sem resposta humana entre as duas. Várias mensagens seguidas em poucos minutos contam como um único contato. Vira "2º contato", "3º contato"…
- **Mais de 7 dias sem resposta:** a contagem parte da **mais antiga mensagem do cliente que ainda não teve resposta humana depois dela**. Mensagem da Nina não conta como resposta.

Exibição: `CRÍTICO · Possível medida judicial · 9 dias aguardando` ou `ALTO · Cliente irritado · 2º contato · 9 dias aguardando`.

## 6. Contagem atual (estimativa com padrões simples, a validar no Build)

| Categoria | Conversas |
|---|---|
| A) Prometeu a Leticia e ela não recebeu | 4 |
| B) Intenção jurídica/formal (todas as conversas) | 1 |
| C) Cliente claramente irritado | 2 |
| D) Cliente voltou após mais de 2 h, nas conversas da Leticia | 12 de 27 |
| E) Ativas com a Leticia, mais de 7 dias sem resposta humana | 14 de 29 (19 aguardando; a mais antiga de 17/08) |

O número de E é alto: antes do Build vou conferir se as respostas que a Leticia envia pela tela dela ficam gravadas como resposta humana, para não acusar atraso por engano.

## 7. Tela da Leticia e outras telas

- Na tela dela (Chat ao Vivo restrito):
  - selo com ícone e texto: CRÍTICO em vermelho, com borda forte e ícone de alerta; ALTO em âmbar;
  - motivos em uma linha;
  - lista ordenada: CRÍTICO primeiro, depois ALTO, depois normal (mais recente primeiro dentro de cada grupo).
  - Nunca só cor.
- **Admin e Chat geral:** o mesmo selo nas conversas destinadas à Leticia, mais a lista de exceção "Prometido à Leticia sem atribuição", só para admin.
- A prioridade aparece para a Leticia apenas nas conversas que estão com ela.

## 8. Dados e migration

Tudo pode ser calculado com os dados que já existem: mensagens, horários, autor, acessos da Leticia e eventos de encaminhamento. Proposta: **cálculo na hora, sem novos campos**, feito no servidor que já monta a lista da Leticia. Isso evita estado duplicado. **Nenhuma migration** é necessária.

## Plano de Build (cada passo com pausa para aprovação)

1. **Passo A: encaminhamento.** Ajustes de regra e rede de segurança, mais testes:
   - código sozinho → Leticia;
   - "não me entregaram" → Leticia;
   - "vou encaminhar para a Leticia" sem motivo → Leticia;
   - pergunta ("quer que eu encaminhe?") → nada;
   - c788b549 (oferta) → nada.

   Publicar e acompanhar.
2. **Passo B: lista de exceção para admin** (só leitura), com as 4 conversas atuais. Reatribuição só com sua aprovação.
3. **Passo C: cálculo de prioridade.** Funções puras de prioridade, com testes de cada frase positiva e negativa e de cada regra (2 h, 7 dias, Nina não conta como resposta), aplicadas à lista da Leticia no servidor.
4. **Passo D: visual.** Selos, motivos e ordenação na tela da Leticia; selo no Chat geral para admin.

## Detalhes técnicos

- Passo A: `_shared/handoff.ts` (padrão de código de rastreio `^[A-Z]{2}\d{9}[A-Z]{2}$`, "entregaram" em `where_is_my_order`, `isLeticiaPromise(agentContent)` como fallback em `resolveHandoffDecision` com motivo `tracking_help`/`order_financial_question` conforme o histórico); testes em `handoff-classification-matrix.test.ts`. Republicar as funções que importam `handoff.ts` (`nina-reply`, `nina-orchestrator`, `reap-orphan-runs`).
- Passo C: novo `_shared/priority.ts` + espelho em `src/lib/priority.ts`, com teste `src/__tests__/leticia-priority.test.ts`. O resultado vai no retorno de `expedicao-chat` (lista), sem mudar permissões.
- Passo D: `ExpedicaoChat.tsx` (lista e cabeçalho) e `ChatInterface.tsx` (selo para admin).
- Riscos:
  - falso positivo no fallback de promessa: mitigado exigindo nome da Leticia + verbo de confirmação + não ser pergunta;
  - falso alarme de CRÍTICO: mitigado pelas exclusões e pelos testes;
  - custo do cálculo na lista: limitado às conversas da Leticia.
- Desfazer: cada passo é só código. Para voltar, basta republicar a versão anterior das funções e da tela; não há dados novos para limpar.
- Fora do escopo: Nina (instruções), WhatsApp, Pipeline, alertas, automações, SLA e mensagens ao cliente.
