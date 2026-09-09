# Dropdown "Responsável" — encaminhamento completo ao escolher a Leticia

Auditoria read-only concluída. Nada foi alterado.

## 1. Comportamento atual do dropdown

Local: painel lateral do Chat ao Vivo (`ChatInterface.tsx`, seção "Responsável").
Ao trocar o valor, o app chama `assignConversation` → `api.assignConversation`, que faz
exatamente duas coisas:

- `conversations.assigned_user_id = <team_member.id>`
- `deals.owner_id = <team_member.id>` para os negócios do mesmo contato

Não pausa a Nina, não define `handoff_type`/`handoff_reason`/`assigned_at`/`human_status`,
não cria concessão de acesso e não registra evento. Por isso a conversa da Brena não apareceu
para a Leticia: a tela dela lista apenas conversas com **concessão ativa** e motivo logístico
aprovado (`list_my_expedicao_conversations`).

## 2. Ponto exato que precisa mudar

Somente o `onChange` do seletor: quando a pessoa escolhida for do papel logístico, chamar o
fluxo de encaminhamento existente em vez da simples atribuição.

## 3. Como detectar a Leticia com segurança

Não usar nome nem e-mail no frontend. A identificação correta é pelo **papel**: o membro cujo
`user_id` tem `role = 'expedicao'` em `user_roles`. Hoje só a Leticia (`Financeiro`) tem esse
papel. A regra fica automática se um dia outra pessoa assumir o papel.

A escolha do frontend serve apenas para a experiência de uso. A decisão real é validada no
backend: a função recusa a operação se o membro indicado não tiver o papel logístico, e a
função existente já seleciona a pessoa correta pelo papel, não por informação enviada da tela.

## 4. Reuso de `apply_expedicao_handoff` (sem duplicar lógica)

A função já existe e faz tudo (pausa, campos, concessão, evento, revogação da concessão
anterior — é idempotente por natureza). Porém ela **não é executável pelo app**: hoje só
`service_role` tem permissão.

Mudança mínima: criar um invólucro fino `admin_assign_expedicao(_conversation_id, _reason)`
que verifica `is_admin_or_manager(auth.uid())` e chama a função existente. Sem cópia de lógica,
uma única fonte de verdade.

## 5. Motivo canônico para atribuição manual

`order_financial_question` — motivo genérico pós-compra já aprovado na lista permitida.
Nenhum motivo novo é criado. Origem gravada como `manual`.

## 6. Comportamento proposto ao escolher a Leticia

Nina pausada, status correto, responsável e data preenchidos, `handoff_type = financeiro`,
motivo `order_financial_question`, concessão ativa criada, evento registrado e a conversa
aparecendo no Chat ao Vivo dela. Confirmação curta na tela antes de aplicar.

## 7. Trocar a Leticia por outra pessoa

Hoje a concessão dela continuaria ativa — ela seguiria vendo a conversa. Proposta: ao sair da
Leticia, revogar as concessões ativas com `revoke_expedicao_access` (motivo `reassigned`) e
limpar `handoff_type`/`handoff_reason`/`human_status`, mantendo a atribuição normal para a nova
pessoa. Comportamento das demais (Mylena, Cris, Talia, Barbara, Laura, Paula, Carla) permanece
idêntico ao de hoje.

## 8. "Não atribuído" depois da Leticia

Atual: só limparia o responsável, deixando concessão ativa e Nina pausada — estado residual.
Recomendado (mais seguro): revogar as concessões, limpar os campos de encaminhamento e
**perguntar** se a Nina deve voltar a responder, em vez de reativar silenciosamente.

## 9. Riscos de acesso residual

Concessão ativa sem responsável correspondente. A listagem exige `assigned_user_id = grant.team_member_id`,
então o acesso já cairia na prática — ainda assim a revogação explícita evita registros pendurados.

## 10. Plano mínimo de implementação

Migração:
- `admin_assign_expedicao(_conversation_id uuid, _reason text default 'order_financial_question')`
  security definer, guarda `is_admin_or_manager`, delega a `apply_expedicao_handoff`, grant a `authenticated`.
- `admin_clear_expedicao_assignment(_conversation_id uuid)` — revoga concessões e limpa campos de handoff.

Frontend:
- `src/services/api.ts`: `assignConversation` passa a consultar o papel do membro escolhido e
  rotear para a RPC certa; demais casos inalterados.
- `src/components/ChatInterface.tsx`: confirmação e mensagem específica ao escolher a Leticia.
- `src/hooks/useConversations.ts`: refletir estado (pausa/responsável) após a chamada.

Testes:
- membro comum → mesmo comportamento de hoje;
- membro com papel logístico → encaminhamento completo, concessão e evento únicos, reexecução idempotente;
- troca da Leticia por outra pessoa → nenhuma concessão ativa restante;
- "Não atribuído" → sem concessão ativa e sem campos de handoff residuais.

## Preservado

Encaminhamento automático de pedido, classificação pós-compra, linguagem sem "expedição",
dermoconsultoras, rodízio, `weight=8` da Talia, prioridade da Laura, Finalizar atendimento,
reabertura, RLS, Shopify, WhatsApp, chat-media e histórico. Nenhuma mensagem é enviada.
