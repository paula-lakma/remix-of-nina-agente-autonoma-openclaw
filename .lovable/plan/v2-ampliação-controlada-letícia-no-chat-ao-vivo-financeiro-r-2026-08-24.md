# v2 — Ampliação controlada: Letícia no Chat ao Vivo (financeiro + rastreio)

Parada obrigatória: nada será implementado, migrado, testado com dados reais ou publicado sem sua aprovação.

## Estado verificado

- Letícia: `financeiro@lakma.com.br`, papel `expedicao`, com conta de login e membro de equipe ativos vinculados ao mesmo identificador.
- `conversations.assigned_user_id` guarda o **id do membro da equipe**, não o id de login — a tradução login → membro é feita só no servidor.
- RLS v3 atual em `contacts`, `conversations`, `messages`: uma policy por operação exigindo staff operacional (admin/manager/sdr). `expedicao` está bloqueado. Nada disso será removido ou enfraquecido.
- `conversation_handoff_events` hoje é legível por qualquer autenticado — passará a ser restrito.
- Roteamento de handoff atual tem motivos financeiros antigos (`payment`, `invoice`) apontando para o e-mail dela; **não existe** motivo de rastreio/entrega. Os motivos antigos e os eventos históricos **não** concederão acesso.

## 1. Correção central da v2: acesso por concessão explícita, não por responsável

Estar atribuída à Letícia **não basta**. Uma conversa só fica visível para o papel `expedicao` quando existir uma **concessão de encaminhamento ativa** criada pelo novo fluxo.

Nova tabela `conversation_access_grants` (nome final a confirmar na migration):
- conversa, membro de equipe beneficiário, motivo canônico (validado contra allowlist fechada de financeiro/rastreio), origem (NINA ou atribuição manual de admin/manager), mensagem que gerou o encaminhamento, criado em, criado por, status ativo, encerrado em, encerrado por, motivo do encerramento.
- Índice único parcial: no máximo **uma** concessão ativa por conversa.
- Sem INSERT/UPDATE/DELETE diretos pelo navegador para nenhum papel; só funções backend escrevem.
- Nenhum backfill: conversas históricas atribuídas a ela continuam invisíveis, inclusive as com eventos antigos de `payment`/`invoice`. Só um encaminhamento novo, posterior à ativação, concede acesso.
- Atribuição manual por admin/manager exige escolher um motivo autorizado e cria a mesma concessão; mudar apenas o responsável não dá acesso nenhum.

Predicado único de visibilidade (função no banco): papel `expedicao` **e** conversa atribuída ao membro correspondente ao login atual **e** concessão ativa para essa conversa e esse membro **e** motivo dentro da allowlist.

## 2. Revogação imediata

A concessão é encerrada atomicamente, na mesma transação da ação, quando: Letícia finaliza o atendimento; admin/manager reassume; a conversa é reatribuída; o encaminhamento é cancelado; o atendimento deixa de estar ativo. No mesmo instante ela perde leitura da conversa, leitura das mensagens, permissão de resposta e as atualizações em tempo real (o canal de realtime é filtrado pelo mesmo predicado e revalidado no servidor a cada evento).

Nova mensagem do cliente após a finalização: a conversa reabre no fluxo normal da NINA (gatilho já existente, preservado) e **permanece invisível** para a Letícia. Ela só volta a vê-la se ocorrer um novo encaminhamento válido de financeiro ou rastreio.

## 3. Sem gravação direta pelo navegador

- **Nenhuma** policy de INSERT em `messages` para `expedicao`.
- **Nenhuma** policy de UPDATE genérico em `conversations` para `expedicao`.
- Para `expedicao` existirão apenas policies de **leitura**, todas condicionadas ao predicado do item 1 (`conversations`, `messages`, e os eventos de auditoria da própria conversa). `contacts` não recebe policy nova: os dados mínimos do contato (nome e telefone mascarado) vêm de função dedicada.
- Responder, finalizar atendimento, alterar estado operacional permitido e registrar auditoria acontecem **exclusivamente** por funções backend autenticadas e específicas.

Cada função revalida no servidor: sessão autenticada; papel `expedicao`; membro de equipe derivado do login; conversa atribuída a esse membro; concessão ainda ativa; motivo na allowlist. Falha em qualquer item → 403, sem vazar existência da conversa.

Funções SECURITY DEFINER: obtêm o usuário internamente, nunca aceitam identificador de usuário ou de membro vindo do navegador, `search_path` fixo, `EXECUTE` revogado de PUBLIC e `anon`, concedido só a `authenticated`. O navegador nunca recebe chave privilegiada.

Funções de leitura previstas: `list_my_conversations()` (só conversas com concessão ativa; sem busca global, sem memória da NINA, sem dados comerciais) e `get_my_conversation_messages(conversation_id)`.
Funções de escrita previstas: `reply_in_assigned_conversation`, `finish_assigned_conversation`, ambas expostas por edge function autenticada que enfileira pelo caminho de envio já existente.

## 4. Proteção contra injeção do marcador

