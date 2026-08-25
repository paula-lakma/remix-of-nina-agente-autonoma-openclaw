# Regravar EXPEDICAO_CHAT_HANDOFF_ENABLED como `true`

Objetivo: eliminar a incerteza sobre o valor atual da flag sem adicionar código de diagnóstico.

## O que será alterado (exatamente isto)

| Item | Valor atual | Valor após |
| --- | --- | --- |
| Secret `EXPEDICAO_CHAT_HANDOFF_ENABLED` | existe, valor não legível | `true` (string literal, minúsculas, sem espaços) |

Nada mais.

## O que NÃO será alterado

- Nenhuma outra secret (`MANUAL_TRACKING_SEND_ENABLED`, `SHOPIFY_SHARED_TRACKING_LOCK_ENABLED`, `SHOPIFY_WEBHOOK_SECRET`, chaves de backend etc.) permanece intocada.
- Nenhum arquivo de código, migration, RPC ou política RLS.
- Nenhuma publicação de frontend.
- Fluxo Shopify → WhatsApp preservado integralmente: essa flag é lida apenas pelo caminho de handoff da `nina-reply`; o webhook Shopify e o sender de rastreio não a consultam.

## Efeito colateral técnico esperado

Regravar uma secret provoca redeploy automático das edge functions com o novo ambiente. O código-fonte das funções continua idêntico ao que já está em produção (nada novo é publicado); apenas o ambiente é recarregado. Durante alguns segundos as funções podem responder com cold start.

## Verificação após a execução

1. Confirmar que a secret consta na lista de secrets do projeto.
2. Confirmar por consulta ao banco que `apply_expedicao_handoff` continua resolvendo exatamente um membro ativo: Leticia (`financeiro@lakma.com.br`, papel `expedicao`).
3. Nenhum teste real de mensagem será disparado nesta etapa — validação em produção fica para uma etapa posterior, sob sua autorização.
