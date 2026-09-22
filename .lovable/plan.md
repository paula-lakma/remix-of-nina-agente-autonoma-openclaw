# Plano final (v2) — rastreio, chat do admin e novo acesso de expedição

Atualização do plano anterior. As conclusões já confirmadas seguem válidas. Nada foi alterado; nada será criado ou enviado antes da aprovação. O plano dos 6 alertas de segurança continua pausado.

---

## 1. Modelo de mensagem atual da Meta (verificado)

O aviso automático usa hoje o modelo **`pedido_enviado`** — Utilidade, pt_BR, **aprovado**:

> Boa notícia, {{1}}! Seu pedido {{2}} foi enviado pela {{3}}. Código de rastreio: {{4}}. Você já pode acompanhar a entrega pelo site da transportadora.

| Variável | Conteúdo |
|---|---|
| {{1}} | nome do cliente |
| {{2}} | número do pedido |
| {{3}} | **transportadora** |
| {{4}} | código de rastreio |
| link | não existe variável de link |

"Frenet" e "Other" entram como **valor da variável {{3}}**; nenhum nome está fixo no texto.

Já existem mais dois modelos aprovados, com o nome e o link corretos fixos no texto:

- `pedido_enviado_correios` — "...foi enviado pelos Correios. Código: {{3}}. Acompanhe em rastreamento.correios.com.br" (3 variáveis: nome, pedido, código).
- `pedido_enviado_jadlog` — "...foi enviado pela Jadlog. Código: {{3}}. Acompanhe em jadlog.com.br/jadlog/rastreie" (3 variáveis: nome, pedido, código).

## 2. Precisa de modelo novo?

- **Correios e Jadlog: não.** O aviso automático passa a usar os dois modelos específicos já aprovados, com gramática certa ("pelos Correios") e link oficial. `pedido_enviado` deixa de ser usado pelo aviso automático (continua aprovado, sem alteração).
- **Indeterminado: sim, seria preciso um modelo de reserva.** O `pedido_enviado` obriga um nome em "foi enviado pela {{3}}" e não há como usá-lo sem afirmar uma transportadora. Até existir um modelo de reserva aprovado, o evento indeterminado **não gera mensagem automática**: fica registrado como indeterminado para a equipe conferir. Nenhum modelo será criado ou enviado à Meta agora — texto sugerido para depois: "Seu pedido {{2}} foi enviado. Código de rastreio: {{3}}."

## 3. Onde fica `resolveCarrier`

- Arquivo: `supabase/functions/_shared/shopify.ts`, função exportada `resolveCarrier(trackingUrl, trackingNumber, trackingCompany)` → `'correios' | 'jadlog' | 'indeterminado'`.
- Ordem de decisão: link (`frenet.com.br/JAD/` ou link Jadlog → Jadlog; link dos Correios → Correios) → formato do código (AA123456789BR → Correios; 9 dígitos numéricos → Jadlog) → nome recebido **somente** se já for Correios/Jadlog. Frenet, Other, Outra, UPS ou vazio nunca decidem sozinhos.
- Quem usa: `normalizeShopifyPayload` (em `shopify.ts`) grava o resultado; `buildTemplateMessage` escolhe o modelo; `shopify-webhook/index.ts` usa a transportadora resolvida na trava anti-duplicidade.
- Banco após a normalização:
  - `shopify_events.normalized.tracking_company` = `correios`, `jadlog` ou `indeterminado`; valor original preservado em `normalized.tracking_company_raw` (auditoria). `raw_payload` intacto.
  - `tracking_send_locks.carrier` = `correios` / `jadlog` (indeterminado não adquire trava porque não envia).
  - `shopify_events.send_status` = `skipped_carrier_unknown` para os indeterminados.
- Tela manual: continua obrigando Correios/Jadlog e não recebe a lógica de inferência.

## 4. Comportamento final

| Caso | Mensagem ao cliente |
|---|---|
| Correios | `pedido_enviado_correios` |
| Jadlog (inclui Frenet/Other com link Jadlog ou código de 9 dígitos) | `pedido_enviado_jadlog` |
| Indeterminado | nenhuma mensagem automática; registro interno como indeterminado |

Mensagens já enviadas e eventos antigos não são alterados.

---

## B. Chat do admin x Leticia

Diagnóstico e solução mantidos integralmente:

- Admin com visão global; primeira página com 50 conversas, "carregar mais", busca no servidor por nome/telefone em todas as conversas e filtro opcional por responsável. Nenhuma conversa fica invisível por estar fora das 50 mais recentes.
- Mensagens: carregar as mais recentes primeiro, abrir no fim da conversa e permitir carregar as anteriores, sem limite fixo de 100.
- Vanessa Reis/Carla aparecer para o admin continua correto.
- Chats restritos de Leticia, Carla e dermoconsultoras não são tocados.

---

## C. Papel `rastreio`

### 5. Histórico mínimo

