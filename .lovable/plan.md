# CRM V1 — validação final antes do Publish (auditoria read-only)

## 1. As duas funções novas

| | `crm_list_staff()` | `crm_user_names(_ids uuid[])` |
|---|---|---|
| Finalidade | Lista de responsáveis possíveis para follow-up | Nome de autores de notas / responsáveis de follow-ups |
| Retorno | `user_id, display_name, role` | `user_id, display_name` |
| Tipo | SECURITY DEFINER, SQL, STABLE | SECURITY DEFINER, SQL, STABLE |
| Owner | postgres | postgres |
| search_path | fixo `public` | fixo `public` |
| EXECUTE | authenticated, service_role (anon NÃO) | authenticated, service_role (anon NÃO) |
| Validação de papel | `is_operational_staff(auth.uid())` no WHERE | idem |

- `is_operational_staff` = existe role admin/manager/sdr para o usuário. Usa `auth.uid()` do token, não parâmetro, então não há como contornar.
- dermo / expedicao / parcerias / rastreio: podem chamar, mas recebem **0 linhas**. anon: nem executa.
- `crm_list_staff` só retorna usuários que são admin/manager/sdr. Não expõe e-mail além do fallback de nome (usa e-mail apenas se não houver nome).
- `crm_user_names`: um staff pode passar qualquer UUID e obter o nome de qualquer profile (inclusive dermo). Não é enumerável na prática (UUID aleatório, sem listagem), e só devolve nome. Risco baixo.
- Contornam RLS de `profiles` por design (é o motivo de existirem), mas somente para staff e somente nome/role.
- Conclusão: seguras como implementadas.

Ajuste opcional (pequeno): em `crm_user_names`, retornar e-mail como fallback só quando não houver nome — já é assim; nenhuma mudança necessária.

## 2. Acesso pela interface

- Rota `/contacts` protegida por `RoleGate area="contacts"`; menu usa o mesmo mapa.
- Permitido no front: admin, manager, sdr (e legados `user`/`moderator`).
- dermo, expedicao, parcerias, rastreio: sem "Contatos" no menu; URL direta redireciona para a própria home / "Acesso restrito". A ficha é modal dentro de `/contacts`, então não abre por URL.
- Backend: tabelas `crm_*` e funções só liberam para admin/manager/sdr. Legados `user`/`moderator` veem a tela mas o CRM volta vazio (não há usuários com esses papéis ativos para CRM; só estética).

## 3. "Abrir no Chat Ao Vivo"

Causa: em `ChatInterface`, o parâmetro `?conversation=` só é aplicado se o id já estiver na lista carregada; senão seleciona a primeira conversa.

Menor solução proposta (somente no efeito de seleção):
- Se o id do URL não estiver na lista: manter a seleção como esse id, buscar pontualmente essa conversa por id (mesma consulta/RLS existente, sem mudar paginação nem polling) e inseri-la no topo da lista local.
- Se a busca falhar (sem permissão / inexistente): comportamento atual (primeira conversa) + aviso "Conversa não encontrada".
- Risco: médio-baixo, pois toca o hook de conversas. Se durante o build exigir mexer em polling/paginação, manter o comportamento atual na V1 e reportar.

## 4. Filtro Responsável

Significado exato: contatos cuja conversa tem `assigned_user_id` = pessoa escolhida, **independente** de o atendimento estar ativo, finalizado ou com a Nina. "(inativo)" = responsável registrado, mas sem atendimento humano ativo.

Ajuste de rótulo (só texto):
- Filtro: "Responsável registrado (ativo ou encerrado)".
- Coluna: trocar "(inativo)" por "(atendimento encerrado)" quando finalizado e "(com a Nina)" quando não há humano ativo.
- Sem alterar regra nem conversations.

## 5. Notas CRM x Chat

- CRM: aba "Notas" -> "Notas do CRM"; texto de ajuda mantém "não aparecem no Chat".
- Chat: rótulo "Notas internas" -> "Notas internas do atendimento" e toast "Notas salvas" -> "Notas do atendimento salvas".
- Sem migrar/copiar/sincronizar.

## 6. Toast cobrindo botões

Toaster global está no topo direito, sobre o cabeçalho da ficha. Menor correção: mover para `bottom-right` no `Toaster` do App (afeta todos os toasts, só posição). Alternativa mais restrita: adicionar `offset` maior no topo. Recomendo `bottom-right`.

## 7. Os 2 avisos leves de segurança

- Código: lint 0029 "Signed-In Users Can Execute SECURITY DEFINER Function".
- Objetos: `public.crm_list_staff()` e `public.crm_user_names(uuid[])`.
- Motivo: funções definer executáveis por `authenticated`.
- Avaliação: comportamento intencional; validação de papel interna garante 0 linhas para quem não é staff. Não aparecem em 0028 (anon), pois anon não tem EXECUTE.
- Os 6 alertas antigos continuam pausados e intocados.

## 8. Recomendado antes do Publish

1. Rótulos do filtro Responsável e do status (item 4).
2. Rótulos das notas (item 5).
3. Toast em `bottom-right` (item 6).
4. Abrir no Chat Ao Vivo com carregamento pontual (item 3) — opcional; pode ficar para V1.1 se preferir risco zero no Chat.

Nenhuma dessas mudanças altera fluxo de Chat/Nina/handoffs/grants/Pipeline, RLS, roles ou banco. Item 3 toca apenas a seleção inicial da conversa no Chat.

## Detalhes técnicos
- Arquivos: `src/components/Contacts.tsx`, `src/components/crm/ContactProfile.tsx`, `src/components/ChatInterface.tsx` (rótulo de notas; efeito de seleção por URL), `src/App.tsx` (posição do Toaster), possivelmente `src/hooks/useConversations.ts` (inserir conversa pontual na lista local).
- Testes: rodar suíte completa; teste do rótulo de status; na Preview, abrir contato antigo pelo CRM e confirmar seleção correta.
