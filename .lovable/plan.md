# Pipeline — plano final de correção (aguardando aprovação)

Nada foi alterado. Base de hoje: **524 contatos, 1.048 cards**, cada contato com exatamente 2 cards. Diagnóstico completo mantido da auditoria anterior (2 gatilhos em `contacts`; IA analyze-conversation ainda move 1 dos 2 cards, inclusive para trás; handoff move os 2; Finalizar atendimento não move nada; responsável do card só é atualizado pelo seletor do admin).

## Decisões fechadas
1. analyze-conversation deixa de alterar card/etapa (continua fazendo memória do cliente).
2. Finalizar atendimento → "Atendimento concluído" + limpa responsável do card.
3. "Sem resposta": só manual. Sem cron.
4. Os 6 contatos antigos sem conversa ficam (1 card cada).

## 1. Regra final do card canônico (por contato)
1. Card com responsável preenchido **somente se** o contato tem atendimento humano ativo agora.
2. Senão: card com `created_at` mais antigo; empate → menor id.
A etapa atual do card **nunca** decide qual card fica.

"Atendimento humano ativo" = mesma definição do Dashboard: conversa ativa + responsável + não finalizada + (Nina pausada ou tomada humana ou tipo de encaminhamento preenchido).

## 2. Regra final da etapa (aplicada ao card canônico)
Só por evidência real, em ordem:
1. Atendimento humano ativo → **Encaminhado para humano**, responsável = responsável atual da conversa.
2. Último `attendance_finished` sem reabertura/reativação posterior e sem atendimento ativo → **Atendimento concluído**, responsável vazio.
3. Todo o resto → **Novo lead**, responsável vazio.
Qualificando, Indicação, Link do site e Concluído-sem-evento **não** são mantidos (vieram da IA). A etapa antiga de cada card fica guardada no backup, para quem quiser recolocar manualmente.

## 3. Como os 524 pares serão tratados
Conferido no banco hoje:
- 26 contatos com atendimento humano ativo → Encaminhado para humano.
- 3 contatos com finalização real, mas todos reabertos/reativados depois e sem atendimento ativo → Novo lead.
- 0 contatos com finalização real vigente.
- 495 contatos sem evidência → Novo lead.
Resultado: 524 mantidos, 524 removidos (guardados no backup).

## 4. Cards por etapa depois (previsão; recalculado na hora da execução)
| Etapa | Hoje | Depois |
|---|---|---|
| Novo lead | 854 | 498 |
| Qualificando necessidade | 143 | 0 |
| Indicação enviada | 1 | 0 |
| Link do site enviado | 6 | 0 |
| Encaminhado para humano | 22 | 26 |
| Atendimento concluído | 22 | 0 |
| Sem resposta | 0 | 0 |
| **Total** | 1.048 | **524** |

Qualificando/Indicação/Link zeram porque todas vieram da IA. Se preferir preservá-las como "manuais" em vez de voltar a Novo lead, é só avisar — mas isso contraria a regra "nunca consolidar etapa da IA".

## 5. Cards hoje em "Atendimento concluído" (22)
- 5 são de contatos com atendimento humano ativo → Encaminhado para humano.
- 17 sem atendimento ativo e sem finalização real vigente → Novo lead.

## 6. Cards hoje em "Encaminhado para humano" (22)
- 13 de contatos com atendimento ativo → continuam Encaminhado, com responsável preenchido.
- 9 de contatos sem atendimento ativo (encaminhamento antigo já devolvido à Nina) → Novo lead, responsável vazio.
- Além disso, 13 contatos com atendimento ativo que hoje não têm card em Encaminhado passam para lá (total 26).

## 7. Os 4 contatos com responsável no card
- 2 têm atendimento ativo → card com responsável é o canônico; responsável é regravado a partir da conversa (fonte de verdade).
- 2 não têm atendimento ativo → responsável residual é limpo; card canônico pela regra do mais antigo; etapa Novo lead. O valor antigo fica no backup.

## 8. Os 6 contatos antigos sem conversa
Ficam com 1 card cada (o mais antigo), etapa Novo lead, sem responsável. Contatos não são apagados.

## 9. Finalizar atendimento
Nas funções de finalização existentes (admin, Leticia, Carla, dermoconsultoras), depois do evento `attendance_finished`: card do contato → Atendimento concluído, responsável vazio. Nenhuma outra mudança no fluxo de finalização.

## 10. Reativar Nina
Card do contato: responsável vazio; se estiver em Encaminhado para humano → Novo lead (sem etapa humana residual). Outras etapas manuais ficam como estão.

## 11. Reabertura por nova mensagem
No gatilho de reabertura existente (`reopen_finished_conversation_on_message`): se o card estiver em Atendimento concluído → Novo lead. Se a nova mensagem gerar handoff, o handoff move para Encaminhado normalmente. Sem IA.

## 12. analyze-conversation
Remover o bloco que lê o card e muda a etapa, e o pedido de etapa à IA. Memória do cliente continua igual. Nenhum outro fluxo automático move etapa além de: criação, handoff, finalização, reativação, reabertura.

Handoff (`_shared/handoff.ts`): continua movendo para Encaminhado e passa a gravar o responsável = destinatário do encaminhamento. Roteamento, rodízio, Talia weight=8 e prioridade da Laura não mudam.

## 13. Ordem exata da execução
Uma migração, em transação única:
1. Criar tabela de backup `deals_backup_20260924` e copiar os 1.048 cards (com etapa e responsável originais).
2. Calcular, por contato, card canônico e etapa final (regras 1 e 2).
3. Atualizar o card canônico (etapa + responsável).
4. Apagar os 524 duplicados (os ids ficam no backup).
5. Remover o gatilho `auto_create_deal_on_contact_trigger` (e sua função fica sem uso, marcada como obsoleta).
6. Alterar `create_deal_for_new_contact` para `INSERT ... ON CONFLICT DO NOTHING`.
7. Criar índice único parcial: 1 card por contato enquanto não ganho/perdido.
8. Atualizar `reopen_finished_conversation_on_message` e as funções de finalização para mover o card (itens 9 e 11).
Depois da migração (código): analyze-conversation, handoff.ts, Reativar Nina e mensagem amigável no modal "Novo negócio" se o contato já tiver card. Deploy das funções alteradas.

## 14. Testes pós-implementação
- Contagens: 524 cards, 0 contatos com 2 cards, backup com 1.048 linhas, etapas conforme tabela do item 4.
- Novo contato → 1 card em Novo lead; dois inserts simultâneos → 1 card.
- Handoff → Encaminhado + responsável correto (Leticia, Carla, Paula Rodrigues, dermo).
- Resposta da Nina → etapa não muda.
- Finalizar → Concluído, responsável vazio.
- Reativar Nina → responsável vazio, sai de Encaminhado.
- Mensagem após finalização → sai de Concluído.
- Testes existentes (handoff, dashboard, roteamento) continuam passando.

## Riscos
- Remoção de cards e zeragem das etapas da IA: reversível só pelo backup (criado no mesmo passo).
- Índice único impede criar 2º card manual para o mesmo contato (tratado com aviso no modal).
- Nada toca Dashboard MASTER, chats, rastreio, Shopify, WhatsApp, papéis, RLS ou contas. Os 6 alertas de segurança continuam pausados.
