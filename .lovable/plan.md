# Validação individual das dermoconsultoras (Mylena → Talia → Laura)

Auditoria read-only concluída. Abaixo, a estratégia mais segura, sem tocar em cliente real,
balanceamento, prioridade da Laura, Nina, Leticia, logística, Shopify, RLS ou histórico.

## 1. Melhor estratégia de teste

Criar um **atendimento sintético isolado**: contato de teste próprio + conversa de teste +
handoff dermo reproduzido diretamente (mesmos campos que o fluxo real grava), atribuído
manualmente à profissional alvo — **sem passar pelo balanceamento** (`pick_dermo_assignee`
não é chamado, portanto nada da rotação real é consumido).

O contato de teste usa um número de WhatsApp da própria equipe (ex.: o celular da pessoa que
acompanha o teste), nunca um cliente. Assim, se a dermo responder pela interface, a mensagem
chega no aparelho da equipe e nenhum cliente é impactado.

## 2. Tabelas/campos envolvidos (o que um handoff dermo real grava)

- `contacts`: contato sintético (nome "TESTE INTERNO — Mylena", telefone da equipe).
- `conversations`: `contact_id`, `status='human'`, `ai_paused=true`,
  `human_takeover_required`, `requires_dermoconsultant=true`,
  `handoff_type='dermoconsultora'`, `handoff_reason='dermoconsultora_request'`,
  `handoff_created_at`, `assigned_user_id = team_members.id da dermo`, `assigned_at`,
  `human_status='pendente'`, `attendance_finished=false`, `last_message_at`.
- `messages`: 1–2 mensagens sintéticas (`from_type='user'`) para dar contexto e servir de
  `trigger_message_id`.
- `conversation_access_grants`: `conversation_id`, `team_member_id` da dermo alvo,
  `reason='dermoconsultora_request'`, `is_active=true`, `trigger_message_id`,
  `trigger_snippet`.
- `conversation_handoff_events`: evento `handoff_applied` com metadata `{"synthetic": true}`
  para rastreabilidade.

`assigned_user_id` sozinho **não** basta: a visibilidade exige simultaneamente
`assigned_user_id = grant.team_member_id`, grant ativo e motivo aceito por
`is_dermo_handoff_reason` (confirmado em `list_my_dermo_conversations` e
`dermo_can_access_conversation`).

## 3. Risco de interferência no least-loaded

Real e confirmado: `pick_next_dermoconsultora()` ordena por
`count(conversations) WHERE assigned_user_id = tm.id AND human_takeover_required = true
AND attendance_finished = false`.

Mitigação escolhida: manter `human_takeover_required = false` na conversa sintética.
Ela continua visível, abrível, respondível e finalizável pela dermo (nenhuma das funções de
acesso usa esse campo), mas **não entra na contagem de carga** — impacto zero no
balanceamento. Se quisermos validar também com o campo em `true`, faremos apenas por poucos
minutos e revertemos logo em seguida.

## 4. Como evitar envio externo indevido

Não existe hoje modo dry-run: `dermo_reply` insere em `send_queue` e o `dermo-chat` chama o
`whatsapp-sender`. Por isso o contato sintético usa o número da própria equipe — o envio real
acontece, mas apenas para nós. Nada é enviado a cliente, nenhuma conversa real é tocada e
nenhuma regra de envio é alterada.

## 5. Acesso somente da dermo alvo

Garantido pelo próprio modelo: um único grant ativo para o `team_member_id` da Mylena, com
`assigned_user_id` igual. Verificação explícita depois: executar `list_my_dermo_conversations`
no contexto de cada uma das outras dermos e confirmar que a conversa sintética não aparece.

## 6. Limpeza pós-teste

Remoção completa e restrita aos IDs sintéticos: eventos → grants → mensagens → conversa →
contato. Nada de real é tocado; a limpeza é filtrada pelo `conversation_id`/`contact_id`
criados no teste.

## 7. Mecanismo já pronto para reutilizar

Não há flag de "conversa sintética" nem fixture. Existe precedente: o handoff sintético já
usado para validar a Cris. Reutilizamos exatamente esse padrão, acrescentando
`metadata.synthetic = true` e o prefixo "TESTE INTERNO" no nome do contato.

## 8. Plano mínimo — Mylena primeiro

1. Confirmar `team_members.id`, `status='active'` e `user_roles.role='dermo'` de Mylena
   (`mylenalakma@outlook.com`).
2. Criar contato sintético com número da equipe.
3. Criar conversa + 1 mensagem de cliente sintética.
4. Aplicar o estado de handoff dermo com atribuição direta à Mylena
   (`human_takeover_required=false`), criar o grant ativo e o evento.
5. Verificação de isolamento: a conversa aparece para Mylena e para nenhuma outra dermo.
6. Teste humano da Mylena: abrir, responder (mensagem chega no aparelho da equipe),
   finalizar atendimento.
7. Conferir estado final (`attendance_finished=true`, grant revogado).
8. Limpar tudo pelos IDs criados.
9. Repetir o mesmo roteiro para Talia e depois Laura, sem alterar sua prioridade clínica.

## Fora do escopo

Nenhuma mudança de código, migration, RLS, balanceamento, prioridade da Laura, classificação,
Nina, Leticia, Shopify, WhatsApp, contas ou histórico. Nenhuma conversa ou cliente real é
alterado.