A tela hoje mostra: pedido, nome do cliente, transportadora, código, status e data; o telefone é carregado mas não exibido.

Para `rastreio`: somente **os próprios envios**, com **pedido, código, transportadora, status e data** — sem nome e sem telefone. Entregue por uma função de servidor dedicada (`list_my_tracking_sends`), sem leitura direta da tabela. Duplicidade continua bloqueada no servidor pela trava atual, com aviso "código já enviado", independentemente do histórico. Leticia, admin e gestão continuam vendo o histórico completo como hoje.

### 6. Arquitetura final

- Novo papel `rastreio`.
- Menu e rotas: somente "Envio de rastreio" (página inicial dele); qualquer outra rota volta para ela.
- `send-manual-tracking`: passa a aceitar `rastreio` além de admin, gestão e expedicao; mantém validação de sessão, campos, modelo aprovado, trava e interruptor de envio.
- Banco: nenhuma regra nova de leitura em conversas, mensagens, contatos, negócios, campanhas, modelos, equipe ou configurações — as regras atuais já negam tudo isso para papéis fora de admin/gestão/sdr. Sem Chat, handoff, rodízio, concessões ou responsável.
- Leticia continua `expedicao`, com Chat restrito, handoffs e Envio de rastreio.
- Plano pausado de segurança: `rastreio` não depende de equipe, times, funções, etiquetas, etapas do funil nem pacotes, e continuará bloqueado quando aquele plano for aplicado.

### 7. Criação da conta

- Nome **Expedicao**, e-mail **expedicaolakma@outlook.com** — verificado agora: **ainda não existe**. Será verificado de novo antes de criar.
- Criação pela função existente `admin-create-user` (API administrativa oficial, idempotente, sem cadastro público).
- Ponto de atenção verificado: o gatilho de criação de conta dá `sdr` automaticamente a toda conta nova. Logo após a criação, o `sdr` é trocado por `rastreio` numa única operação, e confirmo que ficou **somente** `rastreio`. A conta não é usada antes disso.

### 8. Precisa de membro da equipe?

**Não.** A trava de envio registra quem enviou pelo usuário da sessão, não pelo membro da equipe; membro de equipe só é necessário para Chat restrito, concessões e rodízio, que esse papel não tem. Não será criado — assim ele também não aparece como responsável.

### 9. Senha temporária

- `admin-create-user` ganha uma opção para devolver a senha temporária **uma única vez** na resposta ao administrador; não é gravada em tabela, metadados, perfil, código nem logs, e não é enviada por e-mail.
- Eu repasso a senha a você no chat após a criação, para enviar por canal privado.
- Hoje não existe tela para o usuário logado trocar a própria senha (só o fluxo de "Esqueci minha senha", que não está confiável). Fica para a futura funcionalidade "Alterar senha".

---

## Resumo técnico

**Migrations (1):** adicionar `rastreio` aos papéis; função `list_my_tracking_sends` (acesso somente `rastreio`, próprios envios, campos mínimos). Troca de papel da conta nova é operação de dados, fora da migration.

**Frontend:** `src/hooks/useUserRole.ts` (papel, permissão e página inicial), `src/hooks/useManualTracking.ts` e `src/pages/TrackingSend.tsx` (histórico mínimo para `rastreio`), `src/services/api.ts`, `src/hooks/useConversations.ts`, `src/components/ChatInterface.tsx` (paginação, busca, filtro e mensagens recentes do admin).

**Funções de servidor a publicar:** `shopify-webhook` (com `_shared/shopify.ts`), `send-manual-tracking`, `admin-create-user`.

**Publicar o site:** sim. **Reconstruir o Cérebro:** não.

**Testes finais:**
- `resolveCarrier` com casos reais: Frenet com link Jadlog, Other com link, Other sem link com 9 dígitos, Correios, e indeterminado; escolha do modelo correto; indeterminado não envia.
- Simulação do webhook sem disparar WhatsApp.
- Admin encontra as 19 conversas da Leticia, busca "Aline"/"Anny", conversa longa abre no fim e carrega anteriores.
- Conta `rastreio`: só vê Envio de rastreio; rotas diretas negadas; leitura direta de conversas, contatos, campanhas e equipe bloqueada; histórico só com os campos mínimos; duplicidade bloqueada; interruptor respeitado.
- Leticia, Carla, dermoconsultoras, Paula Rodrigues e João Felipe sem alteração.
- Bateria de testes completa e verificador de segurança.

**Riscos de regressão:**
- Aviso automático passa a usar outros dois modelos já aprovados — risco baixo; eventos indeterminados deixam de receber aviso até existir o modelo de reserva.
- Janela curta em que a conta nova nasce `sdr` antes da troca para `rastreio` — mitigada por trocar imediatamente e não entregar a senha antes da confirmação.
- Lista do admin muda de carga fixa para paginada — isolada da tela das contas restritas.
