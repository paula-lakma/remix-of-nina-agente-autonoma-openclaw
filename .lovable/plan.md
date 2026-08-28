# Área de atendimento das dermoconsultoras — auditoria e plano

Auditoria READ-ONLY executada agora. Nada foi criado, alterado ou publicado.

## 1. Contas das cinco profissionais (estado real hoje)

| Profissional | E-mail | Conta auth | team_member | Papel | Status | Conversas | Chat ao Vivo |
|---|---|---|---|---|---|---|---|
| Mylena | mylenalakma@outlook.com | não existe | não existe | — | — | 0 | não |
| Cris | atendimento3@lakma.com.br | sim (`44c46675…`) | sim (`22222222-…-0003`) | `sdr` | active | 1 | sim (vê tudo) |
| Talia | galvaotalia19@gmail.com | não existe | não existe | — | — | 0 | não |
| Barbara | barbara@lakma.com.br | não existe | não existe | — | — | 0 | não |
| Laura | lakma.vendas5@gmail.com | não existe | não existe | — | — | 0 | não |

Cris é a única já cadastrada: `team_members.user_id` vinculado corretamente ao auth user, função "Dermoconsultora / Atendimento técnico", papel `sdr`.

Outras contas existentes no sistema (não mexer): Paula Rodrigues (comercial), Carla (parcerias), Leticia (financeiro, papel `expedicao`), paula@lakma.com.br (admin), joaofelipemolero@outlook.com (`sdr` sem team_member).

### Inconsistências encontradas (não corrigidas nesta etapa)
- `joaofelipemolero@outlook.com` tem papel `sdr` e nenhum team_member — hoje enxerga todas as conversas.
- Cris tem papel `sdr`, o que já lhe dá leitura de **todas** as conversas, não só das dela.
- Duas conversas com `handoff_type = dermoconsultant` estão sem `assigned_user_id` (`632eeef4…` de 28/07 e `930e2040…` de 26/06) — ficaram órfãs porque na época não havia dermoconsultora elegível.
- Nenhuma conversa financeira está misturada com dermoconsultora: as 7 da Leticia são todas `handoff_type = financeiro`.

## 2. Arquitetura atual encontrada

- **Classificador único** em `supabase/functions/_shared/handoff.ts`: `REASON_MATRIX` mapeia motivos → destino (`comercial`, `parcerias`, `financeiro`, `dermoconsultant`). Os 13 motivos sensíveis (gestante, lactante, alergia, reação, pele sensibilizada, contraindicação, medicamento, procedimento recente, adaptação de protocolo, dúvida técnica, etc.) já apontam para `dermoconsultant`. Não é preciso criar classificador novo.
- **Decisão estruturada** via `resolveHandoffDecision` + `applyResolvedHandoff`, consumidos por `nina-orchestrator`, `nina-reply` e `reap-orphan-runs`. O texto da Nina não é fonte da verdade.
- **Financeiro/expedição** desvia para a RPC `apply_expedicao_handoff` (Leticia), caminho separado e já validado.
- **Dermoconsultora** passa por `applyHandoff`, que resolve o responsável com a função `pick_next_dermoconsultora()` (menor carga em 30 dias, desempate `random()`), pausa a Nina, marca `human_takeover_required`, grava `assigned_user_id`, `human_status` e um evento `handoff_dermoconsultant`. **Não cria concessão de acesso.**
- **Visibilidade**: RLS atual dá a `admin`/`manager`/`sdr` (`is_operational_staff`) leitura total de `conversations`, `messages`, `contacts`. Só `expedicao` é restrito, via `expedicao_can_access_conversation` + `conversation_access_grants`.
- **Interface**: `ChatRouteSwitch` escolhe `ExpedicaoChat` (papel `expedicao`) ou `ChatInterface` (demais). `ExpedicaoChat` já implementa motivo do encaminhamento, corte de histórico e mídia assinada.

## 3. O que o plano propõe

### 3.1 Contas e papéis
Mylena, Talia, Barbara e Laura:
- Verificação imediatamente antes da execução: só cria `auth.user` se o e-mail realmente não existir naquele momento (nada de conta duplicada caso surja entre a auditoria e a implementação).
- Cria ou vincula o respectivo `team_member` (função dermoconsultora), com `user_id` apontando para o auth user e `status = active`.
- Atribui o novo papel `dermo` em `user_roles`.
- Nenhuma senha é inventada, escrita ou guardada em código, migration, banco ou frontend. O primeiro acesso usa o mecanismo seguro já existente na autenticação do projeto: convite/recuperação por e-mail, com a própria tela `/auth` → "esqueci minha senha" e a página `/reset-password` já implementadas. Cada profissional define a própria senha.

Cris:
- Nenhuma conta nova. Reutiliza exatamente o auth user `44c46675…` e o team_member `22222222-…-0003`.
- Altera somente o papel `sdr` → `dermo`, após conferir que nada específico depende do papel `sdr` dela (verificação prévia em RLS, RPCs, edge functions e frontend; hoje `sdr` aparece apenas em `is_operational_staff` e no mapa de permissões da UI).

