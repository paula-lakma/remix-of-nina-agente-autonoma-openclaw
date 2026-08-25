# Correção da detecção de confirmação passiva de handoff

## Objetivo

`isConfirmedHandoffResponse` hoje só reconhece formas ativas ("já encaminhei", "vou encaminhar"). A resposta real do teste — "Seu caso de pedido atrasado já foi encaminhado para o nosso time de atendimento." — não é reconhecida, então o handoff financeiro para a Letícia não é aplicado.

## Mudança (arquivo único)

`supabase/functions/_shared/handoff.ts`, apenas dentro de `isConfirmedHandoffResponse`:

- Adicionar ao padrão de confirmação a forma passiva: `(já )?foi encaminhado/encaminhada`, incluindo variações com sujeito ("seu caso foi encaminhado", "seu atendimento já foi encaminhado"), com e sem acento.
- Manter o bloqueio de perguntas/ofertas: "quer que eu encaminhe?", "posso encaminhar?", "deseja que eu encaminhe?" — ampliando o padrão `askingOnly` para cobrir "posso encaminhar" e frases terminadas em interrogação com verbo no subjuntivo ("encaminhe").
- Nenhuma outra função, regex de classificação, destino ou fluxo é tocado.

## Testes

Ampliar `src/__tests__/handoff-classification-matrix.test.ts` com casos:

Confirmações (true):
- "Seu caso de pedido atrasado já foi encaminhado para o nosso time de atendimento."
- "Seu caso foi encaminhado."
- "Foi encaminhado para o time responsável."

Não confirmações (false):
- "Quer que eu encaminhe?"
- "Posso encaminhar?"
- "Deseja que eu encaminhe seu caso?"

Rodar a suíte local completa e exibir o diff exato antes de qualquer publicação.

## Preservado

- RPC `apply_expedicao_handoff` inalterada.
- Secret `EXPEDICAO_CHAT_HANDOFF_ENABLED` permanece `true`.
- Classificação e roteamento dermatológico inalterados.
- Fluxo Shopify → WhatsApp intocado.
- Nenhum deploy nem publicação nesta etapa.
