# Modelo de retomada pela aba Templates: auditoria e plano

Data: 05/10/2026, 13:40 (São Paulo). Somente leitura; nada foi alterado.

## 1. Como a aba Templates funciona hoje
- Tela: menu "Templates" (`src/pages/Templates.tsx`), visível só para admin e manager. Dados via `src/hooks/useMetaTemplates.ts`.
- Tabela: `meta_templates` (name, category, language, components, samples, labels, meta_template_id, status, validation_score, datas). A lista se atualiza sozinha quando a tabela muda.
- Funções:
  - `submit-template`: **envia de fato à Meta** (POST `/{waba}/message_templates`, Graph v21) usando as credenciais da Nina, e grava a linha local com o status que a Meta devolver (normalmente PENDING).
  - `sync-template-status`: lista todos os modelos da conta na Meta (paginado), atualiza status/categoria/componentes locais e insere os que só existem lá.
  - `whatsapp-sender`: já envia mensagens `template` (nome, idioma, variáveis do corpo), usado hoje no rastreio.
- Botão "Novo template": nome (a-z, 0-9, _), categoria (Marketing/Utilidade/Autenticação), idioma (texto livre, padrão pt_BR), corpo, rodapé e exemplos das variáveis separados por vírgula. O exemplo vira `example.body_text` exigido pela Meta.
- Botão "Sincronizar": puxa o status atual da Meta.

**Conclusão: a aba já cria, submete à Meta e acompanha aprovação.** O fluxo Novo template → Enviar → PENDING → Sincronizar → APPROVED/REJECTED já existe.

## 2. Status
- Gravado como a Meta devolve (texto livre). A tela só tem visual para APPROVED, PENDING e REJECTED; PAUSED, DISABLED, IN_APPEAL etc. aparecem em cinza, sem tradução.
- Não existe atualização automática: só ao clicar em Sincronizar.
- Motivo da rejeição: **não é buscado nem guardado** (a sincronização não pede `rejected_reason`).

## 3. Situação atual
- 19 modelos sincronizados, todos APPROVED: 4 de utilidade (pedido/rastreio) e 15 de marketing.
- `retomada_atendimento_lakma`: **não existe** localmente. Existe um parecido, `retomada_conversa_nina_lakma` (MARKETING, fala em nome da Nina), que não serve.
- Presença na Meta não confirmada ao vivo; a última sincronização não trouxe esse nome.

## 4. Compatibilidade do texto
"Olá, {{1}}! Aqui é a equipe da Lakma Dermocosméticos. Estamos retornando o seu atendimento. Quando puder, responda esta mensagem para continuarmos por aqui."
- Corpo com {{1}}, exemplo "Maria", categoria UTILITY, idioma pt_BR: tudo suportado pela tela atual.
- Categoria final é da Meta; ela pode reclassificar para MARKETING. Nesse caso o modelo ainda funciona, mas é cobrado como marketing e pode não chegar a quem recusou marketing.

## 5. Problemas encontrados na aba (antes de usar)
1. **Duplicação silenciosa**: se a Meta disser que o nome já existe, `submit-template` reenvia com um nome novo (`retomada_atendimento_lakma_vXXXX`). Isso contraria a regra de não duplicar e quebraria o botão futuro, que procura o nome exato.
2. **Sem checagem de permissão**: `submit-template` e `sync-template-status` não conferem quem chama (usam a chave interna). Qualquer pessoa logada, ou com a chave pública, poderia submeter modelos.
3. Sem checagem prévia local de nome+idioma.
4. Excluir só apaga a linha local; na próxima sincronização ela volta.
5. Motivo de rejeição não aparece.

## 6. Nome do cliente ({{1}})
- Fonte: `contacts.call_name` (primeiro nome que o WhatsApp informa), senão primeiro nome de `contacts.name`.
- Nas 36 conversas com acesso ativo hoje: todas têm nome; 15 sem `call_name`; nenhuma parece telefone.
- Regra proposta: usar o primeiro nome só se tiver letras, 2 a 30 caracteres, sem dígitos nem emoji. Se não houver nome válido, **não envia e não inventa**: o botão mostra "Sem nome válido para o modelo". Decisão sua abaixo sobre alternativa sem variável.