Laura é marcada como sênior por função própria ("Dermoconsultora Sênior"), mas **participa normalmente do rodízio/balanceamento** junto com as demais.


### 3.2 Distribuição — recomendação
**Menor quantidade de atendimentos ativos**, com desempate determinístico (mais antigo `assigned_at`, depois `id`), substituindo o `random()` atual. Motivo: já é a base do `pick_next_dermoconsultora`, é auto-corretivo quando alguém finaliza atendimentos e não exige tabela de ponteiro como o round-robin. O balanceamento inclui as cinco: Mylena, Cris, Talia, Barbara **e Laura**.

### 3.3 Laura nos casos sensíveis
Sem classificador novo. Uma lista de motivos sensíveis (subconjunto já existente da `REASON_MATRIX`: gestante, lactante, alergia, reação, pele sensibilizada, contraindicação, medicamento dermatológico, procedimento recente, intercorrência) roteia **diretamente para Laura, com prioridade exclusiva e fora do balanceamento normal**. Os demais motivos de dermoconsultora entram no balanceamento das cinco. Se Laura estiver inativa ou indisponível, aplica fallback seguro para o balanceamento normal entre as demais dermoconsultoras e registra o fallback em log (`conversation_handoff_events` com metadados do fallback).

### 3.4 Visibilidade real (não só frontend)
Espelhar exatamente o modelo já provado da Leticia: concessão de acesso na `conversation_access_grants` no momento do handoff, função `dermo_can_access_conversation(id)`, policies de SELECT em `conversations`/`messages`/`contacts` para o papel `dermo`, e RPCs `list_my_dermo_conversations` / `get_my_dermo_messages` / `dermo_reply` / `dermo_finish_conversation`. Admin e manager mantêm a visão atual.

### 3.5 Interface
Sem componente novo grande: extrair de `ExpedicaoChat.tsx` um componente compartilhado parametrizado (rótulos + nomes das RPCs), usado pela Leticia e pelas dermoconsultoras. `ChatRouteSwitch` passa a reconhecer também o papel `dermo`. Mídia reaproveita `chat-media` + `useSignedMediaUrls`.

## 4. Arquivos, funções e tabelas afetados

Alterados: `_shared/handoff.ts` (resolução de assignee + concessão dermo), `nina-orchestrator`, `nina-reply`, `reap-orphan-runs` (redeploy pelo shared), `ExpedicaoChat.tsx` → componente compartilhado, `ChatRouteSwitch.tsx`, `useUserRole.ts`, `Sidebar.tsx`. Banco: enum `app_role`, `pick_next_dermoconsultora`, novas funções/RPCs e policies de SELECT, novas linhas em `team_members`/`user_roles`.

Não alterados: `apply_expedicao_handoff`, `is_expedicao_handoff_reason`, classificação financeira, `send-manual-tracking`, `shopify-webhook`, `whatsapp-sender`, `send_queue`, templates, `chat-media`, gatilhos de reabertura e finalização, backfill financeiro.

## 5. Conversas antigas
Nenhuma alteração automática. As duas conversas dermo órfãs e a da Cris ficam como estão; depois da implantação decidimos se vale um backfill igual ao financeiro.

## 6. Testes previstos (sem mensagem real ao cliente)
A) caso normal → uma das quatro · B) segundo caso normal → outra profissional (balanceamento) · C) caso sensível → Laura · D) pedido atrasado → Leticia · E) rastreio → Leticia · F) dúvida de produto → Nina segue · G) handoff dermo → Nina pausada e `human_takeover_required` · H) dermo A tentando ler conversa da dermo B → negado no banco · I) admin vê tudo · J) finalizar atendimento e reabertura pelo cliente · K) imagem/áudio/documento visíveis.

Testes adicionais de conta e visibilidade:
- Cris deixa de enxergar todas as conversas e passa a ver somente as atribuídas a ela.
- Cada uma das cinco autentica normalmente após definir a própria senha.
- Mylena não acessa conversa da Cris.
- Cris não acessa conversa da Talia.
- Barbara não acessa conversa da Laura.
- Laura não acessa conversas normais de outras dermoconsultoras, salvo as atribuídas a ela.
- Admin e manager continuam enxergando tudo.
- Leticia continua enxergando exclusivamente o fluxo financeiro/expedição atual.

Testes sintéticos em conversas de laboratório, mais a suíte local (88 testes atuais) ampliada.

## 7. Riscos
- Trocar o papel da Cris de `sdr` para `dermo` reduz o que ela enxerga — é o efeito desejado, mas muda a experiência dela.
- Handoff dermo sem dermoconsultora elegível deixaria a conversa órfã: prevemos fallback explícito e log.
- Criar contas exige senha inicial / convite por e-mail — definir na aprovação.

## 8. Confirmação
O fluxo da Leticia permanece integralmente intacto: RPC própria, motivos financeiros/rastreio inalterados, concessões, página, mídia, Shopify → WhatsApp e envio manual de rastreio não são tocados. Casos financeiros nunca entram no balanceamento das dermoconsultoras.
