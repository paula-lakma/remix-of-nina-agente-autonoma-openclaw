# Pipeline — auditoria read-only e plano de correção (aguardando aprovação)

Nada foi alterado. Números de hoje (24/09 15h): **524 contatos, 1.048 cards** (cresceu desde a última auditoria: 467/934). Todo contato tem exatamente 2 cards; nenhum tem 1 ou 3+.

## Correção importante em relação à auditoria anterior
A análise automática por IA **ainda é chamada** a cada resposta da Nina (nina-reply dispara analyze-conversation). Ela roda a análise completa na 1ª interação e a cada 5 interações, e move **somente um dos dois cards** (o "mais recente", mas os dois nascem no mesmo instante, então a escolha é arbitrária). Ela também pode mover o card **para trás** (ex.: de "Encaminhado para humano" de volta para "Novo lead"). Isso explica a maior parte dos pares com etapas diferentes.

## 1. Causa exata da duplicação — os 2 gatilhos
Ambos em `contacts`, AFTER INSERT, por linha, sem condição:

| Gatilho | Função | Preenche |
|---|---|---|
| auto_create_deal_on_contact | create_deal_for_new_contact | título = nome/call_name, stage='new', priority='medium', 1ª etapa ativa do usuário ou global |
| auto_create_deal_on_contact_trigger | auto_create_deal_on_contact | título = nome + " - Deal", 1ª etapa ativa global |

Um contato novo dispara os dois → 2 cards. Nenhum índice único impede (o único índice único da tabela é o id).
**Deve permanecer:** `auto_create_deal_on_contact` (função create_deal_for_new_contact — título limpo, stage e prioridade preenchidos, é a versão corrigida em migração de dez/2025), tornando-a idempotente.

## 2. Classificação das duplicatas (524 pares)
- **A) Equivalentes** — mesma etapa, sem responsável, sem notas/valor/tags/atividades: **362**
- **B) Principal claro** — etapas diferentes, sem outros dados: **158**. Principal = o de etapa mais avançada (ver regra). Combinações: Qualificando x Novo lead 130; Atendimento concluído x Novo lead 19; Encaminhado x Novo lead 7; outras 2.
- **C) Exigem cuidado** — responsável preenchido: **4** (3 com etapas diferentes, 1 igual). Só um lado tem responsável em cada caso, então é preservável automaticamente, mas proponho listagem para conferência.
- **D) Órfãos sem contato:** **0**. Nenhum card tem contato apagado.
- Nenhum card tem atividade registrada (deal_activities = 0), notas, motivo de perda, valor ou tags. Nenhuma informação única se perde além de etapa e responsável.

## 3. Regra determinística para manter um card
Por contato, em ordem:
1. Card com responsável preenchido.
2. Card na etapa mais avançada no funil (posição maior; "Sem resposta" não conta como avanço).
3. Card com updated_at mais recente.
4. Card com created_at mais antigo; empate final pelo menor id.
Antes de remover o outro: se ele tiver responsável/notas/tags que o mantido não tem, copiar para o mantido (hoje: nenhum caso além dos 4 do grupo C, já cobertos pela regra 1).

## 4. Os 12 "cards sem conversa"
São **6 contatos** (2 cards cada), todos criados em 25/06: Flávio, Denis Carvalho, Vitor Camacho, jm, Luísa Kikuchi, Octávio Onofre. Contatos existem, sem responsável, sem histórico; estão em Qualificando/Link do site/Novo lead — ou seja, houve conversa que foi apagada depois (etapas só avançam com conversa). Resíduo do início do projeto (provável teste/importação). **Tratamento proposto:** deduplicar como os demais (ficam 6) e deixar no quadro; não apagar sem sua decisão.

## 5–7. Estado real de cada etapa
| Etapa | Cards | Quem move hoje | Situação |
|---|---|---|---|
| Novo lead | 854 | Gatilho ao criar contato | Funciona (duplicado) |
| Qualificando necessidade | 143 | IA (analyze-conversation) | Ativa, último movimento 18/09, não confiável (1 card do par, pode regredir) |
| Indicação enviada | 1 | IA | Praticamente nunca acontece |
| Link do site enviado | 6 | IA | Raro, último 08/09 |
| Encaminhado para humano | 22 | Handoff (_shared/handoff.ts) — move os dois cards do contato | **Funciona**, último 21/09. Mas a IA pode depois devolver um card para "Novo lead" (5 casos) |
| Atendimento concluído | 22 | **Só a IA** — "Finalizar atendimento" não move o card | Movido hoje 09:56 pela IA; não reflete finalização real |
| Sem resposta | 0 | Nada (não é gerenciada por IA, não existe cron) | Sem uso |

**Funcionam de forma confiável:** criação (Novo lead) e Encaminhado para humano.
**Obsoletas/não confiáveis:** todas as movidas pela IA (Qualificando, Indicação, Link, Atendimento concluído).
449 cards sem movimento há mais de 30 dias; 233 mexidos nos últimos 7 dias.

