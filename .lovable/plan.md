# Webhook Shopify → aviso de status no WhatsApp

Objetivo: receber qualquer JSON de pedido/fulfillment da Shopify, guardar o payload bruto, normalizar os campos úteis e disparar uma mensagem de template no WhatsApp do cliente com o novo status.

## Como vai funcionar

1. A Shopify chama uma URL pública nossa (`shopify-webhook`) com um token secreto na query string.
2. O JSON chega inteiro e é gravado como veio, sem validação de formato — nada é perdido mesmo que a Shopify mude o payload.
3. Um normalizador extrai: telefone do cliente, nome, número do pedido, status, valor, transportadora e código/link de rastreio (tentando vários caminhos possíveis do JSON).
4. O contato é buscado pelo telefone (normalizado para o formato BR/E.164). Se não existir, criamos contato + conversa novos.
5. A mensagem é enfileirada em `send_queue` como template aprovado da Meta, com as variáveis preenchidas, e o `whatsapp-sender` entrega.
6. A mensagem também aparece no Chat ao Vivo, como mensagem enviada pela Nina.

## Eventos cobertos

- `orders/create` e `orders/paid` → "pedido confirmado"
- `fulfillments/create` e `fulfillments/update` → "pedido enviado" com rastreio
- Qualquer outro tópico: gravado no log, sem envio.

Deduplicação por ID do evento Shopify para não mandar a mesma mensagem duas vezes.

## Templates da Meta

Precisam ser criados e aprovados na Meta (posso deixá-los cadastrados na aba Templates para você submeter):

- `pedido_confirmado` — variáveis: nome, número do pedido, valor
- `pedido_enviado` — variáveis: nome, número do pedido, transportadora, código de rastreio

Enquanto não houver aprovação, o evento fica registrado com status "aguardando template" e não é enviado.

## Tela de acompanhamento

Uma seção simples em Configurações listando os últimos eventos recebidos: data, tópico, pedido, telefone, status do envio e erro (quando houver), com o JSON bruto visível para inspeção — é o que vai permitir ajustar o mapeamento assim que os payloads reais chegarem.

## Detalhes técnicos

- Nova tabela `shopify_events`: `id`, `topic`, `shopify_event_id` (único), `order_number`, `phone_number`, `contact_id`, `conversation_id`, `raw_payload jsonb`, `normalized jsonb`, `send_status`, `error_message`, `created_at`. RLS + GRANTs: leitura para `authenticated` (admin/manager), escrita só `service_role`.
- Nova edge function `shopify-webhook` (`verify_jwt = false`): valida `?token=` contra o secret `SHOPIFY_WEBHOOK_TOKEN`, responde 200 rápido e processa em background (`EdgeRuntime.waitUntil`). HMAC fica preparado (leitura do header `X-Shopify-Hmac-Sha256`) mas desativado até você configurar o segredo.
- Módulo `_shared/shopify.ts`: normalização do payload + normalização de telefone (dígitos, DDI 55, 9º dígito).
- Enfileiramento reaproveita o fluxo atual: insert em `messages` + `send_queue` com `message_type = 'template'` e `metadata` contendo `template_name`, `template_language`, `template_variables` (mesmo formato usado por `send-meta-message`).
- Um secret novo será solicitado: `SHOPIFY_WEBHOOK_TOKEN`.
- Nada do fluxo da Nina (orchestrator/brain) é alterado; o webhook não aciona a IA.
