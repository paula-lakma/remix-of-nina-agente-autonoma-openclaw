# CRM da Lakma — auditoria e arquitetura (somente leitura, nada implementado)

## 1. Tela Contatos hoje
- Lê só a tabela `contacts`: 100 contatos mais recentes por última atividade, busca feita no navegador (nome/telefone/e-mail) só dentro desses 100. Hoje existem 580 contatos: 480 ficam invisíveis na busca.
- Mostra nome, telefone, e-mail, "Lead Qualificado" fixo para todos (valor inventado no código), última interação. "Novo contato", "Filtros avançados" e "Mais opções" estão desativados. Único recurso real: importar CSV e botão "Iniciar conversa" (abre o Chat).
- Acesso (banco): admin, manager e sdr veem/editam todos; dermo vê só contatos das conversas que ela pode atender; Leticia, Carla e rastreio não leem `contacts` direto (usam as funções dos chats restritos). No menu, a tela Contatos aparece para admin, manager, sdr.

## 2. Uso real dos campos de `contacts` (580 contatos)
| Campo | Preenchidos | Leitura |
|---|---|---|
| name / phone_number | 579 / 580 | usar |
| call_name | 203 | usar (apelido) |
| client_memory (memória da Nina) | 224 | usar como resumo da IA |
| last_activity, first_contact_date, created_at | todos | usar |
| email | 0 | existe, vazio |
| city, company | 0 | existem, vazios |
| tags | 1 | quase sem uso; 8 tags cadastradas |
| notes | 0 | campo único de texto, sem autor/data |
| custom_fields | 0 | sem uso |
| score, status_lead | todos 0 / "new" | sem uso real |
| whatsapp_valid, profile_picture_url, is_blocked | 0 | sem uso |
- Tabelas relacionadas sem uso: `contact_lists`/membros (0), `appointments` (0), `deal_activities` (0).
- Relações: 1 contato = 1 conversa hoje (nenhum contato com mais de uma); 1 contato = no máximo 1 card ativo (regra do banco).
- Memória da Nina (`client_memory`): interesses, produtos discutidos, objeções, estilo, dores, próxima ação sugerida, histórico resumido. É texto gerado pela IA — não é confirmado.

## 3. O que já dá para mostrar sem gravar nada novo
- Responsável atual, situação Nina/humano, atendimento humano ativo, data da última mensagem, motivo do último encaminhamento: vêm de `conversations` (mesma regra do Dashboard: `isActiveHumanAttendance`).
- Etapa do Pipeline: `deals` pelo contact_id (card ativo).
- Interesses e resumo comercial "sugeridos pela IA": `client_memory`, sempre marcados como "sugestão da Nina".
- Histórico com data confiável: contato criado, encaminhamentos por tipo, finalização, reativação da Nina, reabertura por mensagem, "assumido", respostas da equipe (`conversation_handoff_events`).

## 4. O que falta (não é registrado hoje)
- Instagram, nascimento, tipo de contato, origem do lead: não existem. A origem não é gravada em nenhum lugar — não dá para descobrir para contatos antigos; ficará "não informado".
- Troca manual de responsável fora do encaminhamento e mudança manual de etapa do card: sem registro de quem/quando (caso da Duda).
- Notas com autor, follow-ups, interesses confirmados: não existem.

## 5. Arquitetura da ficha 360º
Princípio: o CRM só **lê** Chat/Nina/Pipeline e **grava apenas nas suas tabelas novas**. Nenhum gatilho do CRM em mensagens, conversas ou encaminhamentos. Se o CRM cair, o Chat nem percebe.

Abas:
- **Resumo**: dados do contato + tipo + tags + responsável/situação (de conversations) + etapa (deals) + próximo follow-up + interesses confirmados + "sugestões da Nina" separadas.
- **Conversas**: visualização somente leitura das últimas mensagens reaproveitando a leitura já existente, + botão "Abrir no Chat Ao Vivo". Nada de responder por aqui. (Opção de menor risco: só o botão; recomendo leitura + botão.)
- **Comercial**: card atual (etapa, link para o Pipeline), interesses, follow-ups.
- **Histórico**: linha do tempo montada na hora juntando contato criado + eventos de encaminhamento + notas + follow-ups. Sem tabela gigante.
- **Notas**: notas internas com autor e data.

## 6. Modelos novos (V1)
- `crm_notes`: id, contact_id, content, author_user_id, created_at, updated_at, deleted_at. Nunca vira mensagem.
- `crm_followups`: id, contact_id, assigned_user_id, due_at, has_time, reason, notes, status (aberto/concluído/cancelado), created_by, created_at, completed_at, completed_by. Não pausa Nina, não cria encaminhamento, não envia nada.
- Tipo de contato: coluna `contact_type` em `contacts` (profissional_estetica, cliente_final, distribuidor, influenciador, outro, nulo), definida só por pessoa.
- Interesses confirmados: `crm_contact_interests` (contact_id, interest_key, created_by, created_at), com lista fixa (manchas, acne, peeling, rejuvenescimento, limpeza de pele, corporal...). A IA pode sugerir, mas só entra ao clicar "confirmar".
- Instagram, nascimento: colunas simples em `contacts` (V2). Cidade/e-mail já existem.

