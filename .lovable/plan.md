# Correção do handoff de rastreio para a Letícia

## Diagnóstico confirmado

No teste real de **“Meu pedido tá atrasado”**, o run OpenClaw `46ab2274-10b1-4faf-be1f-361df86dcb37` chamou `nina-reply` somente com `conversation_id`, `run_id`, `content` e `status`. A resposta enviada não continha `[[HANDOFF:where_is_my_order]]` nem `handoff_reason`.

Por isso, `nina-reply` não recebeu um motivo estruturado. O fallback classificou o **texto de saída da Nina** primeiro; como ele dizia apenas “verificar o status do pedido”, não houve correspondência. A mensagem original do cliente só é classificada pelo fallback quando o texto da Nina também contém uma das expressões estritas de confirmação. A frase “Já encaminhei...” não corresponde hoje a esse filtro. Consequência: `applyHandoff` não foi chamado, então nada pausou a Nina, persistiu o handoff, atribuiu Letícia ou criou a concessão.

O estado real confirma esse caminho: a resposta foi enviada normalmente, mas não existe evento de handoff dessa tentativa, a conversa segue `status=nina` e `ai_paused=false`, e não há concessão ativa.

Letícia está corretamente associada ao fluxo: papel `expedicao`, membro ativo da equipe, função **Financeiro** e e-mail de destino configurado. A tela não filtra por texto “financeiro”; ela lista somente a interseção de:

- concessão ativa para o `team_member_id` da usuária autenticada;
- conversa atribuída ao mesmo membro;
- motivo presente na allowlist financeira/rastreio;
- papel autenticado `expedicao`.

Logo, a lista vazia é consequência da ausência da concessão/atribuição, não de associação incorreta da Letícia.

## Alteração proposta

1. **Classificar a mensagem original do cliente no backend** quando nenhum motivo estruturado chegar, sem depender da redação da resposta da Nina.
2. Manter a prioridade: `handoff_reason` explícito → marcador válido do agente → fallback sobre a última mensagem do cliente.
3. Aplicar o fallback do cliente somente quando a resposta da Nina confirmar inequivocamente o encaminhamento, ampliando a confirmação para formas já usadas no teste, como “já encaminhei”. Perguntas ou mensagens ambíguas continuam sem handoff.
4. Para um motivo permitido como `where_is_my_order`, executar a operação de handoff e concessão como uma única RPC transacional: validar motivo/destino, resolver Letícia no servidor, pausar Nina, persistir campos, atribuir responsável, criar evento e ativar concessão. Qualquer falha deve reverter tudo e impedir estado parcial.
5. Preservar integralmente os destinos dermatológicos e não tocar no fluxo Shopify → WhatsApp.

## Diff funcional necessário

### `supabase/functions/nina-reply/index.ts`

```diff
- target = detectHandoffTarget(content) ?? detectHandoffTarget(leadText);
+ // Se não veio motivo estruturado, a intenção é classificada pela mensagem
+ // original do cliente; o texto da Nina apenas confirma que o handoff ocorreu.
+ target = detectHandoffTarget(leadText);
```

```diff
- const confirmedHandoffRegex = /\bvou\s+(deixar|encaminhar|passar)\b|.../i;
+ const confirmedHandoffRegex = /\b(?:vou|j[áa])\s+(?:deixar|encaminhar|passar|deixei|encaminhei|passei)\b|.../i;
```

```diff
- const handoffResult = await applyHandoff(...);
- if (flag && source === "structured" && allowlisted) {
-   await rpc("internal_grant_expedicao_access", ...);
- }
+ if (flag && allowlisted && destination === "financeiro") {
+   await rpc("apply_expedicao_handoff", { conversa, motivo, origem, trecho });
+ } else {
+   await applyHandoff(...); // destinos não-expedição permanecem inalterados
+ }
```

O fallback passa a poder gerar concessão para um motivo canônico detectado da mensagem original. A segurança deixa de depender de `source === "structured"` e passa a depender da allowlist fechada, da confirmação explícita da resposta e da RPC que resolve o responsável no servidor.

### Migration/RPC `apply_expedicao_handoff`

```diff
+ validar motivo com is_expedicao_handoff_reason
+ bloquear a conversa FOR UPDATE
+ resolver membro ativo financeiro@lakma.com.br com papel expedicao
+ atualizar conversations:
+   ai_paused=true, human_takeover_required=true, status='paused',
+   handoff_type='financeiro', handoff_reason=<motivo>,
+   human_status='aguardando_humano', assigned_user_id=<Letícia>
+ revogar concessões anteriores e inserir/reativar a concessão da Letícia
+ inserir conversation_handoff_events
+ retornar responsável e concessão
```

### `skills/nina/scripts/nina_reply.sh` e instruções OpenClaw

```diff
+ aceitar --handoff-reason <motivo>
+ incluir handoff_reason no JSON enviado ao nina-reply
+ instruir a skill a repassar o motivo canônico ao confirmar um encaminhamento
```

Esse ajuste melhora o caminho principal estruturado, enquanto o fallback corrigido protege instâncias que ainda não sincronizaram a skill.

### Testes

Adicionar testes para o fluxo completo, não apenas para `detectHandoffTarget`:

- “Meu pedido tá atrasado” + “Já encaminhei...” → pausa, atribui Letícia e cria concessão.
- rastreio sem atualização/código inválido/onde está pedido → mesmos efeitos.
- “problema no pedido” → não encaminha.
- pergunta “você quer que eu encaminhe?” → não encaminha.
- pele, lesão, alergia, procedimento e orientação dermatológica → permanecem com dermoconsultora e nunca concedem acesso à expedição.
- falha ao criar concessão → nenhuma atualização parcial na conversa.
- Shopify e envio automático de rastreio permanecem fora do escopo.

## Validação controlada após aprovação

Executar somente teste sintético e um teste controlado do chat: confirmar pausa, campos da conversa, atribuição à Letícia, evento, concessão, visibilidade na consulta da tela e revogação ao finalizar. Limpar os dados sintéticos ao final.
