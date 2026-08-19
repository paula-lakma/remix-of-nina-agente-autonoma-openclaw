# Envio de rastreio — v5 (execução em duas fases independentes)

Nada foi implementado. Nenhum template foi criado, reenviado ou excluído.

Aprovar este plano autoriza **somente a Fase 1**. A Fase 2 permanece apenas documentada e exige uma nova aprovação depois da parada obrigatória.

---

# FASE 1 — única fase autorizável agora

Objetivo: descobrir o status real dos dois templates na Meta e corrigir o botão Sincronizar. Nada além disso.

## 1.1 Leitura ao vivo na Meta (somente leitura)

- `GET /{waba_id}/message_templates?fields=name,language,status,category,id&limit=200` (seguindo `paging.next`), com o WABA de `nina_settings.whatsapp_business_account_id`.
- `GET /1076577855069784?fields=name,language,status,category,components` (Correios).
- `GET /3697446527080997?fields=name,language,status,category,components` (Jadlog).
- Reporto o **status exato** retornado para cada um, mais o motivo de rejeição se houver.
- Nenhuma criação, reenvio, exclusão ou alteração de template. Nenhuma escrita no banco nesta etapa.

Se a Meta responder erro de autenticação, WABA inválido ou permissão ausente (`whatsapp_business_management`), **paro e reporto o erro**, sem seguir para 1.2.

## 1.2 Correção do problema de sincronização

Diagnóstico já confirmado por leitura do código e do banco:

```text
pedido_enviado           APPROVED  pt_BR UTILITY  meta_id 4390108104576435  updated_at 14/08 11:51
pedido_enviado_correios  PENDING   pt_BR UTILITY  meta_id 1076577855069784  updated_at 19/08 13:13
pedido_enviado_jadlog    PENDING   pt_BR UTILITY  meta_id 3697446527080997  updated_at 19/08 13:15
```

- `sync-template-status` lista o WABA (com paginação correta) e casa os registros por `name + language`; grava **só quando o status ou o `meta_template_id` muda** — por isso `updated_at` continua o da submissão quando a Meta ainda diz PENDING.
- `useMetaTemplates.syncStatuses()` verifica apenas o erro de transporte do `functions.invoke`; **ignora `data.error` e `errors[]`**. Um 400 (WABA ausente, token expirado, escopo faltando) produz o toast **"Status atualizado"** sem nenhuma atualização. Este é o erro silencioso.

Correções (escopo fechado):

**`supabase/functions/sync-template-status/index.ts`**
- Retorno estruturado: `{ fetched, updated, unchanged, failed, errors[], waba_id_present }`, distinguindo claramente `updated`, `unchanged` e `failed`.
- Erros de autenticação/WABA/token/permissão classificados e devolvidos com mensagem legível (código e tipo da Graph API preservados).
- **Complemento por ID**: para linhas locais que possuem `meta_template_id` mas não aparecem na listagem do WABA, consultar `GET /{meta_template_id}` individualmente e usar esse status.
- Listagem, paginação e o comportamento dos templates já existentes permanecem como estão. Nenhum template é criado, reenviado ou excluído.

**`src/hooks/useMetaTemplates.ts`**
- `syncStatuses()` passa a checar `data.error` e a propagar `errors[]`, lançando quando a sincronização falhou.

**`src/pages/Templates.tsx`**
- O toast só diz "Status atualizado" em sucesso real, informando quantos foram atualizados e quantos permaneceram iguais; falha vira toast de erro com o motivo.

## 1.3 Após a correção

- Executar uma sincronização real.
- Mostrar o resultado exato de `pedido_enviado_correios` e `pedido_enviado_jadlog` (status na Meta e status gravado).
- Informar arquivos alterados e testes realizados.

## 1.4 Restrições absolutas da Fase 1

Não alterar o `shopify-webhook` · não criar tabelas, migrations, RPCs, roles ou policies · não criar a página de envio de rastreio · não criar nem atribuir o papel `expedicao` · não inserir nada em `send_queue` · não enviar nenhuma mensagem de WhatsApp · não usar telefone de cliente · não reprocessar eventos antigos · não alterar registros de `shopify_events` ou `shopify_shipment_notifications` · não publicar nem liberar nada para a equipe.

Único efeito no banco possível na Fase 1: a atualização de `status`/`meta_template_id` em `meta_templates` **produzida pela própria sincronização**, que é o comportamento já existente do botão.

## 1.5 Testes da Fase 1