## 7. Permissões propostas (sem mudar nada agora)
- Admin/manager: tudo. SDR (Paula Rodrigues): tudo, como hoje em Contatos.
- Dermo, Leticia, Carla: sem a tela CRM na V1; continuam só nos chats restritos. Numa fase futura poderiam ver notas só dos contatos com acesso ativo, reaproveitando as regras "pode acessar conversa" existentes.
- Rastreio: nenhum acesso.
- Tabelas novas: RLS com `is_operational_staff` (admin/manager/sdr), igual a contacts.

## 8. Performance
- Lista: paginação no servidor (50 por página), busca por nome/telefone no servidor, filtros por tipo, responsável, etapa, próxima ação. Uma consulta de contatos + consultas em lote por página (conversas, cards, próximo follow-up) — nada por linha.
- Ficha: carrega os detalhes só ao abrir.
- Índices novos: nas tabelas novas (contact_id; follow-ups por responsável+vencimento+status). Os de contacts/conversations já existem.

## 9. Fases
- **V1** (média): lista paginada com filtros; ficha com 5 abas; tipo de contato; interesses confirmados; notas; follow-ups; bloco "Retornos" (vencidos, hoje, 7 dias, concluídos). Sem notificações.
- **V2** (média): Instagram/nascimento/origem capturada daqui em diante (manual e por entrada, ex.: campanha/importação); produtos e protocolos indicados ligados ao Cérebro; registro de troca manual de responsável e de etapa; acesso restrito de dermo/Carla/Leticia às notas.
- **V3** (alta): Shopify, pedidos, compras, faturamento/conversão real; automações de follow-up.

## Detalhes técnicos
- Migrations V1: criar `crm_notes`, `crm_followups`, `crm_contact_interests` (com GRANT, RLS, índices); adicionar `contacts.contact_type`. Nenhuma alteração em conversations, messages, deals, gatilhos ou funções existentes.
- Frontend: `Contacts.tsx` (lista nova), novo `ContactProfile` com abas, `src/services/crm.ts`; `api.fetchContacts` substituída por versão paginada. Reaproveita `isActiveHumanAttendance` do Dashboard.
- Backend: nenhuma função nova necessária na V1 (leituras com as regras atuais de admin/sdr).
- Riscos: confundir sugestão da IA com dado confirmado (mitigado pela separação visual e confirmação manual); contatos antigos sem origem; SDR ver notas de todos (igual hoje em contatos).
- Preservado: Chat, Nina, encaminhamentos, rodízio, Talia, Laura, Leticia, Carla, Paula Rodrigues, Pipeline corrigido, rastreio, Shopify, papéis, RLS, contas. 6 alertas de segurança seguem pausados.

---

# Fechamento técnico do CRM V1 (aguardando aprovação)

## A. Identificador de usuário — conta de login (auth user id) em todos os campos
- Conferido: a admin Paula Simionato **não tem cadastro de equipe**; as 8 pessoas da equipe têm cadastro ligado a uma conta de login. Usar o cadastro de equipe deixaria a admin sem poder ser autora/responsável. Por isso todos os campos usam o id da conta de login.
- Diferença assumida: o responsável da **conversa** usa o cadastro de equipe; o responsável do **follow-up** usa a conta de login. A tela converte pelo vínculo cadastro de equipe → conta (existe para os 8).
- Nomes exibidos vêm de `profiles.full_name` (com e-mail como alternativa).
- FKs: `author_user_id`, `assigned_user_id`, `created_by`, `completed_by` → `profiles(user_id)` ON DELETE RESTRICT (a unicidade de `profiles.user_id` é conferida antes da migration; se não houver, usamos um índice único). `contact_id` → `contacts(id)` ON DELETE CASCADE.

## B. Acesso — somente admin, manager, sdr
- Conferido: `is_operational_staff` = exatamente admin, manager, sdr (sem dermo, expedicao, parcerias, rastreio). Será usada; `is_admin_or_manager` = admin, manager.
- Policies (só usuários logados, nada para visitantes):

| Tabela | Ver | Criar | Editar | Apagar |
|---|---|---|---|---|
| crm_notes | staff, sem deleted_at | staff, autor = eu | autor ou admin/manager | sem DELETE físico; "apagar" = preencher deleted_at (autor ou admin/manager) |
| crm_followups | staff | staff, created_by = eu | staff (concluir/cancelar/reagendar) | sem DELETE; usa status cancelado |
| crm_contact_interests | staff | staff, created_by = eu | nenhuma | staff (desmarcar interesse = apagar a linha) |
- Carla, Leticia, dermoconsultoras e rastreio: sem acesso. Nenhuma policy de conversas/mensagens/chat muda.

