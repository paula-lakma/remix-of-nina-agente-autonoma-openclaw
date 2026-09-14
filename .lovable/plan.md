# Distribuidores, influenciadoras e casos escalados (Paula Rodrigues e Carla)

Auditoria somente leitura concluída. Nada foi alterado no código, no banco nem em contas.

## 1. Comportamento atual — Distribuidor

"Quero ser distribuidor da Lakma." **não é classificado**. Existe o motivo
`distribution_handoff` registrado como destino comercial (Paula), mas **não há nenhuma regra de
detecção para "distribuidor" / "distribuição" / "representar"**. Só existem `revenda`, `atacado`
e `fornecedor`. Resultado: a conversa continua com a Nina, sem encaminhamento, a menos que o
cliente use a palavra "revender".

## 2. Comportamento atual — Influenciadora

"Sou influenciadora e gostaria de fazer uma parceria." é classificada como parceria/influenciadora
e o destino é a Carla (`carla@lakma.com.br`), que já está cadastrada e ativa. **Porém o
encaminhamento não é determinístico:** só acontece se a Nina escrever uma frase de confirmação
("vou encaminhar…"). Se ela responder de outro jeito, a conversa fica com a Nina.

## 3. Comportamento atual — Reembolso (problema confirmado)

"Quero solicitar o reembolso do meu pedido." **vai hoje para a Leticia**. Duas causas somadas:

1. a regra de logística é avaliada **antes** de tudo, e a expressão de pedido genérico captura
   "meu pedido";
2. mesmo sem isso, `refund_request` está mapeado para financeiro (Leticia).

Como o destino financeiro é determinístico, o encaminhamento acontece de fato — para a pessoa
errada segundo a nova regra de negócio.

## 4. O que já existe / o que falta

Já existe: destinos comercial (Paula), parcerias (Carla) e financeiro (Leticia) por e-mail;
motivos canônicos; matriz de detecção; marcador `[[HANDOFF:...]]`; `handoff_type`;
registro em `conversation_handoff_events`; pausa da Nina e atribuição automática.

Falta: detecção de distribuidor/representação; precedência do reembolso sobre logística;
determinismo para distribuidor, influenciadora e reembolso; linguagem citando Paula e Carla;
e a troca de "Ana Carla" por "Carla".

## 5. Matriz final (decisões fechadas)

- **Leticia** — onde está o pedido, rastreio, entrega, frete, prazo, postagem, despacho,
  transportadora, pedido não recebido, dúvidas operacionais pós-compra e dúvidas de pagamento
  do pedido. Inalterado, **salvo** quando houver pedido explícito de reembolso, estorno ou
  contestação.
- **Paula Rodrigues** —
  1. distribuição/comercial estratégico: ser distribuidor, revenda, representação da marca,
     parceria comercial como canal de venda;
  2. casos complexos/escalados: reembolso, estorno, cancelamento com devolução de valor,
     contestação de cobrança/chargeback, troca, devolução, produto avariado, item faltando,
     reclamação/SAC que exija intervenção humana.
- **Carla** — exclusivamente influenciadora, criadora de conteúdo, collab, parceria de
  divulgação e relacionamento com influenciadoras. Nunca "Ana Carla".

**Precedência:** casos escalados e distribuição/influenciadora são avaliados **antes** da matriz
logística. "Quero reembolso do meu pedido", "quero cancelar e receber meu dinheiro de volta",
"quero contestar essa cobrança", "meu produto chegou avariado" e "faltou um produto no meu
pedido" vão para a Paula. "Onde está meu pedido", "preciso do código de rastreio" e "meu pedido
ainda não chegou" continuam com a Leticia.

## 6. Handoff determinístico e obrigatório

Distribuidor, influenciadora e casos escalados seguem o mesmo princípio já usado para logística
e dermoconsultora: o backend atribui a conversa imediatamente à responsável correta, com base na
intenção do cliente, independentemente da frase que a Nina escrever.

## 7. Como Paula e Carla recebem e acessam

Ambas permanecem com o papel atual e as permissões atuais — nada de restrição de Chat ao Vivo
nesta implementação. Hoje elas já enxergam as conversas no Chat ao Vivo completo, então a
conversa aparece assim que for atribuída.

## 8. Agendamento

O agendamento existente (distribuição → Paula, influenciadora → Carla) continua como recurso
complementar. **Nunca é pré-condição do encaminhamento:** falha ou ausência de agenda não impede
a atribuição. Nenhuma integração nova de agenda, nenhum horário inventado. Única mudança: a
validação passa a aceitar "Carla".


## 10. Referências a "Ana Carla"

- `supabase/functions/_shared/appointments.ts` — validação do responsável do agendamento.
- Uma migration antiga de prompt (histórico, não será reescrita).
Nenhuma mensagem já enviada será alterada.

## 11. Plano mínimo de implementação

1. `supabase/functions/_shared/handoff.ts`
   - nova matriz de **casos escalados** (reembolso/estorno) avaliada antes da logística, com
     destino comercial;
   - `refund_request` passa a comercial; criar motivo de estorno equivalente;
   - novas regras de **distribuição/representação** (`distribution_handoff`);
   - reforçar influenciadora/parceria sem capturar frases genéricas ("gosto da marca",
     "posso marcar vocês");
   - tornar determinísticos os destinos comercial e parcerias para esses motivos;
   - proteção contra falso positivo comercial ("quero comprar", "quanto custa", "em quantidade").
2. `supabase/functions/_shared/appointments.ts` — aceitar "Carla".
3. Instruções da Nina (`brain-build`, `skills/nina/SKILL.md`, `prompts/conversa.md`): citar Paula
   Rodrigues e Carla pelo nome real; proibir "setor de reembolso", "equipe de parcerias" etc.
4. Testes automatizados na matriz de classificação.

Nenhuma migration, nenhuma alteração de conta, papel, RLS ou conversa real.

## 12. Publicação / runtime

Publicar `nina-orchestrator`, `nina-reply`, `nina-tools` e `brain-build`; depois **reconstruir o
cérebro em /cerebro** (necessário, senão a VPS continua com o texto antigo) e aguardar o sync.

## 13. Testes

- "Quero ser distribuidor da Lakma" → Paula, encaminhamento real.
- "Sou influenciadora e queria parceria" → Carla, encaminhamento real.
- "Quero solicitar o reembolso do meu pedido" → Paula, não Leticia.
- "Meu pedido não chegou" / "quero o código de rastreio" → continua Leticia.
- "Quero comprar em quantidade", "tem desconto para profissional?", "posso marcar vocês?" →
  continua com a Nina.
- Casos clínicos, sensíveis e rodízio das dermoconsultoras: inalterados.

## Preservado

Dermoconsultoras, rodízio, `weight=8` da Talia, prioridade da Laura, Leticia e toda a logística,
handoff manual e automático, Finalizar atendimento, reabertura, Chat ao Vivo restrito com
atualização silenciosa de 20s, RLS, Shopify, WhatsApp, chat-media, mensagens e histórico.
