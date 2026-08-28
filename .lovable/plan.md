# Tela da Letícia: mostrar só o essencial do caso encaminhado

## O que a investigação mostrou

- `ExpedicaoChat.tsx` corta as mensagens exclusivamente por `handoff_at` (data da concessão): tudo antes vira "histórico", tudo depois vira "atual".
- Nos casos de backfill (Stefanie, João Felipe, Thais, Anny) a concessão foi criada em 27/08 19:31, muito depois da fala real do cliente. Resultado: a mensagem que originou o caso e a confirmação da NINA caem no histórico, e nada fica na área principal.
- Além disso, existe hoje um efeito que **abre o histórico automaticamente** quando toda a mídia caiu nele. No caso do João Felipe isso escancara as 64 mensagens da conversa — exatamente o comportamento indesejado.
- O gatilho real do João Felipe existe e está correto na concessão: `trigger_message_id` aponta para "Meu pedido tá atrasado" (26/08 11:59:24), seguida da confirmação da NINA às 11:59:58.

## O que será feito (somente `src/components/ExpedicaoChat.tsx`)

1. **Âncora do corte passa a ser a mensagem-gatilho**, não a data da concessão:
   - se existir `trigger_message_id` e a mensagem for encontrada, ela é a âncora;
   - senão, a última fala do cliente até `handoff_at` (comportamento atual);
   - senão, `handoff_at`.
2. **Visão padrão do atendimento** = bloco "Motivo do encaminhamento" (motivo + mensagem real do cliente, nunca substituída por fala da NINA) + contexto mínimo + confirmação da NINA + tudo que veio depois da âncora.
3. **Contexto mínimo condicional**: só quando a mensagem-gatilho for curta/ambígua (texto com menos de ~25 caracteres ou entre um conjunto de respostas genéricas como "sim", "não chegou", "dificuldade"), incluir até **3 mensagens anteriores do cliente**. Caso contrário, nenhuma mensagem anterior é carregada na visão padrão.
4. **Confirmação da NINA**: primeira mensagem da NINA logo após a âncora já entra naturalmente na visão padrão (ela vem depois da âncora).
5. **Histórico recolhido por padrão**: tudo anterior ao contexto mínimo permanece dentro de "Ver conversa anterior com a NINA", fechado, com a contagem de mensagens e de anexos. O botão continua discreto.
6. **Remover a abertura automática do histórico**. As mídias relevantes continuam visíveis sem abrir o histórico: o bloco de motivo e a faixa "Anexos do cliente" passam a usar a janela em torno da âncora (mesma lógica de 5 min antes / 2 min depois, agora relativa ao gatilho), e continuam sem duplicar a mídia já mostrada no bloco de motivo.

## Validação do João Felipe (`a7b8eddb…`, 64 mensagens)

Visível por padrão:
- Motivo do encaminhamento: **Onde está meu pedido**
- Mensagem do cliente: **"Meu pedido tá atrasado"** (26/08 11:59:24) — gatilho real, texto claro, portanto **sem contexto adicional**
- Confirmação da NINA: "Oi, Joao! Entendo a ansiedade. Seu caso já está registrado com o nosso time…" (26/08 11:59:58)

Escondido em "Ver conversa anterior com a NINA": as **62 mensagens anteriores**, incluindo as repetições de 25/08, os avisos de rastreio de 21/08 e todo o histórico de julho/agosto.

## Fora de escopo (intocado)

Classificação e regras de handoff, `apply_expedicao_handoff`, concessões, atribuições, `ai_paused`/`human_takeover_required`/`handoff_type`/`handoff_reason`, tabela `messages`, `send_queue`, Finalizar Atendimento, reativação da NINA, Shopify → WhatsApp e o Chat ao Vivo administrativo. Nenhuma mensagem é enviada ao cliente e nenhum dado é apagado — a mudança é apenas de renderização.
