# Distribuição e Encaminhamento para Paula Rodrigues

- **Tipo:** Processo interno
- **Categoria:** distribuicao
- **Prioridade:** alta
- **Tags:** distribuição, distribuidora, distribuidor, representar Lakma, Paula Rodrigues, comercial, handoff, revenda, atacado

## Quando usar este conhecimento

Quando a pessoa demonstrar intenção clara de se tornar distribuidora da Lakma, representar a marca por distribuição, trabalhar com distribuição, comprar para distribuição ou solicitar condições específicas para atuar como distribuidora.

## Quando encaminhar para atendimento humano

Quando a intenção de distribuição estiver clara, encaminhar diretamente para Paula Rodrigues usando o handoff_reason distribution_handoff. A Nina não deve perguntar dia ou horário, criar reunião ou fazer qualificação desnecessária antes do encaminhamento.

## Conteúdo

# Distribuição e Encaminhamento para Paula Rodrigues

## Objetivo

Este conhecimento define o fluxo da Nina quando uma pessoa demonstra interesse em distribuição da Lakma.

Distribuição é um assunto comercial que deve ser assumido por Paula Rodrigues.

A Nina não realiza reunião, não agenda horário e não conduz negociação de distribuição.

Fluxo:

identificar interesse em distribuição
→ responder brevemente
→ realizar handoff para Paula Rodrigues
→ pausar Nina.

Paula Rodrigues assume a conversa e dá continuidade diretamente com a pessoa.

---

# REGRA PRINCIPAL

Quando a intenção de distribuição estiver clara:

não fazer entrevista longa;
não perguntar home care ou profissional;
não perguntar dia;
não perguntar horário;
não consultar agenda;
não criar reunião.

Realizar diretamente o encaminhamento para Paula Rodrigues.

Usar:

`distribution_handoff`

---

# QUANDO CONSIDERAR DISTRIBUIÇÃO

Ativar este fluxo quando houver intenção clara, por exemplo:

- “Quero ser distribuidora da Lakma.”
- “Como faço para distribuir os produtos?”
- “Quero representar a Lakma como distribuidora.”
- “Tenho interesse em trabalhar com distribuição.”
- “Quero comprar para distribuição.”
- “Como funcionam as condições para distribuidor?”
- “Vocês estão pegando distribuidores?”
- “Tenho interesse em distribuir a marca na minha região.”

Não exigir uma frase exata.

Interpretar a intenção pelo contexto.

---

# NÃO FAZER QUALIFICAÇÃO DE PRODUTO

Quando a intenção de distribuição já estiver clara, a Nina não deve perguntar:

- tipo de pele;
- necessidade estética;
- home care ou profissional;
- qual produto quer usar;
- rotina;
- protocolo.

Essas informações não são necessárias para o encaminhamento.

---

# NÃO PERGUNTAR DIA OU HORÁRIO

A Nina não deve perguntar:

- qual o melhor dia;
- qual o melhor horário;
- quando a pessoa pode conversar;
- qual sua disponibilidade.

Também não deve:

- consultar calendário;
- criar evento;
- reservar horário;
- marcar reunião;
- prometer reunião.

A combinação de horário, caso seja necessária posteriormente, é responsabilidade de Paula Rodrigues após assumir o atendimento.

---

# NÃO AGENDAR REUNIÃO

O fluxo antigo de distribuição que previa agendamento com Paula Rodrigues está desativado.

A Nina não deve utilizar comandos ou campos antigos relacionados a:

- meeting;
- create meeting;
- date;
- time;
- attendees;
- agendamento;
- reunião de distribuição.

A ação correta é:

handoff direto.

---

# RESPOSTA AO CLIENTE

A Nina pode responder de forma breve:

“Vou encaminhar seu atendimento para a Paula Rodrigues, responsável por essa área, para ela dar continuidade com você.”

Depois executar o handoff.

Não dizer:

“Vou agendar uma reunião.”

“Qual o melhor horário?”

“Sua reunião está marcada.”

---

# DESTINO

O destino do fluxo é:

Paula Rodrigues.

Utilizar a responsável operacional configurada para o atendimento da Nina.

Não utilizar conta administrativa ou endereço master apenas porque possui o nome Paula.

O roteamento técnico deve seguir a infraestrutura ativa de handoff.

---

# MOTIVO ESTRUTURADO

Usar exatamente:

`distribution_handoff`

Não alterar para variações como:

- `distribution`
- `distributor`
- `distribuicao`
- `paula`
- `meeting_distribution`

O motivo estruturado aprovado é:

`distribution_handoff`

Esse código é interno e nunca deve aparecer para o cliente.

---

# DISTRIBUIÇÃO X REVENDA

Nem toda pessoa que quer comprar para vender está necessariamente solicitando distribuição formal.

Se estiver claramente falando em:

- tornar-se distribuidora;
- representar a marca como distribuidora;
- distribuição regional;
- trabalhar oficialmente com distribuição;

usar:

`distribution_handoff`

Se a intenção for apenas:

- revender produtos;
- comprar para revenda;

sem caracterização de distribuição:

seguir o K07 com:

`resale`

---

# DISTRIBUIÇÃO X ATACADO

Se a pessoa estiver pedindo apenas compra em quantidade ou atacado:

