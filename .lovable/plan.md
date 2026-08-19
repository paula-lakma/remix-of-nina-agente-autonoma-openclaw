# Página interna "Envio de rastreio" (manual_tracking)

Página para a equipe de expedição enviar o template `pedido_enviado` manualmente, reutilizando exatamente o mesmo caminho de envio da Shopify, com deduplicação compartilhada entre as duas origens.

## 1. O que já existe e será reutilizado (sem alteração de comportamento)

| Peça atual | Uso na página manual |
|---|---|
| Template Meta `pedido_enviado` (APPROVED, pt_BR, 4 variáveis) | mesmo template, mesmas variáveis |
| `_shared/shopify.ts` → `normalizePhone`, `cleanOrderNumber`, `buildTemplateMessage` | reutilizados como estão (import puro, sem editar as funções) |
| Tabela `send_queue` (`message_type: 'template'`, metadata com `template_name` / `template_variables`) | mesmo formato de enfileiramento |
| Edge function `whatsapp-sender` | único ponto de envio à Meta; já grava em `messages` e atualiza `conversations.last_message_at` |
| Tabelas `contacts` / `conversations` | busca por telefone, cria se não existir (mesma lógica do webhook) |
| Tabela `shopify_shipment_notifications` | vira a tabela de dedup compartilhada (só ganha colunas novas) |
| `App.tsx`, `Sidebar.tsx`, `RoleGate.tsx`, `useUserRole.ts` | roteamento e controle de acesso |
| `meta_templates` | checagem de status APPROVED antes de enfileirar |

Observação importante já verificada no código: a IA **não** é acionada por esse caminho. `nina-orchestrator` só é disparado a partir de mensagens recebidas (`whatsapp-webhook` → `nina_processing_queue`). Inserir em `send_queue` nunca chama a IA.

## 2. O que será criado

**Frontend**
- `src/pages/TrackingSend.tsx` — formulário + modal de confirmação com prévia + histórico.
- `src/hooks/useManualTracking.ts` — envio (invoke da edge function) e leitura do histórico.
- Rota `/tracking` em `App.tsx` dentro de `ProtectedRoute` + `RoleGate area="tracking"`.
- Item "Envio de rastreio" no `Sidebar.tsx`.
- `useUserRole.ts`: adicionar `'tracking'` às permissões de `admin`, `manager` e `sdr` (nenhuma permissão existente é removida).

**Backend**
- Nova edge function `send-manual-tracking` (`verify_jwt = true`): valida sessão do usuário, valida campos, normaliza telefone, aplica dedup, enfileira e retorna resultado. Nenhum token da Meta chega ao navegador.

**Banco**
- Colunas novas em `shopify_shipment_notifications` (todas nullable / com default, sem tocar em linhas existentes):
  - `source text not null default 'shopify'`
  - `carrier text` (`correios` | `jadlog` | valor da Shopify)
  - `tracking_key text` — chave normalizada compartilhada (`upper(trim(tracking_number))`), preenchida por trigger e backfill nas linhas atuais
  - `sent_by uuid` (usuário que enviou), `customer_name text`, `tracking_url text`
- Índice único parcial novo: `UNIQUE (tracking_key) WHERE status IN ('processing','sent')`. O índice atual `UNIQUE (fulfillment_id, tracking_number)` permanece intacto.
- Nova tabela `manual_tracking_logs` (auditoria de cada tentativa: usuário, dados informados, resultado, mensagem de erro, timestamp), com RLS e GRANTs.

## 3. Preenchimento do template

`pedido_enviado` = `{{1}}` primeiro nome, `{{2}}` pedido (`#1885`), `{{3}}` transportadora, `{{4}}` código.

O envio manual monta um objeto `NormalizedShopify` sintético (`event_kind: 'order_shipped'`) com os dados do formulário e chama `buildTemplateMessage` — mesma função, mesmo texto. `tracking_url` é derivado da transportadora escolhida:
- Correios → `https://rastreamento.correios.com.br/`
- Jadlog → `https://www.jadlog.com.br/jadlog/rastreie`

O número do pedido passa por `cleanOrderNumber`, então `#1885` e `1885.1` viram `#1885`. Todas as variáveis necessárias estão disponíveis no formulário — nada falta.

## 4. Chat ao Vivo

O registro em `messages` é feito pelo `whatsapp-sender` (insert com `from_type: 'nina'`, `type: 'text'`, conteúdo = prévia). Como o envio manual usa `send_queue`, a mensagem aparece na conversa do telefone automaticamente, com `metadata.source = 'manual_tracking'` e `sent_by`. Sem alteração no `whatsapp-sender`.

