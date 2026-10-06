# Auditoria: contato 710 (somente leitura, nada alterado)

## Resultado
1. **Contato:** ANA PAULA, telefone com final 7804 (id `c9f4d91e-346b-48e4-8f15-134838d4b678`).
2. **Criado em:** 06/10/2026 às 15:34:37 (horário de São Paulo), ou 18:34:37 UTC.
3. **Origem:** envio manual de rastreio pela tela "Envio de Rastreio", feito por um usuário com papel `rastreio`. Ele foi registrado às 15:34:36 com o pedido #32359, Correios, código AP570017871BR e o modelo `pedido_enviado_correios`. O número ainda não existia na base, então o fluxo criou o contato e a conversa para registrar o aviso.
4. **Classificação:** fluxo já existente de rastreio manual. Não veio de mensagem do cliente no WhatsApp nem de cadastro manual. **Não** veio da `shopify-signup`: o contato tem 0 consentimentos, 0 marcações para revisão e não tem a etiqueta `origem:shopify_site`.
5. **Card criado junto:** `2e342b08-44ca-4fcb-a416-faa6da6c7db6` ("ANA PAULA"), na primeira etapa do funil, no mesmo instante. Isso foi feito pela regra automática que cria um card para todo contato novo que não vem do site.
6. **Conclusão:** é o comportamento normal da operação e não tem relação com o Build. O único rastro do teste desta etapa é 1 tentativa anônima de inscrição, guardada apenas como código protegido e recusada pelo Turnstile. Ela não criou contato, card, consentimento nem mensagem.

## Observação (não faz parte do pedido)
A Meta recusou depois o aviso de rastreio enviado para esse número: a mensagem está como `failed`. O motivo pode ser consultado se você quiser.

## Próximo passo
Nenhuma ação necessária. Pode seguir para a página real da Shopify.