- O marcador de handoff **nunca** é lido do texto bruto do cliente. Uma mensagem do cliente contendo `[[HANDOFF:payment]]` não encaminha nada: a extração passa a ocorrer só sobre a resposta gerada pelo orquestrador, e a mensagem recebida é tratada como dado inerte.
- O motivo vem exclusivamente de um campo interno produzido pela classificação de intenção, validado contra allowlist fechada; motivo desconhecido é rejeitado e registrado.
- O marcador é removido antes de qualquer texto chegar ao cliente.
- A auditoria grava o motivo canônico realmente aplicado.
- Palavras isoladas ("Pix", "pedido", "rastreio", "boleto", "pagamento") não geram encaminhamento; a regex legada não recebe os novos motivos. Em dúvida, a NINA faz **uma** pergunta curta de confirmação e só encaminha após confirmação.

## 5. Intenções autorizadas

Financeiro: pagamento não identificado, pendente ou recusado, cobrança, cobrança duplicada, boleto, Pix, cartão, comprovante, nota fiscal, estorno/reembolso, dúvida financeira sobre pedido já feito.
Rastreio/expedição: rastreio não recebido, código inválido, dificuldade de acompanhar, rastreio sem atualização, dúvida sobre Correios/Jadlog, pedido enviado sem informação, "onde está meu pedido", problema no link de rastreamento.
Fora da lista (nunca encaminha): produto, protocolo/tratamento, pele/acne/manchas, cupom e promoção, intenção de compra, dúvida comercial, distribuidor/influenciador, agendamento, agradecimento, "ok"/reações, e qualquer assunto sem relação clara.

## 6. Atomicidade e ausência de conflito

Uma única função transacional faz: pausa da NINA, atribuição ao membro dela, status humano, criação da concessão ativa e evento de auditoria — com bloqueio de linha na conversa e recusa se já houver atendimento humano ativo ou concessão ativa de outra pessoa. A resposta da Letícia só é aceita se, no momento do envio, a concessão continuar ativa e dela.

## 7. Admin e manager

Continuam vendo, assumindo, reatribuindo e finalizando qualquer conversa, exatamente como hoje. Reassumir encerra a concessão da Letícia e grava auditoria. Nenhuma policy existente de admin/manager/sdr é alterada.

## 8. Auditoria

`conversation_handoff_events` (imutável) mais os campos da própria concessão registram: motivo canônico, intenção detectada, data/hora, responsável, origem do encaminhamento, mensagem que o gerou, e cada encerramento com motivo e autor.

## 9. Frontend

`useUserRole`: `expedicao` ganha a área `chat` **apenas na Fase B**; home continua `/tracking`. Menu dela: Chat ao Vivo, Envio de rastreio, Sair. `ChatInterface`/`useConversations` usam as funções restritas quando o papel for `expedicao`, sem excluir conversa, sem trocar responsável, sem exportar, sem memória da NINA nem dados comerciais. Ocultação no frontend é conveniência; a garantia está no banco e no backend.

## 10. Testes obrigatórios (somente conversa e contato sintéticos; nenhum WhatsApp real sem nova autorização)

Visibilidade: conversa histórica atribuída a ela permanece invisível; conversa de assunto não autorizado atribuída manualmente permanece invisível; somente um novo handoff válido de financeiro ou rastreio torna visível.
Revogação: conversa finalizada desaparece imediatamente; conversa reassumida ou reatribuída desaparece imediatamente; nova mensagem após finalização volta à NINA e permanece invisível; novo handoff válido posterior torna visível de novo.
Roteamento: financeiro encaminha; rastreio encaminha; produto/protocolo/cupom não encaminha; ambíguo gera pergunta de confirmação; palavra isolada não encaminha; texto do cliente com marcador falso não encaminha.
Backend/segurança: INSERT direto em `messages` com o token dela é bloqueado; UPDATE direto em `conversations` com o token dela é bloqueado; resposta pelo backend dedicado funciona só na conversa autorizada; acesso a outra conversa por URL ou API retorna vazio ou 403; NINA pausa após o encaminhamento e não responde mais; ela continua sem acesso a contatos, pipeline, agendamentos, campanhas, templates, equipe, cérebro e configurações.
Regressão: admin, manager e sdr operam como hoje; Shopify, rastreio automático, envio manual, templates, filas e trava compartilhada intactos (contagens antes/depois).

## 11. Fases

**Fase A** (esta aprovação): criar tabela de concessões, funções, policies restritas de leitura, backend autenticado e auditoria; roteamento novo **desativado** por flag; menu da Letícia **sem** Chat ao Vivo; **sem publicar**; testes só com dados sintéticos; relatório e **parada obrigatória**.

**Fase B** (nova aprovação): ativar os motivos de encaminhamento, liberar Chat ao Vivo para ela, publicar, validar uma transferência controlada e reconfirmar Shopify, rastreio automático, envio manual, templates, filas, Chat ao Vivo atual e RLS v3.

## 12. Rollback imediato

1. Desligar a flag do roteamento novo — nenhuma concessão nova é criada.
2. Encerrar as concessões ativas (uma instrução) — acesso da Letícia cai na hora.
3. Remover a área `chat` do papel `expedicao` no frontend.
4. Migration de reversão removendo apenas os objetos novos; as policies v3 não são tocadas, então o estado volta exatamente ao de hoje. Envio manual e fluxo Shopify não dependem de nada disso.
