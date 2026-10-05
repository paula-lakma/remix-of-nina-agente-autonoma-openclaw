# Chat: horário real de cada mensagem — auditoria e plano mínimo

Auditoria feita só com leitura (código + consultas). Nada foi alterado.

## Resultado da auditoria

1. **Onde ficam as mensagens:** tabela `messages` (ligada a `conversations` por `conversation_id`).
2. **Campo de horário:** `messages.sent_at` (timestamptz, obrigatório, padrão `now()`). Existe também `created_at` (horário de gravação) e `delivered_at`/`read_at` (opcionais, status).
   - Cliente: `sent_at` = horário original do WhatsApp (`message.timestamp` × 1000 no webhook).
   - Nina/equipe: `sent_at` = horário do envio pelo processador de envio.
3. **Fuso:** timestamptz, gravado em UTC.
4. **Ordenação:** sempre por `sent_at` (lista carrega as 100 mais recentes e inverte; "mensagens anteriores" pagina de 100 em 100 por `sent_at <`). Conversas ordenadas por `conversations.last_message_at`.
5. **Mensagens sem data:** nenhuma (0 de 1.752: 690 cliente, 909 Nina, 153 equipe).
   - Atraso entre envio real e gravação acima de 2 min: 6 do cliente e 2 da Nina, máximo ~40 min. Como a ordenação usa o horário real, elas aparecem no lugar certo depois de recarregar; ao vivo, uma mensagem atrasada pode surgir no fim até a próxima recarga.
6. **Bolhas:** Chat completo em `ChatInterface.tsx`; chats restritos (expedição, dermo, parcerias) em `ExpedicaoChat.tsx` (`RestrictedHandoffChat`).
7. **Lista lateral:** dentro de `ChatInterface.tsx`, texto `lastMessageTime`.
8. **O que chega na tela:** o horário completo (`sentAtRaw`, `lastMessageAtRaw`) já chega; o texto exibido é montado em `src/types.ts`.
9. **Por que o horário não fica claro:**
   - Chat completo mostra só `HH:MM`, sem data; mensagens de dias diferentes ficam iguais. Não há separador de dia.
   - Usa o fuso do navegador, não fixa America/Sao_Paulo.
   - Mensagens novas ao vivo e as enviadas pela equipe recebem o horário do navegador na hora em que a tela mostrou (`new Date()`), não o `sent_at` real.
   - Lista lateral: tempo relativo ("5min", "2h") calculado uma vez no carregamento e congelado; mensagens novas viram "Agora" e não mudam mais.
   - Chats restritos já mostram data e hora completas (com segundos), sem separador de dia.

## Proposta de exibição

- **Em cada bolha** (discreto, onde já aparece hoje): hoje `14:32`; outros dias `04/10/2026 14:32`.
- **Separador de dia** centralizado entre grupos: `Hoje`, `Ontem`, `03/10/2026`.
- **Lista lateral:** hoje `09:42`; ontem `Ontem`; até 6 dias `seg`, `ter`...; mais antigo `DD/MM/AAAA`. Calculado a partir do horário real, atualizado a cada minuto (só a formatação, sem buscar dados de novo).
- Sempre fuso America/Sao_Paulo, sempre a partir de `sent_at` / `last_message_at`.
- **Desktop e celular:** mesmo texto; no celular o horário fica embaixo da bolha (já é assim) e o separador ocupa a largura toda. Sem mudança de layout.
- Os chats restritos passam a usar o mesmo formato e separador.

## Conversa sem resposta (só avaliação)

Os dados atuais bastam para, no futuro, mostrar "aguardando resposta há X": última mensagem por `sent_at`, autor por `from_type` (user / nina / human), tempo desde a última mensagem do cliente e se houve resposta depois. Nada disso será criado agora.

## Plano de Build mínimo (após aprovação)

1. Criar um único formatador de horário (fuso America/Sao_Paulo): horário da bolha, rótulo do dia, rótulo da lista lateral.
2. Chat completo: usar o horário real nas bolhas, inserir separadores de dia, rótulo da lista recalculado a cada minuto.
3. Mensagens novas ao vivo e enviadas pela equipe: formatar a partir do horário real, não do relógio da tela.
4. Chats restritos: mesmo formato e separador.
5. Testes do formatador: hoje → `14:32`; ontem → `04/10/2026 14:32`; virada de dia em São Paulo (ex.: 02:30 UTC = 23:30 do dia anterior); rótulos Hoje/Ontem/data; lista lateral hoje/Ontem/dia da semana/DD/MM/AAAA.
6. Conferir na tela, desktop e celular.

## Detalhes técnicos

- Arquivos: novo `src/lib/chatTime.ts` (+ teste em `src/__tests__/chat-time.test.ts`); `src/types.ts` (formatMessageTime/formatRelativeTime); `src/components/ChatInterface.tsx` (separadores, tick de 1 min no rótulo); `src/hooks/useConversations.ts` (só o texto de horário das mensagens otimistas/realtime, linhas com `new Date()` / `'Agora'`); `src/components/ExpedicaoChat.tsx` (formato + separador).
- Sem migration, sem mudança no banco, funções, polling, envio/recebimento, handoff, Nina, CRM, Pipeline, filas ou Vendas.
- Riscos: baixos, só exibição. Cuidado com a virada de dia em São Paulo vs UTC (coberto por teste) e com não reordenar a lista ao vivo (fica como está hoje).
