# Backfill de handoffs financeiros históricos para a Leticia

## Auditoria READ-ONLY (executada agora, sem alterar nada)

Varri todas as mensagens de clientes com termos de pedido, entrega, rastreio, transportadora, endereço, frete e financeiro (pagamento, Pix, boleto, cartão, cobrança, nota fiscal, reembolso, comprovante) e cruzei com o estado atual de handoff, atribuição e concessão de acesso.

Resultado:

| Situação | Conversas |
| --- | --- |
| Conversas com intenção financeira/expedição | 7 |
| Já corretamente com a Leticia (handoff financeiro + concessão ativa) | 2 |
| Finalizadas (caso irrelevante) | 0 |
| Órfãs (sem handoff financeiro, sem concessão) | 5 |

### Já corretas (não tocar)

- Rosana Bastos — `carrier_question`, pausada, atribuída à Leticia, concessão ativa.
- Lakma Dermocosmeticos (teste) — `carrier_question`, mesmo estado.

### Órfãs encontradas

| Conversa | Cliente | Última msg | Trecho do cliente | Motivo pelas regras atuais |
| --- | --- | --- | --- | --- |
| `120573eb…` | Stefanie | 27/08 | "Qual seria a transportadora?" | `carrier_question` |
| `a7b8eddb…` | Joao Felipe | 26/08 | "Meu pedido tá atrasado" | `where_is_my_order` |
| `d0e6ec25…` | Thais Galvão | 22/08 | correção de número do endereço do pedido | `order_financial_question` |
| `22641148…` | Anny Caroline | 18/08 | "O site da transportadora é qual?" | `carrier_question` |
| `1adfd5bf…` | Tania | 09/07 | "Na compra se paga quando recebe o produto?" | dúvida comercial de política de pagamento |

Observações relevantes:

- Nenhuma das órfãs está finalizada, nenhuma está pausada, e três delas têm `assigned_user_id` apontando para SDRs (Joao Felipe, Thais) — o backfill precisa reatribuir, não duplicar.
- O caso da Tania (09/07) é uma pergunta comercial sobre forma de pagamento antes da compra, não um problema pós-compra, e está inativa há ~7 semanas. **Proposta: excluir do backfill** aplicando um corte de 15 dias de atividade. Isso deixa **4 conversas** no escopo.

## Plano de backfill (idempotente, sem mensagem ao cliente)

### Como será feito

Não haverá nova classificação nem novo código: o backfill chama a RPC já existente e validada `apply_expedicao_handoff`, exatamente a mesma usada pelo fluxo em produção. Ela é atômica e faz, em uma transação: pausar a Nina, marcar `human_takeover_required`, definir `handoff_type = financeiro` com o motivo, atribuir a Leticia e criar a concessão + evento que tornam a conversa visível no Chat ao Vivo dela.

Execução em uma migration de dados única, com:

1. **Lista fixa e explícita** das conversas alvo (os 4 IDs auditados) e o motivo canônico de cada uma, junto com o `trigger_message_id` da mensagem real do cliente que originou o caso — assim o bloco "Motivo do encaminhamento" já abre com a fala correta.
2. **Guarda de idempotência**: antes de cada chamada, pular a conversa se já existir concessão ativa, se `handoff_type` já for `financeiro`, ou se `attendance_finished` for verdadeiro. Rodar a migration duas vezes não cria concessão nem evento duplicado.
3. **Origem marcada** como backfill no evento de handoff, para que fique auditável que esses casos não vieram do fluxo em tempo real.
4. **Nada é enfileirado**: não há inserção em `send_queue`, `messages` ou qualquer chamada a função de envio. O cliente não recebe nada.

### Verificação após a execução

Consulta read-only confirmando, para cada uma das 4 conversas: `ai_paused = true`, `human_takeover_required = true`, `status = paused`, `handoff_type = financeiro`, `assigned_user_id` = Leticia, uma concessão ativa e um evento registrado. Depois, conferir que `list_my_expedicao_conversations` retorna as 4 na sessão da Leticia, e que nenhuma conversa fora da lista mudou de estado.

### O que não será tocado

Casos dermatológicos, produtos e protocolos; a conversa da Tania e qualquer conversa fora dos 4 IDs; as 2 conversas já corretas; Shopify → WhatsApp; rastreio automático e manual; templates; mídia; `send_queue`; classificador e Edge Functions (nenhum deploy). Nenhuma alteração de schema, política RLS ou RPC.

## Escopo confirmado

Corte de 15 dias confirmado: backfill somente das 4 conversas recentes (`120573eb…`, `a7b8eddb…`, `d0e6ec25…`, `22641148…`). A conversa da Tania (09/07) fica de fora.