## 5. Telefone

`normalizePhone` (já existente) para E.164 BR sem `+`. Se retornar `null` ou resultado com menos de 12 dígitos, o envio é recusado com "Telefone inválido" — antes de qualquer gravação de dedup.

## 6. Deduplicação compartilhada

Chave: `tracking_key` = código de rastreio normalizado (maiúsculas, sem espaços). Fluxo idêntico nas duas origens:

```text
insert em shopify_shipment_notifications (status='processing')
  ├─ sucesso  -> segue para send_queue -> status='sent'
  └─ conflito -> tenta claim condicional: update ... where status='failed'
                  ├─ conseguiu -> retry seguro
                  └─ não       -> bloqueado ("Este código de rastreio já foi enviado.")
```

O insert é a própria trava (atômico), então clique duplo, corrida manual×Shopify e Shopify×manual são todos resolvidos pelo banco. Falha ao enfileirar → `releaseLock` devolve para `failed` (retry) ou apaga a linha nova.

No `shopify-webhook` a única mudança é passar `source: 'shopify'` e `carrier` no insert e tratar o conflito também pela nova chave — a lógica de retry e o índice antigo continuam iguais.

## 7. Preservação dos registros atuais

A migração é aditiva: `ALTER TABLE ADD COLUMN` + backfill de `tracking_key`/`source='shopify'` nas linhas existentes + criação do índice parcial. Nenhum `DELETE`, nenhum `UPDATE` de `status`, nenhum insert em `send_queue` ou `messages`. Eventos antigos em `shopify_events` não são lidos nem reprocessados. Se o backfill encontrar duplicatas de `tracking_key` entre linhas `sent`, o índice é criado apenas depois de consolidar as duplicatas em uma linha `sent` + linhas marcadas `superseded` (nenhum envio novo).

## 8. Controle de acesso

- Rota protegida por `ProtectedRoute` (sessão) + `RoleGate area="tracking"`.
- A edge function valida o JWT do usuário e confere o papel em `user_roles` no servidor — a checagem de UI não é a garantia de segurança.
- `manual_tracking_logs`: leitura só para admin/manager; insert só via service role.

## 9. Histórico

Cada tentativa grava em `manual_tracking_logs`: usuário, pedido, nome, telefone normalizado, transportadora, código, link, resultado (`sent` | `duplicate` | `failed`), mensagem de erro e data/hora. A página lista os últimos envios com estado visual claro.

## 10. Riscos ao fluxo atual e mitigação

| Risco | Mitigação |
|---|---|
| Quebrar o dedup da Shopify | índice antigo mantido; o novo é adicional e parcial |
| Índice novo falhar por duplicata histórica | verificação e consolidação antes de criar o índice |
| Reenvio acidental de rastreios já enviados | migração puramente aditiva; nada é enfileirado |
| Página disparar a IA | `send_queue` não aciona `nina-orchestrator`; verificado no código |
| Vazar credenciais | envio 100% na edge function; front só chama `supabase.functions.invoke` |
| Alterar `shopify-webhook` | mudança mínima e aditiva; HMAC, tópicos e filtro de reações intocados |

## 11. Testes antes de publicar

Envio manual bem-sucedido · telefone inválido · campo obrigatório vazio · clique duplo (botão travado + trava no banco) · rastreio manual repetido · rastreio já enviado pela Shopify · rastreio manual que depois chega pela Shopify (webhook responde `skipped_duplicate`) · falha no WhatsApp seguida de retry do registro `failed` · mensagem correta no Chat ao Vivo · confirmação de que `nina_processing_queue` não recebeu nada · confirmação de que `shopify_events` antigos não mudaram de status.

## 12. Ordem de implementação

1. Migração aditiva (colunas + backfill + índice parcial + `manual_tracking_logs`).
2. Edge function `send-manual-tracking` + ajuste mínimo no `shopify-webhook`.
3. Frontend (página, hook, rota, sidebar, permissão).
4. Testes acima em número interno.
5. Publicação e liberação para a expedição.

## 13. Rollback

Remover a rota/página e a edge function; reverter o ajuste do `shopify-webhook` (uma linha de origem no insert). No banco, basta remover o índice parcial novo — as colunas adicionadas e `manual_tracking_logs` são inertes para a Shopify e podem ficar. Nenhum registro atual de `shopify_shipment_notifications` ou `shopify_events` é apagado em qualquer cenário.
