# Ampliação controlada: Letícia no Chat ao Vivo (financeiro + rastreio)

Parada obrigatória: nada será implementado, migrado ou publicado sem sua aprovação.

## Estado verificado hoje

- Letícia: `financeiro@lakma.com.br`, papel `expedicao`, conta de autenticação existente e `team_members` ativo (os dois estão vinculados pelo mesmo identificador de usuário).
- `conversations.assigned_user_id` guarda o **id do membro da equipe** (não o id de login). Qualquer regra por "conversa minha" precisa traduzir login → membro da equipe.
- RLS atual em `contacts`, `conversations`, `messages`: uma policy por operação, todas exigindo `is_operational_staff` (admin/manager/sdr). O papel `expedicao` está bloqueado nessas tabelas — é exatamente o que mantém a segurança hoje.
- `conversation_handoff_events` hoje é legível por qualquer autenticado (será restringido junto).
- No roteamento de handoff atual existem motivos financeiros (`payment`, `invoice`) apontando para o e-mail da Letícia. **Não existe** nenhum motivo de rastreio/entrega — precisa ser criado.
- Menu e rotas são filtrados por `useUserRole` (`expedicao` só tem `tracking`).

## 1. O que será alterado

Banco (uma única migration, revisável antes):
- Função de apoio `current_team_member_id()` (traduz o login autenticado para o membro da equipe correspondente).
- Função `expedicao_owns_conversation(conversation_id)` — verdadeira só se o papel for `expedicao` e a conversa estiver atribuída à própria pessoa.
- Novas policies **aditivas** (não removem nem alteram as de admin/manager/sdr):
  - `conversations`: leitura e atualização restrita das próprias conversas atribuídas (update limitado a campos operacionais via trigger de guarda; troca de responsável bloqueada).
  - `messages`: leitura e inserção apenas dentro dessas conversas.
  - `contacts`: **sem** nova policy ampla. Os dados mínimos do contato virão por função dedicada.
  - `conversation_handoff_events`: leitura passa a exigir staff operacional ou conversa própria.
- Trigger de guarda em `conversations` impedindo que `expedicao` altere `assigned_user_id`, exclua, ou mexa em campos comerciais.
- Funções de leitura (security definer, filtradas pelo próprio usuário):
  - `list_my_conversations()` — devolve só conversas atribuídas, com nome e telefone mascarado do contato, sem memória da NINA, sem tags comerciais.
  - `get_my_conversation_messages(conversation_id)` — mensagens de uma conversa própria.
- Auditoria: reaproveita `conversation_handoff_events` (motivo, intenção, data, responsável, origem, trecho da mensagem que gerou o encaminhamento).

Backend (edge functions):
- `_shared/handoff.ts`: novos motivos canônicos de rastreio/entrega (rastreio não recebido, código inválido, sem atualização, dúvida Correios/Jadlog, "onde está meu pedido", link de rastreio com problema) e novos motivos financeiros que faltam (pagamento não identificado, recusado, cobrança duplicada, comprovante, estorno). Todos apontam para o destino `financeiro` (Letícia), sem mexer nos destinos comercial/parcerias/dermoconsultora.
- Atribuição atômica: uma RPC `claim_handoff_expedicao` que, em uma única transação, marca `ai_paused`, `human_takeover_required`, `handoff_type/reason`, `assigned_user_id`, `assigned_at`, e grava o evento de auditoria — só se a conversa ainda não estiver atribuída (`assigned_user_id is null` ou reatribuição autorizada). Isso evita duas atribuições concorrentes.
- Nova função `chat-reply-assigned`: valida sessão, confirma papel `expedicao`, confirma que a conversa é dela, e só então enfileira a resposta pela fila de envio já existente. Nada de service_role no navegador.

Frontend:
- `useUserRole`: `expedicao` passa a ter `['tracking', 'chat']`; home continua `/tracking`. Menu passa a exibir apenas Chat ao Vivo, Envio de rastreio e Sair (comportamento já derivado das permissões).
- `useConversations` / `ChatInterface`: quando o papel for `expedicao`, usar as funções de leitura restrita em vez das consultas diretas às tabelas; esconder ações de excluir conversa, trocar responsável, exportar, ver memória/dados comerciais. "Finalizar atendimento" continua disponível e com o comportamento atual.
- `App.tsx`/`RoleGate`: rota `/chat` liberada para `expedicao`; demais rotas continuam bloqueadas.

## 2. Como a NINA reconhece a intenção sem falso encaminhamento