Sincronização com sucesso (`updated`/`unchanged` corretos) · sincronização com WABA ausente → toast de erro, nunca "Status atualizado" · erro simulado da Graph API → mensagem classificada · template presente no banco e ausente da listagem → resolvido pela consulta por ID · verificação de que nenhuma outra tabela sofreu escrita.

## 1.6 PARADA OBRIGATÓRIA

Ao concluir 1.1–1.3, paro e aguardo nova aprovação. **Nenhum item da Fase 2 será executado junto com a aprovação da Fase 1.**

---

# FASE 2 — apenas planejada (requer nova aprovação)

Conteúdo técnico aprovado conceitualmente na v4, mantido integralmente aqui.

## 2.1 Templates da página manual

| Transportadora | Template | Meta ID |
|---|---|---|
| Correios | `pedido_enviado_correios` | 1076577855069784 |
| Jadlog | `pedido_enviado_jadlog` | 3697446527080997 |

```text
Boa notícia, {{1}}! Seu pedido {{2}} foi enviado pelos Correios.
Código de rastreio: {{3}}
Acompanhe sua entrega em: https://rastreamento.correios.com.br/
```

- `{{1}}` primeiro nome · `{{2}}` pedido normalizado (`cleanOrderNumber`, ex. `#1885`) · `{{3}}` código de rastreio.
- Nenhuma segunda mensagem, nenhum botão dinâmico, nenhum link extra — o link já está no corpo.
- O Chat ao Vivo grava exatamente o corpo aprovado com as três variáveis substituídas.
- `pedido_enviado` (4 variáveis) permanece intacto, usado **somente** pelo fluxo Shopify; a página manual nunca o usa, nem como fallback.

## 2.2 Bloqueio por status do template

Antes de qualquer trava ou enfileiramento, exigir: nome correto para a transportadora, `language = pt_BR`, `category = UTILITY`, `status = APPROVED`, BODY com exatamente 3 variáveis. Caso contrário: **sem trava, sem fila, sem envio**, retornando `template_not_approved` e a mensagem **"Este template ainda não está aprovado pela Meta."**

## 2.3 Coordenação das travas (correção central)

Aquisição das duas travas em **uma única transação**, via função `SECURITY DEFINER` chamada por RPC:

```text
public.acquire_tracking_send_lock(tracking_key, source, fulfillment_id, ...)
BEGIN
  (a) trava antiga: INSERT shopify_shipment_notifications ON CONFLICT (fulfillment_id, tracking_number) DO NOTHING
      conflito -> UPDATE ... SET status='processing' WHERE status='failed'
                  0 linhas -> RETURN 'duplicate'
  (b) trava nova:  INSERT tracking_send_locks (tracking_key UNIQUE) ...
      conflito -> UPDATE ... WHERE tracking_key=$1 AND status='failed'
                  0 linhas -> ROLLBACK -> RETURN 'duplicate'
COMMIT
```

O `ROLLBACK` desfaz automaticamente a escrita em (a) quando (b) falha — nenhum registro antigo fica preso em `processing`.

`public.release_tracking_send_lock(tracking_key, fulfillment_id, result)` marca **ambas** as linhas como `sent` ou devolve **ambas** a `failed`; chamada obrigatoriamente em `finally`.

Cenários:

| Cenário | Resultado |
|---|---|
| Shopify pega a antiga, a nova está `processing` por envio manual | rollback total; webhook responde `skipped_duplicate`; fulfillment continua reivindicável |
| O manual que detinha a nova trava falha depois | ambas voltam a `failed`; nova tentativa (manual ou webhook) funciona |
| Shopify pega a antiga e falha antes de enfileirar | `release(..., 'failed')` no `finally`; se o processo morrer, aplica-se a expiração abaixo |
| Duas origens no mesmo código simultaneamente | `UNIQUE(tracking_key)` serializa: uma envia, a outra recebe `duplicate` sem escrever |

**Expiração**: `processing` com `updated_at` acima de 30 minutos e sem `send_queue_id` ativo é tratado como `failed` pelas cláusulas de claim — nada fica bloqueado para sempre.

Invariantes: `sent` e `processing` ativo bloqueiam · `failed` (e `processing` expirado) é reivindicável com segurança · nenhuma combinação de falhas bloqueia as duas origens sem mensagem enviada · a dedup por `fulfillment_id + tracking_number` continua existindo · nenhuma linha histórica é alterada (`sent` nunca é tocado) · a página manual permanece desativada durante toda a migração · **imediatamente antes de liberar a página**, seed idempotente final (`ON CONFLICT DO NOTHING`) dos rastreios `sent` e dos `processing` realmente ativos.

