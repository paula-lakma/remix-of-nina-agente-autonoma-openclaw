# Diagnóstico do clique real em "Não quero receber" (v2) — resultado read-only

O fluxo funcionou de ponta a ponta. Nada foi alterado.

## Respostas

1. O clique chegou da Meta? **SIM** (log do webhook às 19:07:34 UTC, 16:07 de Brasília)
2. type recebido: **button**
3. button.text: **Não quero receber**
4. button.payload: **lakma_mkt_optout_v1**
5. context.id: **wamid.HBgNNTUxNDk5NzgzNTc3NxUCABEYEjIyNTdGOTc5NEM3NzBGRkYzNgA=**
   - Meta inbound id: `wamid.HBgNNTUxNDk5NzgzNTc3NxUCABIYFDNBMkI2QUQzNzVGQUIwNDhGMzI2AA==`
   - timestamp Meta: `1792004852` (2026-10-14 19:07:32 UTC)
   - from / wa_id: `5514997835777`
6. Mensagem inbound salva? **SIM**
   - id `2ced4b2e-9143-4119-9566-61154f60f3bb`, content "Não quero receber", from_type `user` (inbound), status `sent`
   - metadata.button = text "Não quero receber", payload `lakma_mkt_optout_v1`, context_id igual ao outbound
   - created_at 2026-10-14 19:07:35.754 UTC
7. Context bateu com o outbound correto? **SIM** — outbound `465df4d0-c941-43a7-9b5d-924aa1d74a65` (mesmo wamid)
8. template_name encontrado no outbound: **lancamentos_plla_ghkcu_lakma_v2**
9. opted_out criado? **SIM**
   - id `03840bc7-0905-466d-a8c6-79fa31a4ad3d`
   - channel whatsapp / purpose marketing / status opted_out / source whatsapp_template_button
   - occurred_at 2026-10-14 19:07:32 UTC; created_at 19:07:36.032 UTC
   - evidence: inbound_message_id `wamid.HBgNNTUxNDk5NzgzNTc3NxUCABIYFDNBMkI2QUQzNzVGQUIwNDhGMzI2AA==`, button_text "Não quero receber", button_payload `lakma_mkt_optout_v1`, context_id do outbound, template_name v2
   - log: "[Webhook] Opt-out marketing registrado ..."
10. Nina acionada? **NÃO** — nenhum item em message_grouping_queue nem em nina_processing_queue para esse clique; o message-grouper registrou "No messages claimed"; nenhuma mensagem nossa criada na conversa depois do clique.
11. Ponto de falha: **nenhum**. A ausência de resposta no WhatsApp é o comportamento esperado.
12. Correção mínima recomendada: **nenhuma necessária**.

## Observação para próximas etapas (não implementar agora)

Campanhas ainda não filtram pelo estado de consentimento; antes de qualquer disparo de marketing, o envio precisa excluir contatos com opted_out vigente. Isso fica para uma etapa separada, mediante aprovação.
