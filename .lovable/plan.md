# Página interna "Envio de rastreio" (manual_tracking) — v2

Revisão do plano com as correções solicitadas. Nada foi implementado.

## 0. Resposta direta: o link NÃO chega ao cliente hoje

Inspeção do registro real aprovado em `meta_templates`:

```text
pedido_enviado — APPROVED — pt_BR
components: [ { type: BODY, text: "Boa notícia, {{1}}! Seu pedido {{2}} foi enviado
                pela {{3}}. Código de rastreio: {{4}}. Você já pode acompanhar a
                entrega pelo site da transportadora." } ]
```

- O template aprovado tem **apenas o componente BODY**. Não existe `BUTTONS`, não existe botão de URL dinâmica, não existe `HEADER`, não existe uma 5ª variável.
- O payload real montado pelo `whatsapp-sender` (case `template`) envia somente `template.name`, `template.language` e `components: [{ type: 'body', parameters: [4 textos] }]`. Nenhum componente `button` é montado — ainda que o metadata trouxesse um, o sender não o enviaria.
- Conclusão: **o link da Correios/Jadlog não chega ao WhatsApp do cliente**. O `tracking_url` que hoje aparece no fim da `preview` do fluxo Shopify é apenas texto local no Chat ao Vivo; ele nunca foi enviado à Meta.

Consequências para este plano:
- **Não** será enviada uma segunda mensagem de texto livre com o link (risco de estar fora da janela de 24h e de ser rejeitada).
- O link não entra no formulário como algo "enviado". A transportadora escolhida define apenas `{{3}}` (Correios / Jadlog).
- Se você quiser o link no WhatsApp, o caminho correto é criar uma **nova versão do template com botão de URL dinâmica** (`BUTTONS: [{ type: URL, url: "https://rastreamento.correios.com.br/{{1}}" }]` ou dois templates, um por transportadora) e submeter à aprovação da Meta. Isso fica como item opcional, **fora** desta entrega, e exige também passar a montar o componente `button` no `whatsapp-sender`. Digo isto explicitamente para não haver expectativa de link nesta fase.

## 1. O que já existe e será reutilizado (sem alterar comportamento)

| Peça atual | Uso na página manual |
|---|---|
| Template `pedido_enviado` (APPROVED, pt_BR, 4 variáveis, só BODY) | mesmo template, mesmas 4 variáveis |
| `_shared/shopify.ts` → `normalizePhone`, `cleanOrderNumber`, `buildTemplateMessage` | importadas sem alteração |
| `send_queue` (`message_type: 'template'`) | mesmo formato de enfileiramento |
| `whatsapp-sender` | único ponto de envio à Meta; grava em `messages` |
| `contacts` / `conversations` | mesma resolução por telefone |
| `meta_templates` | checagem de `status = APPROVED` antes de enfileirar |
| `shopify_shipment_notifications` | **permanece intocada** (nenhuma coluna, nenhum status, nenhuma linha alterada) |
| `App.tsx`, `Sidebar.tsx`, `RoleGate.tsx`, `useUserRole.ts` | rota e controle de acesso |

Verificado no código: `send_queue` **não** aciona a IA. A `nina_processing_queue` só é alimentada pelo `whatsapp-webhook` a partir de mensagens recebidas do cliente.

## 2. O que será criado

**Banco (tudo novo, nada existente é tocado)**
- `public.tracking_send_locks` — trava compartilhada entre Shopify e manual:
  - `tracking_key text not null` (código normalizado: `upper`, sem espaços/hífens)
  - `source text not null` (`shopify` | `manual_tracking`)
  - `status text not null` (`processing` | `sent` | `failed`)
  - `order_number`, `phone_number`, `carrier`, `customer_name`, `sent_by uuid`, `send_queue_id uuid`, `error_message`, `created_at`, `updated_at`
  - `UNIQUE (tracking_key)`
  - **Seed**: `INSERT ... SELECT DISTINCT` das linhas atuais de `shopify_shipment_notifications` com `status = 'sent'`, gravadas como `sent` / `source='shopify'`. É um insert em tabela nova — nenhuma linha original é lida para escrita, alterada, apagada ou marcada como `superseded`. Duplicatas históricas são resolvidas por `DISTINCT ON (tracking_key)` na própria consulta de seed, sem tocar na origem.
- `public.manual_tracking_logs` — auditoria da página (ver §8).
- RLS + GRANTs em ambas; escrita só por service_role.