## 2.4 Estruturas novas

- `public.tracking_send_locks`: `tracking_key UNIQUE`, `source`, `status`, `template_name`, `carrier`, `order_number`, `phone_number`, `customer_name`, `sent_by`, `send_queue_id`, `error_message`, timestamps.
- `public.manual_tracking_logs`: auditoria por tentativa (usuário, papel, pedido, telefone normalizado, transportadora, template, código, `send_queue_id`, resultado, erro, timestamps).
- RPCs `acquire_tracking_send_lock` / `release_tracking_send_lock` (`SECURITY DEFINER`, `search_path = public`), executáveis só por `service_role`.
- RLS + GRANTs: escrita só por `service_role`; leitura do histórico apenas para `admin`, `manager` e `expedicao`.
- `send-manual-tracking` (edge function): JWT → papel → campos → template (§2.2) → RPC → `send_queue` → `release` no `finally`.
- `shopify-webhook`: bloco de trava migrado para a RPC transacional; HMAC, tópicos, filtros, retry de `failed` e o template `pedido_enviado` inalterados.
- Frontend: `src/pages/TrackingSend.tsx`, `src/hooks/useManualTracking.ts`, rota `/tracking` oculta, interruptor de envio desligado por padrão.

## 2.5 Papel `expedicao`

- Migração isolada: `ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'expedicao';` — aditivo, não altera nenhuma linha de `user_roles`, não reescreve policies, `has_role` segue funcionando. Postgres exige o `ADD VALUE` em transação separada do uso, então vira uma migração própria antes das demais.
- `ROLE_PERMISSIONS.expedicao = ['tracking']`; `admin` e `manager` também ganham `'tracking'`; `sdr` e `user` não.
- Prioridade em `useUserRole`: `admin > manager > moderator > sdr > expedicao > user`.
- Validação no backend (garantia real): `send-manual-tracking` resolve o usuário pelo JWT e consulta `user_roles` com `service_role`; qualquer papel fora de `admin`/`manager`/`expedicao` → `403 forbidden`, sem trava, sem fila, sem envio.
- Atribuição do papel a pessoas é feita depois, manualmente.

## 2.6 Status real do envio

`queued` → UI "Aguardando processamento"; **Enviado** só quando `send_queue.status = 'completed'` **e** há `whatsapp_message_id`; `failed` → **Falhou** com o erro; timeout permanece Aguardando. As travas viram `sent`/`failed` pelo resultado real. `whatsapp-sender` não é alterado.

## 2.7 Testes da Fase 2

Template PENDING → bloqueio com a mensagem exata · transportadora sem template · campos vazios · telefone inválido/normalização · clique duplo concorrente · manual e webhook simultâneos (exatamente um vence) · falha na trava nova após a antiga → linha antiga **não** fica `processing` · falha após aquisição → ambas voltam a `failed` · `processing` órfão além de 30 min reivindicável · retry de `failed` · `expedicao` só acessa `/tracking` e recebe `forbidden` fora dela · `sdr`/`user` bloqueados na UI e no backend · `nina_processing_queue` sem novas linhas · contagem e hash de status de `shopify_events` e `shopify_shipment_notifications` antes/depois.

Envio real só com sua autorização, número seu e templates APPROVED.

## 2.8 Ordem da Fase 2

1. Migração A: `ADD VALUE 'expedicao'` (isolada).
2. Migração B: tabelas, RPCs, RLS, GRANTs, seed inicial idempotente.
3. `send-manual-tracking`.
4. `shopify-webhook` migrado para a RPC.
5. Frontend com rota oculta e envio desligado.
6. Testes sem envio real.
7. Teste real após sua autorização.
8. Novo teste assinado do webhook Shopify.
9. Seed idempotente final.
10. Liberação do menu e atribuição do papel.

## 2.9 Rollback

Fase 1: reverter os três arquivos alterados — nenhuma estrutura criada. Fase 2: remover rota/página e a edge function; reverter o `shopify-webhook`; `DROP` das RPCs e das duas tabelas novas. O valor `expedicao` permanece no enum (inofensivo sem `user_roles` apontando para ele). Nada em `shopify_shipment_notifications`, `shopify_events` ou `meta_templates` é perdido.
