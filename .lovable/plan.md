# Sincronizar templates cadastrados na Meta

## Problema identificado

A função `sync-template-status` **não busca templates da Meta** — ela só atualiza status de templates que já existem localmente e foram submetidos pelo próprio app (linhas com `status = 'PENDING'` e `meta_template_id` preenchido).

Se você cadastrou templates direto no Meta Business Manager (fora da plataforma), eles nunca aparecem em `/templates` porque:

1. Nunca foram inseridos em `public.meta_templates`.
2. A sync atual pula qualquer coisa que não esteja `PENDING`.
3. Não há chamada ao endpoint `GET /{waba_id}/message_templates` da Graph API, que é o único jeito de listar o que existe na Meta.

Além disso, faltam validações que ajudam a diagnosticar: se o `whatsapp_business_account_id` estiver vazio em `nina_settings`, a função hoje aceita string vazia e nem retorna erro claro.

## Solução

Reescrever `supabase/functions/sync-template-status/index.ts` para fazer sync bidirecional completa: puxar tudo que existe na WABA e refletir localmente, além de continuar atualizando status dos pendentes.

### Fluxo novo da função

```text
1. Ler credenciais (access_token, waba_id) de nina_settings
   └─ Se waba_id vazio → 400 com mensagem clara
2. GET graph.facebook.com/v21.0/{waba_id}/message_templates
   ?fields=name,language,status,category,components,id
   &limit=200  (paginar via data.paging.next se existir)
3. Para cada template retornado:
   - Upsert em meta_templates por (name, language)
   - Preencher: meta_template_id, status, category, components, updated_at
   - Se não existir localmente → INSERT
   - Se existir → UPDATE (status/components/category)
4. Retornar { fetched, inserted, updated, errors[] }
```

### Detalhes técnicos

- **Endpoint Graph**: `GET /{waba-id}/message_templates` com `access_token` como query param, campos explícitos e paginação por cursor (`data.paging.next`).
- **Chave de upsert**: `(name, language)` — combinação única na Meta. Como `meta_templates` hoje não tem UNIQUE nessas colunas, o upsert precisa ser feito em duas etapas (select → insert/update) OU adicionar constraint via migration. Prefiro a abordagem sem migration (select + branch) para não mexer em schema neste passo.
- **Tratamento de erros da Graph**: se `data.error` vier no payload, capturar `error.message` / `error.code` e devolver junto no response para debug (ex: token expirado, WABA sem permissão `whatsapp_business_management`).
- **Compatibilidade retroativa**: manter o comportamento antigo de refletir status de PENDING → APPROVED/REJECTED, já coberto naturalmente pelo upsert.
- **Logs**: `console.log` com contagens para aparecer nos edge function logs.
- **Sem mudanças no frontend**: `useMetaTemplates.syncStatuses()` já chama a função e recarrega a lista via realtime + `fetch()`, então basta o botão "Sincronizar" existente em `/templates`.

### Permissões Meta necessárias

Para o endpoint funcionar, o `whatsapp_access_token` precisa ter o escopo **`whatsapp_business_management`** (além do `whatsapp_business_messaging` já usado para enviar). Se o token atual for só de envio, a Graph vai devolver erro de permissão — nesse caso, o response vai mostrar exatamente essa mensagem e você regera o token com o escopo faltando.

### Arquivos alterados

- `supabase/functions/sync-template-status/index.ts` — reescrita completa conforme acima.

Nenhum outro arquivo precisa mudar.