**Backend**
- `send-manual-tracking` (edge function nova): valida JWT + papel, valida campos, normaliza telefone, adquire a trava, enfileira, retorna `queued` ou `duplicate` ou `failed`.
- `shopify-webhook`: **um único acréscimo** — depois da trava atual (`fulfillment_id + tracking_number`, mantida exatamente como está), tentar também a trava nova em `tracking_send_locks`. Se a trava nova acusar duplicidade, o evento termina como `skipped_duplicate` (comportamento já existente). HMAC, tópicos, filtros, retry de `failed` e o índice antigo permanecem idênticos.

**Frontend**
- `src/pages/TrackingSend.tsx`, `src/hooks/useManualTracking.ts`, rota `/tracking` (oculta no menu — §7), item de menu desativado por flag.

## 3. Deduplicação compartilhada — atômica, em tabela nova

Chave: **somente o código de rastreio normalizado** (`tracking_key`). Escolha intencionalmente mais restritiva que `fulfillment_id + tracking_number`: o envio manual não conhece o `fulfillment_id` da Shopify, então a única chave capaz de ligar as duas origens é o código em si. Um mesmo código nunca deve gerar dois WhatsApps, independentemente do fulfillment — logo a restrição extra é desejável, não um efeito colateral.

Aquisição da trava (idêntica nas duas origens):

```text
INSERT INTO tracking_send_locks (tracking_key, source, status='processing')
  ├─ sucesso  -> segue para send_queue
  └─ conflito (unique violation)
       └─ UPDATE ... SET status='processing', source=<origem>
          WHERE tracking_key=$1 AND status='failed'   -- claim atômico condicional
             ├─ 1 linha  -> retry permitido
             └─ 0 linhas -> BLOQUEADO: "Este código de rastreio já foi enviado."
```

O `INSERT` é a própria trava — o banco serializa. Cobertura:
- **Clique duplo**: segundo request cai em unique violation; a linha está `processing`, não `failed` → bloqueado. (A UI também desabilita o botão, mas a garantia é o banco.)
- **Manual e Shopify simultâneos**: um dos dois vence o insert; o outro encontra `processing` → bloqueado.
- **Manual primeiro, Shopify depois**: linha já `sent` → webhook registra `skipped_duplicate`, sem enviar.
- **Shopify antes (histórico ou novo)**: seed inicial e a trava do webhook garantem linha `sent` → envio manual bloqueado.
- **`failed`**: única situação em que a chave pode ser reivindicada; `sent` e `processing` nunca liberam.

Se o enfileiramento falhar depois da trava adquirida, a linha volta para `failed` (nunca é apagada quando veio de um claim), permitindo nova tentativa segura.

A dedup antiga por `fulfillment_id + tracking_number` continua ativa e é avaliada **antes** da nova no webhook — nenhum enfraquecimento.

## 4. Status real do envio (sem "Enviado" prematuro)

`send_queue` tem ciclo `pending → processing → completed | failed`, processado assincronamente pelo `whatsapp-sender`. A página **nunca** mostra sucesso ao enfileirar.

- Resposta imediata da edge function: `queued` (com `send_queue_id`) ou `duplicate` ou `invalid` — a UI mostra **"Aguardando processamento"**.
- A página então acompanha o item: realtime/polling sobre o registro correspondente até:
  - `send_queue.status = 'completed'` **e** `whatsapp_message_id` presente na mensagem → **Enviado** (aceito pela Meta);
  - `send_queue.status = 'failed'` → **Falhou** (com `error_message`);
  - timeout de acompanhamento → permanece **Aguardando**, nunca "Enviado".
- A trava (`tracking_send_locks.status`) e o log só passam a `sent`/`failed` a partir do resultado real do envio, não do enfileiramento. Isso exige que o `send-manual-tracking` registre o `send_queue_id` na trava e que a conciliação de estado seja feita na leitura (a página deriva o estado de `send_queue` + `messages`), sem alterar o `whatsapp-sender`.
- O formulário só é limpo quando o estado chega a **Enviado**.

## 5. Chat ao Vivo — mensagem idêntica ao que foi enviado

O texto gravado em `messages` deve ser exatamente o corpo que a Meta renderiza. Como o template só tem BODY, o conteúdo será o BODY aprovado com `{{1}}..{{4}}` substituídos pelos mesmos valores enviados no payload — montado a partir do texto do template lido de `meta_templates`, e **sem** o `tracking_url` anexado (que não é enviado ao cliente). Assim o Chat ao Vivo não mostra nada além do que o cliente recebeu.

