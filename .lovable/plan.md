# Handoff definitivo para Leticia

## Diagnóstico confirmado no ambiente atual

### Caso real: transportadora → “Dificuldade”

Na conversa de Stefanie (`120573eb-24b8-41ee-9b90-d4343e157918`):

1. A cliente perguntou **“Qual seria a transportadora?”**.
2. A Nina ofereceu encaminhamento, mas o callback não trouxe `handoff_reason` nem marcador estruturado.
3. A cliente respondeu apenas **“Dificuldade”**.
4. A Nina respondeu **“Vou encaminhar...”**, novamente sem motivo estruturado.
5. O fallback de `nina-reply` examinou somente a última mensagem da cliente, “Dificuldade”. Essa palavra isolada não identifica rastreio/transportadora.
6. Resultado confirmado no banco: `assigned_user_id` vazio, `ai_paused=false`, `human_takeover_required=false`, nenhum evento e nenhuma concessão ativa.
7. No turno seguinte, “Bom dia”, a Nina afirmou **“Já encaminhei...”**, mas o mesmo problema se repetiu porque a intenção original já não era a última mensagem.

### Caso real: alteração/informação de pedido

Na conversa de Amanda (`eb54fa34-d2e3-4654-bc7e-5542d7b712b3`):

1. A cliente pediu confirmação de alteração relacionada à entrega e enviou o endereço.
2. A Nina respondeu que encaminharia a dúvida sobre o endereço/pedido.
3. O callback também não trouxe motivo estruturado.
4. A matriz atual não possui cobertura para alteração de endereço de pedido e o texto curto do último turno não preservou toda a intenção.
5. Resultado confirmado: conversa ainda em `status=nina`, sem responsável, sem pausa, sem handoff e sem evento.

### Controle positivo

Uma conversa real com problema de rastreio foi classificada como `carrier_question` e chegou à `apply_expedicao_handoff`. Nesse caso, o banco atribuiu Leticia, pausou a Nina e criou concessão/evento corretamente. Isso confirma que **a RPC existente funciona**; a falha está antes dela, na decisão e propagação do motivo.

## Lacunas atuais

- `nina-reply` é hoje o único chamador da `apply_expedicao_handoff`.
- O caminho principal depende de o agente/OpenClaw obedecer e enviar `handoff_reason` ou `[[HANDOFF:...]]`.
- Sem motivo estruturado, o fallback ainda depende simultaneamente:
  - da redação da resposta da Nina ser reconhecida como confirmação; e
  - da última mensagem isolada do cliente conter todas as palavras necessárias.
- Isso perde contexto em respostas como “Dificuldade”, “Sim”, endereço isolado, “Obrigada” ou retomadas posteriores.
- O caminho síncrono/fallback do cérebro enfileira a resposta diretamente e não executa handoff.
- O recuperador de runs órfãos também gera/enfileira resposta sem aplicar handoff.
- Motivos legados `payment` e `invoice` resolvem para `destination: financeiro`, mas não pertencem à allowlist da expedição; por isso podem cair no fluxo genérico sem criar acesso ao Chat da Leticia.
- A matriz de fallback não cobre de forma completa prazo de entrega, frete, endereço do pedido, problemas administrativos/pós-compra e vários motivos financeiros detalhados já existentes na allowlist.
- Falhas de resolução de motivo podem terminar sem um registro operacional claro de “intenção financeira detectada, mas handoff não aplicado”.

## Regra proposta

A decisão será baseada na **intenção original do cliente**, antes de depender de qualquer texto produzido pela Nina:

```text
mensagem/grupo recebido
        |
        v
classificador determinístico central + contexto recente do cliente
        |
        +-- financeiro/pedido/expedição/entrega/rastreio --> apply_expedicao_handoff
        |                                                     |
        |                                                     +-- pausa Nina
        |                                                     +-- exige humano
        |                                                     +-- atribui Leticia
        |                                                     +-- cria concessão/evento
        |
        +-- dermatologia/protocolo/produto -----------------> fluxo atual preservado
```

Prioridade de segurança:

