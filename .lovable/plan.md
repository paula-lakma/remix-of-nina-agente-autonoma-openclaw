# Plano de publicação controlada do handoff financeiro

## Diagnóstico confirmado, sem alterações

- A migration `20260825182316` está aplicada no banco de produção.
- A RPC `apply_expedicao_handoff` existe em produção e contém atomicamente:
  - pausa da Nina (`ai_paused = true` e `status = paused`);
  - `human_takeover_required = true`;
  - `handoff_type = financeiro`;
  - resolução da Leticia pelo e-mail `financeiro@lakma.com.br`, papel de conta `expedicao` e membro ativo;
  - atualização de `assigned_user_id` para o membro da Leticia;
  - criação de `conversation_access_grants`;
  - registro de evento `handoff_financeiro`.
- A Leticia resolve hoje para exatamente um membro ativo.
- A função `nina-reply` em produção respondeu ao teste mais recente pela versão 158, mas o ambiente não expõe o código-fonte do bundle implantado para comparação byte a byte.
- No teste real de 20:35/20:36, a conversa permaneceu com Cris, `ai_paused = false`, `human_takeover_required = false`, sem `handoff_type`, sem grant e sem evento financeiro. Assim, a RPC não foi chamada nesse processamento.
- O repositório local está limpo e contém a chamada à RPC em `nina-reply`, protegida por `EXPEDICAO_CHAT_HANDOFF_ENABLED=true` e pela allowlist financeira.
- Importante: a resposta real foi “Seu caso de pedido atrasado já foi encaminhado...”. O diff local reconhece “já encaminhei”, mas não a forma passiva “já foi encaminhado”. Portanto, mesmo o bundle local atual pode reproduzir exatamente o resultado observado; esse teste não permite concluir, isoladamente, que a versão 158 esteja sem o diff.

## Publicação mínima, caso seja aprovada

1. **Não executar migration**
   - A RPC e as tabelas necessárias já estão publicadas e conferidas.

2. **Não publicar frontend**
   - Nenhuma alteração visual ou de rota é necessária para esta etapa.

3. **Não tocar no fluxo Shopify → WhatsApp**
   - Não implantar `shopify-webhook`, remetentes, filas, templates, locks ou secrets relacionados.

4. **Implantar somente `nina-reply`**
   - O deploy dessa função inclui no bundle o módulo compartilhado `_shared/handoff.ts`.
   - Registrar a nova versão/deployment retornada pela plataforma.

5. **Validação pós-publicação sem WhatsApp**
   - Confirmar que a nova versão inicializou sem erro.
   - Confirmar novamente, somente por leitura, que a RPC e a Leticia continuam resolvendo corretamente.
   - Não criar conversa, mensagem, grant ou evento sintético.

## Limite desta publicação

A publicação isolada do bundle atual coloca em produção a chamada atômica à RPC, mas não corrige a lacuna da frase passiva “já foi encaminhado”. Corrigir essa forma textual exigiria uma alteração de código separada e nova aprovação; ela não faz parte deste plano.