Nota: o fluxo Shopify atual anexa o `tracking_url` na preview, ou seja, o Chat ao Vivo dele mostra um pedaço a mais que o cliente não recebeu. Isso é uma divergência pré-existente; **não será alterada nesta entrega** para não mexer no fluxo em produção — posso tratá-la em um ajuste separado se você quiser.

## 6. Controle de acesso

- Papéis existentes no enum `app_role`: `admin`, `manager`, `sdr`, `user`. **Não existe papel de expedição.**
- Nesta entrega: `RoleGate area="tracking"` liberado **somente para `admin` e `manager`**. Nenhuma permissão existente é ampliada; `sdr` e `user` não recebem nada novo.
- Futuro papel de expedição (fora desta entrega): adicionar `expedicao` ao enum `app_role` e mapear em `ROLE_PERMISSIONS` **apenas** `['tracking']` (opcionalmente `chat`), sem dashboard, settings, cerebro ou team. A edge function também passaria a aceitar esse papel na validação server-side.
- A edge function valida o JWT e consulta `user_roles` no servidor; a checagem de UI não é a garantia.

## 7. Publicação em duas etapas

1. Página criada **oculta no menu** (rota acessível apenas por URL direta, atrás do RoleGate admin/manager) e com um interruptor de envio desligado por padrão em ambiente de teste.
2. Durante a implementação: nenhum envio real automático, nenhum telefone de cliente, nenhum reprocessamento de evento antigo, nenhuma alteração de status antigo.
3. Teste real pelo WhatsApp **somente** depois que você fornecer e autorizar um número próprio de teste.
4. Liberação no menu para a expedição só após: (a) validação do envio manual e (b) novo teste assinado do webhook da Shopify confirmando que o fluxo automático segue intacto.

## 8. Histórico

`manual_tracking_logs` registra por tentativa: usuário (`sent_by`), pedido, nome, telefone normalizado, transportadora, código, `send_queue_id`, resultado (`queued` → `sent` | `failed` | `duplicate` | `invalid`), mensagem de erro, criado/atualizado em. A página lista os últimos envios com o estado real (§4).

## 9. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Quebrar a dedup da Shopify | tabela e índice atuais intocados; trava nova é adicional |
| Alterar registros históricos | nenhuma escrita em `shopify_shipment_notifications` / `shopify_events`; seed é INSERT em tabela nova |
| Duplicidade entre origens | `UNIQUE(tracking_key)` + claim condicional atômico |
| Mostrar sucesso falso | estado derivado de `send_queue`/`messages`, nunca do enfileiramento |
| Página disparar a IA | `send_queue` não alimenta `nina_processing_queue` (verificado) |
| Vazar credenciais | envio 100% na edge function; front só usa `functions.invoke` |
| Expectativa de link no WhatsApp | explicitado em §0: template aprovado não suporta link |

## 10. Testes antes de qualquer publicação

Sem envio real: campos obrigatórios vazios · telefone inválido · normalização de telefone · clique duplo (dois requests concorrentes) · rastreio manual duplicado · rastreio já presente na trava vinda do seed Shopify · simulação de rastreio manual seguido de webhook assinado com o mesmo código (deve responder `skipped_duplicate`) · retry de registro `failed` · verificação de que `nina_processing_queue` não recebeu nada · verificação de que `shopify_events` e `shopify_shipment_notifications` não tiveram nenhuma linha alterada (contagem + hash de status antes/depois).

Com envio real (somente após sua autorização e com número seu): envio bem-sucedido · estado evoluindo de Aguardando → Enviado · mensagem no Chat ao Vivo igual ao recebido · falha simulada no WhatsApp seguida de retry.

## 11. Ordem de implementação

1. Migração: criar `tracking_send_locks` (+ seed por INSERT) e `manual_tracking_logs`, com RLS e GRANTs.
2. Edge function `send-manual-tracking`.
3. Acréscimo mínimo da trava nova no `shopify-webhook`.
4. Frontend com a rota oculta e acesso admin/manager.
5. Bateria de testes sem envio real.
6. Teste real com o número que você autorizar.
7. Novo teste assinado do webhook Shopify.
8. Liberação do item no menu para a expedição.

## 12. Rollback

Remover a rota/página e a edge function; reverter o acréscimo no `shopify-webhook` (bloco isolado, uma inserção). No banco, `DROP TABLE tracking_send_locks` e `manual_tracking_logs` — ambas são novas e nenhum fluxo antigo depende delas. Como nada em `shopify_shipment_notifications` ou `shopify_events` foi tocado, o fluxo da Shopify volta ao estado atual sem perda de registro algum.