## C. Tabelas, regras e índices
- `crm_notes`: id, contact_id, content (não vazio, até 5.000 caracteres), author_user_id, created_at, updated_at, deleted_at, deleted_by.
- `crm_followups`: id, contact_id, assigned_user_id, due_at, has_time, reason (não vazio), notes, status (`open`/`done`/`canceled`), created_by, created_at, updated_at, completed_at, completed_by, canceled_at.
- `crm_contact_interests`: id, contact_id, interest_key, created_by, created_at; **UNIQUE(contact_id, interest_key)**. Lista fixa simples via CHECK: manchas, acne, peeling, rejuvenescimento, limpeza_de_pele, corporal, outro. Nomes bonitos só no código. Sem catálogo.
- **Tipo de contato em tabela própria** `crm_contact_profiles`: contact_id (chave, FK contacts ON DELETE CASCADE), contact_type (CHECK: profissional_estetica, cliente_final, distribuidor, influenciador, outro), updated_by → profiles(user_id), created_at, updated_at. Mesmas policies do CRM (admin/manager/sdr). `contacts` não ganha coluna nova.
- Índices: notas (contact_id, created_at); follow-ups (contact_id), (assigned_user_id, status, due_at), (status, due_at); interesses (pela UNIQUE). Busca em contatos: habilitar `pg_trgm` (hoje **não** habilitada, mas disponível) no schema `extensions` e criar índices trigram em nome, apelido e e-mail; telefone já tem índice. Impacto: só adiciona funções de busca e índices; nenhuma tabela, dado ou fluxo muda; criação instantânea em 580 contatos.
- Único gatilho: atualizar updated_at dentro das próprias tabelas.

## D. Comportamento
- **Notas:** só internas; nunca viram mensagem, nunca vão ao WhatsApp, nunca aparecem no Chat. Autor obrigatório gravado pelo banco.
- **Follow-ups:** criar, concluir, cancelar e reagendar só mudam o próprio follow-up. Sem gatilho que toque conversas, mensagens, Nina pausada, responsável da conversa, encaminhamentos, acessos, cards, Pipeline, WhatsApp. Nenhuma mensagem automática.
- **Interesses:** só entram por clique humano. A Nina/memória **não grava** no CRM (nenhuma função da Nina ganha acesso a essas tabelas). Na tela: "Interesses confirmados" separado de "Sugestões da Nina" (lido de client_memory, com botão "confirmar").
- **Novo contato:** continua desativado na V1.
- **Lista:** busca e filtros no servidor sobre todos os contatos, 50 por página, nome/apelido/telefone/e-mail; filtros tipo, responsável, etapa, próxima ação. "Lead Qualificado" sai sem substituto.
- **Conversas na ficha:** histórico só leitura das mensagens existentes + "Abrir no Chat Ao Vivo". Sem envio.
- **Linha do tempo:** contato criado + eventos de encaminhamento + notas + follow-ups. Troca manual de responsável e de etapa não aparecem (V2), sem invenção.

## E. Arquivos, migration e testes
- 1 migration: extensão pg_trgm + 4 tabelas (notas, follow-ups, interesses, perfil do contato) + GRANT (authenticated e service_role, sem visitantes) + RLS + policies + índices. Em `contacts`: só índices de busca; policies dela intactas.
- Frontend: `Contacts.tsx` (lista), novo `src/components/crm/ContactProfile.tsx` com abas (Resumo, Conversas, Comercial, Histórico, Notas), `src/services/crm.ts`, `src/lib/crmInterests.ts`. Chat, Pipeline, Nina e funções do backend não mudam.
- Testes: rótulos de interesses e tipos; montagem da linha do tempo; filtros/paginação; no banco, conferir que dermo/parcerias/expedicao/rastreio não leem nada, sdr lê, UNIQUE barra interesse repetido, nota não sai do contato; suíte completa.

## F. Chat/Nina fora do caminho
Nenhum gatilho, função ou dependência do CRM em mensagens, conversas, encaminhamentos, fila da Nina ou WhatsApp. Se as tabelas do CRM falharem, só a ficha mostra erro. Pipeline, papéis, contas e os 6 alertas pausados seguem intocados.

## G. Validação final
- **contact_type em contacts exporia o dado: SIM.** As regras de `contacts` liberam a linha inteira; a dermo que já lê um contato leria também o tipo. Solução: tabela própria `crm_contact_profiles`, só admin/manager/sdr. Policies de `contacts` não mudam.
- **pg_trgm:** não habilitada hoje; habilitada na mesma migration (baixo impacto).
- Confirmados: `crm_notes.deleted_by` e todos os campos de usuário → `profiles(user_id)` (já único no banco); CHECKs dos follow-ups (done exige completed_at/by; canceled exige canceled_at; open sem ambos); UNIQUE(contact_id, interest_key); client_memory nunca grava no CRM; Chat/Nina/Pipeline independentes do CRM; Novo contato desativado; conversas na ficha só leitura; 6 alertas pausados.