- O roteamento continua **determinístico pelo motivo estruturado** (`[[HANDOFF:<motivo>]]`), nunca por palavra solta no texto. A regex legada não recebe os novos motivos, para não disparar por "pix" ou "rastreio" isolados.
- Instrução no cérebro: encaminhar só quando o cliente estiver claramente tratando de pagamento/cobrança/nota/estorno ou de rastreio/entrega de um pedido já feito. Assuntos de produto, protocolo, pele, cupom, intenção de compra, agendamento, distribuidor, agradecimento e respostas curtas ("ok", "obrigada") ficam explicitamente fora.
- Ambiguidade: a NINA faz **uma** pergunta curta de confirmação e só encaminha após resposta afirmativa.
- Mensagem única e curta ao cliente antes do encaminhamento; depois disso a NINA não responde mais naquela conversa.

## 3. Pausa e atribuição atômicas

Tudo em uma chamada de banco: pausa da IA + atribuição à Letícia + status humano + evento de auditoria. Se outra pessoa já assumiu, a chamada não sobrescreve e o resultado indica "já atribuída". O orquestrador já respeita `ai_paused`, então nenhuma resposta automática ocorre depois.

## 4. Sem resposta simultânea

Bloqueio por linha na conversa durante a atribuição, e a resposta da Letícia só é aceita se a conversa continuar atribuída a ela no momento do envio. Admin/manager reassumindo grava um evento de auditoria e a fila dela deixa de mostrar a conversa.

## 5. Chat ao Vivo da Letícia

Lista alimentada pela função `list_my_conversations()` — só conversas com `assigned_user_id` = membro dela. Sem busca global, sem lista de contatos, sem filtros por outros responsáveis. Realtime filtrado pela mesma condição, com revalidação no servidor.

## 6/7. Proteção de cada consulta e bloqueio de URL/API

Três camadas: RLS por responsável no banco; funções security definer que filtram pelo usuário autenticado; edge function de resposta que valida sessão + papel + posse. Digitar a URL de outra conversa retorna vazio/negado, e uma chamada direta à API com o token dela não devolve linhas de outras conversas nem de tabelas administrativas. Nenhuma chave privilegiada vai para o navegador.

## 8. Histórico e auditoria

Cada encaminhamento e cada reassunção registram em `conversation_handoff_events`: motivo, intenção detectada, data/hora, responsável, origem (NINA/manual) e trecho da mensagem que gerou o encaminhamento. Eventos são imutáveis (sem update/delete).

## 9. Admin e manager

Continuam com acesso total: veem, assumem, reatribuem e finalizam qualquer conversa. Nenhuma policy existente é removida ou enfraquecida.

## 10. Conversa finalizada

Comportamento atual preservado: ao finalizar, a conversa é encerrada; uma nova mensagem do cliente reabre e devolve o atendimento ao fluxo normal da NINA pelo gatilho já existente.

## 11. Testes (todos em conversa de teste dedicada, nunca com cliente real)

Roteamento: financeiro encaminha; rastreio encaminha; produto/protocolo/cupom não encaminha; mensagem ambígua gera pergunta de confirmação; palavra isolada não encaminha.
Fluxo: NINA pausa após o encaminhamento; nenhuma resposta automática depois da pausa; finalização e reabertura funcionam.
Acesso: Letícia vê só as próprias conversas; acesso por URL a conversa não atribuída é negado; chamada direta de API com o token dela não retorna outras conversas, contatos, negócios, agendamentos ou configurações; ela consegue responder só na conversa atribuída; ela não troca responsável nem exclui nada; páginas administrativas continuam bloqueadas.
Regressão: admin, manager e sdr operam como hoje; Shopify, rastreio automático, envio manual, filas e trava compartilhada intactos (contagens antes/depois).

## 12. Rollback imediato

1. Reverter `expedicao` para apenas `tracking` no controle de acesso do frontend (efeito imediato, sem migration).
2. Migration de reversão que remove só as policies/funções/trigger novos — as policies v3 originais não são tocadas, então o estado volta exatamente ao de hoje.
3. Se necessário, desabilitar a função de resposta nova; o envio manual de rastreio e o fluxo da Shopify não dependem dela.

## Ordem de execução proposta (após aprovação)

1. Migration (funções + policies + trigger + auditoria) — revisada antes de aplicar.
2. Motivos de handoff e RPC de atribuição atômica.
3. Função de resposta autenticada.
4. Frontend restrito e liberação da rota.
5. Bateria de testes com conversa de teste; só depois publicação.