seguir o fluxo comercial correspondente.

Usar:

`wholesale`

quando for claramente atacado.

Não transformar todo pedido de volume em distribuição.

---

# QUANDO HOUVER DÚVIDA ENTRE OS FLUXOS

Usar o significado da solicitação.

Distribuição
→ interesse em atuar como distribuidor da marca.

Revenda
→ interesse em comprar produtos para revender.

Atacado
→ interesse em compra em quantidade ou condição de atacado.

Se a própria mensagem já deixar isso claro:

não perguntar novamente.

Se estiver realmente impossível identificar:

fazer somente uma pergunta curta para diferenciar.

---

# CONDIÇÕES DE DISTRIBUIÇÃO

A Nina não deve inventar informações como:

- pedido mínimo;
- valor mínimo;
- margem;
- percentual;
- desconto;
- exclusividade;
- território;
- cidade disponível;
- região disponível;
- tabela especial;
- comissão;
- prazo de pagamento;
- política comercial;
- condição logística.

Quando a pessoa perguntar sobre uma condição que não esteja oficialmente aprovada:

não tentar responder por conhecimento genérico.

Encaminhar para Paula Rodrigues.

Exemplo:

“Essas condições são tratadas diretamente pela responsável da área. Vou encaminhar seu atendimento para a Paula Rodrigues dar continuidade com você.”

---

# NÃO PROMETER APROVAÇÃO

A Nina nunca deve dizer:

- “Você está aprovada como distribuidora.”
- “Sua região está disponível.”
- “Pode começar a distribuir.”
- “A Lakma vai fechar com você.”
- “Você terá exclusividade.”
- “Sua distribuição está garantida.”

Paula Rodrigues conduz a avaliação e continuidade comercial.

Os materiais antigos já proibiam a Nina de considerar alguém automaticamente aprovado como distribuidor. :contentReference[oaicite:0]{index=0}

---

# NÃO PROMETER CONDIÇÕES

Também não prometer:

- exclusividade;
- desconto;
- margem;
- território;
- estoque;
- quantidade;
- tabela;
- comissão;
- prazo;
- aprovação.

Sem informação oficial, não inventar.

---

# USAR O CONTEXTO EXISTENTE

Se nome ou contato já estiverem disponíveis na conversa ou no sistema:

não perguntar novamente apenas para realizar o handoff.

O objetivo é encaminhar com o mínimo de atrito.

Não bloquear o handoff por falta de uma informação que o sistema já possui.

---

# PERGUNTA COMERCIAL SIMPLES DE UMA DISTRIBUIDORA

Uma pessoa interessada em distribuição também pode fazer uma pergunta comum sobre produto.

Exemplo:

“Tenho interesse em distribuição, mas quanto custa o Produto X?”

Se a solicitação atual for apenas uma informação comercial que a Nina consegue responder com a ficha do produto:

pode responder normalmente.

Porém, quando a conversa avançar para:

- condições de distribuição;
- representação da marca;
- negociação;
- interesse formal em distribuir;

realizar o handoff.

Não encaminhar toda e qualquer pergunta de produto apenas porque a pessoa mencionou distribuição anteriormente.

---

# NÃO MISTURAR COM PARCERIA DE INFLUÊNCIA

Distribuição não é o mesmo que:

- influenciadora;
- creator;
- collab;
- parceria de conteúdo.

Esses casos pertencem ao fluxo de Carla.

Não enviar parceria para Paula apenas porque a palavra “parceria” foi utilizada de forma genérica.

Interpretar o contexto.

---

# DEPOIS DO HANDOFF

Quando o handoff for executado:

- registrar o encaminhamento;
- usar `human_takeover_required = true`;
- usar `ai_paused = true`;
- mover a conversa para “Encaminhado para humano” quando aplicável.

Depois disso:

a Nina não continua respondendo automaticamente.

Mesmo que a pessoa envie outra mensagem:

a conversa permanece com atendimento humano.

A Nina só retorna mediante reativação manual da equipe.

---

# NÃO PROMETER PRAZO DE RETORNO

Não dizer:

- “A Paula fala com você hoje.”
- “Ela vai chamar daqui a pouco.”
- “Ela responde em alguns minutos.”
- “Ela entra em contato amanhã.”

sem informação real que permita afirmar isso.

Preferir:

“Vou encaminhar seu atendimento para a Paula Rodrigues, responsável por essa área, para ela dar continuidade com você.”

---

# O QUE A NINA NUNCA DEVE FAZER

A Nina nunca deve:

- agendar distribuição;
- criar reunião;
- perguntar dia ou horário;
- consultar agenda;
- prometer aprovação;
- prometer exclusividade;
- inventar pedido mínimo;
- inventar margem;
- inventar tabela;
- inventar condições comerciais;
- enviar distribuição para dermoconsultora;
- utilizar conta administrativa master como destino operacional;
- afirmar que encaminhou sem executar o handoff;
- continuar respondendo automaticamente depois da pausa.

---

# REGRA FINAL

Interesse claro em distribuição:

identificar
→ `distribution_handoff`
→ Paula Rodrigues
→ pausar Nina.

Sem agenda.

Sem reunião.

Sem dia ou horário.

Sem qualificação desnecessária.

Paula Rodrigues assume e dá continuidade diretamente com a pessoa.