## 7. Plano de Build (cada etapa com aprovação)
**Etapa 1. Ajustar a aba (sem enviar nada)**
- `submit-template`: exigir admin/manager; recusar se já existir nome+idioma local; remover a renomeação automática e devolver "já existe na Meta, sincronize" em vez disso.
- `sync-template-status`: exigir admin/manager; pedir também `rejected_reason` e guardar em `labels.rejected_reason` (sem coluna nova).
- Tela: rótulos em português ("Em análise pela Meta", "Aprovado", "Rejeitado: motivo", "Pausado", "Desativado"); aviso se a categoria aprovada for diferente da pedida.
- Testes: duplicado recusado, sem renomeação, sem permissão bloqueado, mapeamento de status.

**Etapa 2. Submeter o modelo pela aba (você ou eu, com sua confirmação)**
- Sincronizar primeiro; se `retomada_atendimento_lakma` já existir, não criar.
- Novo template: nome `retomada_atendimento_lakma`, UTILITY, pt_BR, corpo acima, exemplo "Maria". Status passa a PENDING ("Em análise").
- Sincronizar até APPROVED ou REJECTED. Enquanto não for APPROVED, ele não é usável.

**Etapa 3. Botão "Enviar modelo de retomada" (só depois de APPROVED)**
- Aparece só com a janela fechada **e** o modelo APPROVED, nas telas da Letícia, dermo, parcerias e Chat completo. O aviso atual continua.
- Caminho: tela → função da área (`expedicao-chat`/`dermo-chat`/`parcerias-chat`, ação `send_resume_template`; Chat completo por uma função nova só para admin/manager) → função do banco que confere acesso como o `*_reply` atual, grava a mensagem com `metadata.template_name`, idioma e variáveis, e coloca na fila `message_type='template'` → `whatsapp-sender` → Meta → `whatsapp-webhook` (status, motivo de falha e ordem segura já funcionam). A tela nunca chama a Meta.
- O servidor confere de novo, antes de gravar: modelo APPROVED, nome válido e permissão.
- Duplo clique: recusar se já houver modelo de retomada nessa conversa nos últimos 10 min ainda não falho; botão desabilitado durante o envio.
- O modelo **não reabre** a janela: o campo segue bloqueado até o cliente responder. Já é assim, porque só mensagens do cliente contam.
- O modelo não conta como "respondido" na prioridade: o Passo C já ignora mensagens com `template_name`.
- Testes: aparece só fechada+aprovado; PENDING/REJECTED sem botão; sem acesso recusado; nome inválido recusado; duplo clique; janela continua fechada depois; falha registra o motivo.

**Etapa 4. Recuperar conversas pendentes**: separada, manual, nada automático.

## Detalhes técnicos
- Migration: nenhuma nas etapas 1 e 2. Etapa 3: uma, para as funções de banco de envio de modelo (uma por área, ou uma genérica com checagem de acesso por área).
- Arquivos: etapa 1, `submit-template`, `sync-template-status`, `Templates.tsx`, `useMetaTemplates.ts`. Etapa 3, as 3 funções de chat, `ExpedicaoChat.tsx`, `ChatInterface.tsx`, `_shared` (regra do nome), migration.
- Riscos: a Meta pode reclassificar para MARKETING ou rejeitar; ela também costuma recusar modelos genéricos demais. Se o status mudar para PAUSED/DISABLED depois, o botão some. O nome do contato pode vir de apelido do WhatsApp.

## Decisões para você
1. Sem nome válido: (a) não enviar e mostrar aviso, que é o recomendado, ou (b) submeter também uma versão sem variável ("Olá! Aqui é a equipe...") como alternativa.
2. Começar pela Etapa 1 (proteções da aba) antes de submeter? Recomendado, por causa da renomeação automática.