1. Motivo estruturado válido, quando existir.
2. Classificação determinística da mensagem original agrupada.
3. Para respostas curtas de continuação, contexto recente das mensagens do cliente, sem usar a redação da Nina como autorização.
4. Se o domínio financeiro/expedição estiver claro, executar imediatamente; não perguntar se deseja encaminhamento.
5. Termos de produto, protocolo, indicação, uso profissional/home care e dermatologia continuam fora desse fluxo. Casos sensíveis mantêm precedência para dermoconsultora.

A frase escrita pela Nina poderá comunicar o encaminhamento, mas nunca mais será a condição que decide se ele existe.

## Implementação planejada

### 1. Centralizar classificação e execução

Em `supabase/functions/_shared/handoff.ts`:

- ampliar a matriz financeira/expedição para todos os exemplos solicitados;
- classificar conteúdo agrupado e contexto recente, com prioridade explícita para casos dermatológicos sensíveis;
- normalizar motivos legados `payment`/`invoice` para motivos canônicos aceitos pela expedição;
- criar uma função compartilhada que receba conversa, mensagem original/contexto e eventual motivo estruturado, e que:
  - resolva uma única decisão;
  - para todo `destination: financeiro` válido, chame `apply_expedicao_handoff`;
  - para outros destinos, preserve `applyHandoff` e as regras de horário da dermoconsultora;
  - registre de forma diagnóstica a origem da decisão e falhas de aplicação.

Categorias canônicas já aceitas serão reutilizadas para evitar ampliar a RPC sem necessidade:

- entrega/pedido atrasado/não chegou/prazo/problema de entrega → `where_is_my_order`;
- rastreio, código, link, Correios/Jadlog e ajuda operacional → motivo específico existente ou `tracking_help`;
- transportadora → `carrier_question`;
- enviado sem informação → `shipped_no_info`;
- endereço, frete e questão administrativa de pedido → `order_financial_question`;
- pagamento/cobrança/Pix/cartão/boleto/nota fiscal/reembolso → motivo financeiro específico existente.

### 2. Aplicar antes da geração da resposta

Em `supabase/functions/nina-orchestrator/index.ts`:

- classificar o turno original logo após carregar a mensagem e o histórico;
- quando for financeiro/expedição inequívoco, executar a função central antes de escolher OpenClaw ou fallback síncrono;
- após sucesso, enviar uma confirmação curta pelo fluxo de fila já existente e encerrar o processamento do turno;
- não depender do modelo para produzir marcador, motivo ou frase exata;
- manter o guard de conversa já pausada e todo o processamento dermatológico atual.

Isso cobre tanto OpenClaw quanto o caminho síncrono/fallback com uma única decisão anterior à bifurcação de provedores.

### 3. Manter uma defesa no callback assíncrono

Em `supabase/functions/nina-reply/index.ts`:

- usar a mesma função central para callbacks já em andamento ou motivos estruturados recebidos;
- recuperar a mensagem original vinculada ao turno quando disponível e, na ausência desse vínculo, usar contexto recente suficiente para não perder casos como “Dificuldade”;
- remover a exigência de `isConfirmedHandoffResponse` para destinos financeiros claros;
- tornar a aplicação idempotente para que a defesa do callback não duplique concessão/evento se o orchestrator já aplicou o handoff;
- preservar extração de mídia, deduplicação de mensagens e acionamento do sender.

### 4. Cobrir o recuperador de runs sem criar outro classificador

Em `supabase/functions/reap-orphan-runs/index.ts`:

- reutilizar a mesma decisão central antes de gerar/enfileirar uma resposta de recuperação;
- impedir que um run órfão financeiro produza apenas uma promessa textual sem handoff real.

O follow-up de leads parados não será transformado em gatilho de handoff: ele não processa um novo pedido operacional e permanece fora da mudança.

### 5. Alinhar as instruções, sem torná-las fonte de verdade

Em `supabase/functions/brain-build/index.ts`, `skills/nina/SKILL.md` e `skills/nina/prompts/conversa.md`:

- orientar encaminhamento direto para todo o domínio definido;
- remover a orientação de pedir confirmação em assunto financeiro/expedição claro;
- manter `handoff_reason` como metadado útil, mas apenas complementar ao backend determinístico.

