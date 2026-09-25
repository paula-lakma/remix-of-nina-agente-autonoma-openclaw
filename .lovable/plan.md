# CRM V1 — validação final de acesso (read-only)

Nada foi alterado. Nenhum dado temporário foi criado. Tudo abaixo vem da leitura do código e do banco feita agora.

## Resultado por papel

| Papel | Menu Contatos | /contacts | Leitura CRM | Escrita CRM | crm_list_staff | crm_user_names | Resultado |
|---|---|---|---|---|---|---|---|
| admin | sim | liberado | sim | sim (nota de outro autor: sim) | dados | dados | OK |
| manager | sim | liberado | sim | sim (nota de outro autor: sim) | dados | dados | OK (sem usuário real para testar) |
| sdr | sim | liberado | sim | sim, só a própria nota | dados | dados | OK |
| dermo | não | redireciona para /chat | 0 linhas | recusada | 0 linhas | 0 linhas | Bloqueado |
| expedicao | não | redireciona para /tracking | 0 linhas | recusada | 0 linhas | 0 linhas | Bloqueado |
| parcerias | não | redireciona para /chat | 0 linhas | recusada | 0 linhas | 0 linhas | Bloqueado |
| rastreio | não | redireciona para /tracking | 0 linhas | recusada | 0 linhas | 0 linhas | Bloqueado |
| user | não | redireciona para /chat | 0 linhas | recusada | 0 linhas | 0 linhas | Bloqueado (sem usuário real) |
| moderator | não | redireciona para /dashboard | 0 linhas | recusada | 0 linhas | 0 linhas | Bloqueado (sem usuário real) |
| anon | não entra (login) | vai para /auth | 0 linhas | recusada | sem permissão | sem permissão | Bloqueado |

## Respostas 1 a 15

1. admin/manager/sdr: corretos. Todas as regras de leitura e escrita das 4 tabelas usam "é admin, manager ou sdr", verificado pelo usuário logado.
2 a 7. dermo, expedicao, parcerias, rastreio, user e moderator: bloqueados no menu, na rota e no banco. O menu e a rota usam a mesma lista de permissões; nenhum desses papéis tem "contacts".
8. anon: bloqueado. Não executa as duas funções, e todas as regras das tabelas valem só para usuário logado, então anon recebe 0 linhas e não grava.
9. Frontend e backend coerentes: os mesmos 3 papéis nos dois lados.
10. As duas funções continuam seguras: SECURITY DEFINER, search_path fixo em `public`, checagem por `is_operational_staff(auth.uid())`. Não existe parâmetro que troque o usuário checado. Elas devolvem só nome (e-mail apenas se não houver nome) e, na lista de equipe, o papel.
11. Divergências (apenas observações, sem correção):
   - As 4 tabelas crm_* têm permissão técnica concedida também para anon (herdada do padrão do banco). Na prática, não há efeito: sem regra para anon, nada é lido nem gravado. Vale limpar numa próxima rodada, se quiser.
   - Não existem usuários manager, user ou moderator hoje. Esses papéis foram validados pelas regras, não por login real.
   - Tabela contacts não é CRM: a dermo pode continuar lendo os contatos que já lê hoje, mas as 4 tabelas crm_* checam o papel, não o contato. Separação confirmada.
12. Nenhum dado temporário criado.
13. Nenhum código, banco ou configuração alterado.
14. Os 2 avisos 0029 (funções do CRM executáveis por usuário logado) continuam conhecidos e aceitos; a checagem interna segue correta.
15. Os 6 alertas antigos continuam pausados e intocados. Não rodei uma nova varredura de segurança.

## Próximo passo opcional (se aprovar)

Simular cada papel no banco dentro de uma transação desfeita no final (ROLLBACK), com usuário real de cada papel existente: SELECT/INSERT/UPDATE nas 4 tabelas e chamada das 2 funções. Nada fica gravado, sem mensagens, conversas, handoffs, Pipeline ou Nina. Também posso abrir /contacts na Preview como sdr e como dermo.

## Detalhes técnicos
- Frontend: `useUserRole.ts` (ROLE_PERMISSIONS: contacts só em admin/manager/sdr), `Sidebar.tsx` filtra por `can(item.id)`, rota `/contacts` com `RoleGate area="contacts"`.
- RLS ativo nas 4 tabelas; policies TO authenticated; crm_notes UPDATE: autor ou admin/manager; sem DELETE em notes/followups/profiles; DELETE em interests para staff.
- `has_function_privilege`: anon = false, authenticated = true nas duas funções.
- Papéis existentes: admin 1, sdr 2, dermo 5, expedicao 1, parcerias 1, rastreio 1.
