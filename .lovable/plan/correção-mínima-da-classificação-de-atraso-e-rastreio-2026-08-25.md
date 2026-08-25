# Correção mínima da classificação de atraso e rastreio

## Diagnóstico confirmado

O teste real seguiu este caminho:

1. A mensagem recebida foi **“Meu pedido ta atrasado”**.
2. A Nina respondeu que encaminharia ao atendimento, mas **não incluiu `handoff_reason` nem marcador estruturado**.
3. Em `nina-reply`, essa promessa de encaminhamento ativou o fallback legado (`confirmedHandoffRegex`).
4. `detectHandoffTarget()` tentou classificar primeiro a resposta da Nina e depois a mensagem do cliente, porém a matriz legada **não possui regras para atraso de pedido, entrega ou rastreio**.
5. Sem correspondência, `nina-reply` aplicou seu padrão final literal:
   ```ts
   { reason: "sensitive_case", destination: "dermoconsultant" }
   ```
6. O evento real confirma `reason_source: "regex_fallback"`, `handoff_reason: "sensitive_case"` e destino `dermoconsultant`. Como `sensitive_case` não pertence à allowlist da expedição, nenhuma concessão foi criada para Letícia.

A matriz canônica já conhece `tracking_not_received`, `tracking_code_invalid`, `tracking_no_update`, `tracking_help`, `carrier_question`, `shipped_no_info`, `where_is_my_order` e `tracking_link_issue`, todos destinados a Letícia. A lacuna está na classificação do texto natural e no fallback inseguro para dermoconsultora.

## Alteração mínima proposta

### 1. Tornar explícita a regra entregue ao agente

Acrescentar uma instrução curta e fonte-controlada ao prompt efetivo dos dois caminhos de resposta:

- pedido já enviado + atraso/não chegou/onde está → `where_is_my_order`;
- rastreio parado/sem atualização → `tracking_no_update`;
- código não recebido → `tracking_not_received`;
- código inválido ou link com erro → `tracking_code_invalid` / `tracking_link_issue`;
- enviado sem informação de acompanhamento → `shipped_no_info`;
- dúvida sobre transportadora → `carrier_question`;
- assunto ambíguo (“problema no pedido”) → fazer uma pergunta curta para distinguir entrega/rastreio, pagamento ou produto, **sem prometer nem executar handoff**.

As regras atuais de pele e segurança dermatológica permanecem inalteradas.

### 2. Corrigir somente a rede de segurança do fallback

Na matriz legada de texto natural:

- adicionar correspondências específicas para atraso de entrega, pedido não recebido, localização do pedido, rastreio sem atualização, código e link de rastreio;
- avaliar essas regras antes do padrão genérico;
- remover o padrão que transforma qualquer encaminhamento não classificado em `sensitive_case`;
- quando nenhum assunto estiver claramente identificado, não aplicar handoff. A Nina deverá ter perguntado a confirmação prevista no prompt.

Não serão criados novos destinos, papéis, tabelas, políticas ou motivos. A resolução existente `financeiro → financeiro@lakma.com.br` e a allowlist atual serão reutilizadas.

## Exemplos esperados

### Encaminham para Letícia

| Mensagem | Motivo estruturado esperado |
|---|---|
| “Meu pedido tá atrasado” | `where_is_my_order` |
| “Onde está meu pedido?” | `where_is_my_order` |
| “Meu pedido já foi enviado e não chegou” | `where_is_my_order` |
| “O rastreio não atualiza há dias” | `tracking_no_update` |
| “Não recebi o código de rastreio” | `tracking_not_received` |
| “Meu código de rastreio dá inválido” | `tracking_code_invalid` |
| “O link do rastreio não abre” | `tracking_link_issue` |
| “Qual transportadora está com meu pedido?” | `carrier_question` |

### Continuam com dermoconsultora, sem mudança

| Mensagem | Destino/motivo existente |
|---|---|
| “Minha pele ficou lesionada depois de usar” | dermoconsultora / pele lesionada ou reação |
| “Tive alergia e inchaço com o produto” | dermoconsultora / alergia ou reação |
| “Estou gestante, posso usar esse ácido?” | dermoconsultora / gestação |
| “Uso isotretinoína; posso seguir o protocolo?” | dermoconsultora / tratamento dermatológico |
| “Fiz peeling ontem e minha pele está ardendo” | dermoconsultora / procedimento recente ou reação |

Pedidos comerciais comuns de produto, como “qual produto para acne?”, continuam sendo atendidos pela Nina e **não** ganham handoff automático.

### Pedem confirmação, sem encaminhar

- “Estou com problema no meu pedido.”
- “Preciso de ajuda com uma compra.”
- “Quero falar com alguém sobre um produto.”

Resposta esperada: uma pergunta objetiva para identificar se é entrega/rastreio, pagamento ou orientação sobre produto. Nenhuma conversa é pausada até a resposta esclarecer o assunto.

## Testes sintéticos a executar

Todos serão testes locais de lógica pura, sem chamar funções publicadas, banco ou sender:

1. **Matriz de expedição:** validar cada frase da tabela de Letícia e seu motivo canônico.
2. **Regressão exata:** “Meu pedido ta atrasado” nunca pode resultar em `sensitive_case`; deve resultar em `where_is_my_order`.
3. **Matriz dermatológica:** validar gestação, alergia, reação, lesão, medicamento e procedimento recente nos destinos atuais.
4. **Produto sem risco:** validar que indicação comercial comum não gera handoff.
5. **Ambiguidade:** validar que frases genéricas não recebem destino e não ativam pausa.
6. **Prioridade e conflito:** frases de rastreio não podem cair em dermoconsultora; frases dermatológicas não podem cair na expedição.
7. **Motivo estruturado e concessão:** os motivos de rastreio continuam resolvendo para `financeiro` e passando na allowlist da expedição; `sensitive_case` continua fora dela.
8. **Anti-injeção:** manter a remoção de `[[HANDOFF:...]]` vindo do cliente.

## Garantias da validação

- Nenhum teste usará conversa, contato ou mensagem existente.
- Nenhuma função publicada será invocada.
- Nenhum registro será inserido, atualizado ou excluído.
- Nenhuma fila de envio será criada ou drenada.
- **Nenhum WhatsApp real será enviado.**
- Não haverá publicação nesta etapa de implementação até uma validação separada e autorizada.