### 6. RPC e interface

- **Não alterar `apply_expedicao_handoff`**, pois a auditoria confirmou que ela resolve Leticia e executa corretamente a operação atômica.
- Não alterar `ExpedicaoChat.tsx`: a concessão/evento existentes já alimentam a lista e o bloco “Motivo do encaminhamento”; os motivos reutilizados já têm rótulo ou fallback amigável.
- Não alterar botão Finalizar, revogação, reabertura ou reativação da Nina.

## Arquivos previstos

- `supabase/functions/_shared/handoff.ts`
- `supabase/functions/nina-orchestrator/index.ts`
- `supabase/functions/nina-reply/index.ts`
- `supabase/functions/reap-orphan-runs/index.ts`
- `supabase/functions/brain-build/index.ts`
- `skills/nina/SKILL.md`
- `skills/nina/prompts/conversa.md`
- `src/__tests__/handoff-classification-matrix.test.ts`
- novo teste focado na decisão/aplicação central de handoff

Nenhuma migration é prevista. Se durante a implementação surgir evidência de que a RPC precisa mudar, a execução deve parar para explicar o motivo antes de qualquer alteração no banco.

## Testes obrigatórios

### Classificação positiva para Leticia

Cobrir, individualmente:

- onde está meu pedido;
- pedido atrasado / não chegou;
- rastreio genérico;
- código de rastreio, inválido ou não recebido;
- rastreio sem atualização;
- link de rastreio;
- transportadora, Correios e Jadlog;
- dúvida/problema/prazo de entrega;
- frete;
- pedido enviado sem informação;
- alteração ou dúvida de endereço vinculada a pedido/entrega;
- pagamento, cobrança, Pix, cartão, cobrança duplicada, boleto, nota fiscal e reembolso;
- questão administrativa ou pós-compra que a Nina não consegue confirmar.

### Casos reais e contexto

- “Qual seria a transportadora?” deve encaminhar já no primeiro turno.
- Histórico de transportadora + “Dificuldade” deve preservar o destino financeiro mesmo sem marcador e independentemente da resposta da Nina.
- Pedido/endereço seguido do endereço isolado deve encaminhar.
- A mesma intenção deve funcionar com respostas da Nina variadas, sem testar frases específicas como autorização.

### Limites negativos

- indicação de produto, protocolo, uso profissional/home care e dúvida comercial de produto não vão para Leticia;
- gestação, alergia, reação, pele lesionada, medicamento, procedimento recente e demais casos dermatológicos continuam com dermoconsultora;
- marcador injetado pelo cliente continua sem autoridade;
- assunto realmente ambíguo sem contexto suficiente não cria handoff incorreto.

### Efeitos e idempotência

Para cada financeiro válido, validar:

- `ai_paused=true`;
- `human_takeover_required=true`;
- `status=paused` e `handoff_type=financeiro`;
- `assigned_user_id` da Leticia;
- uma concessão ativa;
- evento e motivo registrados;
- visibilidade pela consulta usada no Chat da Leticia;
- repetição orchestrator/callback não duplica concessão ou evento;
- falha da RPC não é tratada como sucesso silencioso.

### Regressão

- suíte completa existente;
- testes dos destinos dermatológicos;
- testes de classificação e anti-injeção;
- testes de Finalizar atendimento/reabertura, sem alterar esses fluxos;
- nenhuma modificação ou chamada nos arquivos/funções de Shopify, envio automático ou trava compartilhada de rastreio.

## Implantação posterior à aprovação

1. Implementar e executar testes locais.
2. Exibir o diff e os resultados.
3. Publicar somente `_shared` por meio das funções dependentes: `nina-orchestrator`, `nina-reply`, `reap-orphan-runs` e `brain-build`.
4. Sincronizar o cérebro para atualizar as instruções da instância.
5. Fazer validação controlada com dados sintéticos, comprovando estado no banco e visibilidade no Chat da Leticia; limpar os dados ao final.
6. Não publicar frontend e não tocar no fluxo Shopify → WhatsApp.
