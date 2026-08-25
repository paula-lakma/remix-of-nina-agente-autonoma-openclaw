# Confirmação da flag EXPEDICAO_CHAT_HANDOFF_ENABLED

## O que já está confirmado (sem alterações)

- **RPC `apply_expedicao_handoff` resolve exatamente 1 responsável**: Leticia, `financeiro@lakma.com.br`, papel `expedicao`, membro ativo, função Financeiro, `team_member_id 22222222-0000-4000-a000-000000000004`. Sem ambiguidade.
- A secret `EXPEDICAO_CHAT_HANDOFF_ENABLED` **existe** no ambiente de produção, mas o valor é criptografado e nenhuma ferramenta de leitura o expõe.
- Não há evento `handoff_financeiro` registrado até agora e há 0 concessões ativas, então não existe evidência indireta do valor da flag.

## Limitação a resolver

A função `nina-reply` lê a flag em tempo de execução, mas **não registra o valor em log hoje**. Portanto um diagnóstico read-only só é possível adicionando temporariamente uma linha de log booleana.

## Diagnóstico proposto (temporário e reversível)

1. Adicionar em `supabase/functions/nina-reply/index.ts` um ramo de diagnóstico acionado apenas por `{"diagnostic": true}` com `X-Panel-Token` válido, que:
   - responde `{ expedicao_chat_handoff_enabled: true|false }`;
   - **retorna antes** de qualquer leitura de conversa, insert em `send_queue`, RPC de handoff ou disparo do sender;
   - não expõe nenhum valor de secret, apenas o booleano derivado.
2. Publicar somente essa função.
3. Invocar o endpoint de diagnóstico uma vez e ler o resultado/log.
4. **Reverter a linha de diagnóstico** e republicar `nina-reply` no estado atual.

## Garantias

- Nenhuma mensagem é enfileirada ou enviada ao WhatsApp.
- Nenhuma conversa, concessão, atribuição ou evento é criado ou alterado.
- Nenhuma secret é alterada; o valor bruto nunca é logado.
- O fluxo Shopify → WhatsApp permanece intocado.

## Alternativa sem tocar em código

Se preferir zero alteração em `nina-reply`, a opção equivalente é **regravar a secret explicitamente como `true`** (idempotente, sem deploy de código), aceitando que o valor anterior permanece desconhecido.