## 6/10. Proposta de automação futura (só eventos reais)
- Contato criado → Novo lead (gatilho único).
- Handoff criado → Encaminhado para humano (já existe).
- Evento `attendance_finished` → Atendimento concluído (novo, a partir do Finalizar atendimento).
- Reabertura pela cliente (`reopened_by_message`) → volta para Encaminhado ou Qualificando (decisão sua).
- Qualificando / Indicação / Link do site: **não há evento confiável hoje**. Detectar link do site seria possível procurando o domínio da loja nas mensagens da Nina, mas é heurística; proposta: tornar essas etapas **manuais** e desligar o movimento de etapa pela IA (a IA continua atualizando só a memória do cliente).
- Nunca mover para trás automaticamente.

## 11. Regra proposta para "Sem resposta" (não implementar agora)
Definição sugerida: última mensagem da conversa é da Nina, a cliente não respondeu há mais de 72h, conversa sem atendimento humano ativo e card em Novo lead/Qualificando/Indicação/Link. Equipe sem responder ao cliente **não** entra aqui (isso já aparece na Fila de atenção do Dashboard). Precisaria de cron diário. Risco: mover cliente que respondeu por outro canal; mitigação: voltar automaticamente se a cliente escrever. Alternativa: manter a etapa só manual.

## 12. Responsável dos cards
Só 8 cards têm responsável, contra 24 atendimentos humanos ativos.
- Seletor "Responsável" do admin e atribuição/limpeza da Leticia atualizam o dono dos dois cards. ✔
- Handoffs automáticos (Leticia, Carla, Paula Rodrigues, dermoconsultoras) **não** atualizam o dono do card. ✘
- Finalizar atendimento e Reativar Nina **não** limpam o dono. ✘
- Reabertura não mexe no dono.
Proposta: o handoff automático preenche o dono; finalização/reativação limpa.

## 13. Proteção contra novas duplicatas
- Remover o gatilho `auto_create_deal_on_contact_trigger`.
- Índice único parcial: 1 card **ativo** por contato (`contact_id` onde não ganho/perdido) — garante no banco, inclusive em concorrência.
- Função mantida passa a usar `INSERT ... ON CONFLICT DO NOTHING`.
- analyze-conversation e handoff passam a tratar "o card do contato" como único.
Ordem obrigatória: deduplicar **antes** de criar o índice (senão a criação falha).

## 14. Plano de deduplicação
- Mantidos: **524** (1 por contato). Removidos: **524**. Revisão especial: **4** (grupo C, listados antes de executar).
- Passos (uma única migração, numa transação): 1) gravar cópia de segurança dos 1.048 cards numa tabela de backup; 2) copiar responsável para o card mantido quando só o outro tiver; 3) apagar os duplicados; 4) remover o gatilho extra; 5) criar índice único parcial; 6) ajustar a função para ON CONFLICT.
- Conferência depois: 524 contatos = 524 cards, 0 contatos com 2 cards, etapas preservadas pela regra.

## 15–16. Migrações e arquivos
- 1 migração: backup + dedupe + drop trigger + índice único + função idempotente.
- `supabase/functions/analyze-conversation/index.ts` — parar de mover etapa (manter memória).
- `supabase/functions/_shared/handoff.ts` — preencher dono do card no handoff.
- Finalização (`*_finish_conversation`, fluxo do admin) e Reativar Nina — mover para Atendimento concluído / limpar dono (fase 2, se aprovado).
- `src/services/api.ts` (assign*) — já atualiza por contato; sem mudança necessária.
- Opcional fase 2: cron "Sem resposta".

## 17. Testes
- Inserir contato → exatamente 1 card; dois inserts simultâneos do mesmo contato → 1 card.
- Handoff → card em Encaminhado + dono preenchido.
- Resposta da Nina → etapa não muda.
- Contagens pós-migração (acima) e backup com 1.048 linhas.
- Testes existentes (handoff, dashboard) continuam passando.

## 18. Riscos
- Apagar cards é irreversível sem o backup — por isso o backup vem no mesmo passo.
- Desligar a IA de etapas congela Qualificando/Indicação/Link (passam a ser manuais).
- Índice único bloqueia criação manual de 2º card para o mesmo contato no "Novo negócio" — o modal precisa mostrar erro amigável.
- Nada disso toca Dashboard MASTER, chats, handoffs (exceto preencher dono do card), rodízio, Talia weight=8, prioridade da Laura, rastreio, Shopify, WhatsApp, papéis, RLS ou contas.
- Valores/conversão: `value`, `won_at`, `lost_at` só são lidos pelas funções antigas do Dashboard (não mais usadas) e pelo quadro; nenhum fluxo os preenche. Podem continuar existindo sem uso.

Os 6 alertas de segurança continuam pausados.

## Decisões pedidas para aprovar
1. Remover o movimento de etapa pela IA (Qualificando/Indicação/Link viram manuais)?
2. Finalizar atendimento deve mover para "Atendimento concluído"?
3. "Sem resposta": regra de 72h com cron, ou só manual?
4. Os 6 contatos antigos sem conversa: manter no quadro ou remover?
