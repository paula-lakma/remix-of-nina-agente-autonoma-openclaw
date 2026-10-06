# Diagnóstico: modelo de retomada para o seu número não chegou

Somente leitura. Nada foi reenviado ou alterado.

## Resultado
O sistema funcionou do começo ao fim. A **Meta recusou a entrega por pendência de pagamento na conta WhatsApp Business**.

Motivo devolvido pela Meta (erro 131042, "Business eligibility payment issue"): "Message failed to send because your WhatsApp Business account has unsettled payments."

## O envio exato (06/10, 17:32 de Brasília)
- Conversa `a7b8eddb…`, contato `a9345fc2…`, telefone com final 5777 (55 14 99783-5777)
- Mensagem `1746fd11…`: equipe, modelo `retomada_atendimento_lakma`, pt_BR, {{1}} = "Joao", origem `expedicao_resume`, enviada pela Letícia
- Fila `c06829d5…`: tipo modelo, processada pelo envio em 0,5 s, 0 novas tentativas, sem erro (a Meta aceitou o pedido)
- Evento `expedicao_reply` `f62a9620…` (kind = resume_template), autor Letícia
- Meta deu identificador à mensagem e, 1 segundo depois, avisou `failed` com o erro acima. Sem entrega nem leitura
- Status atual: **failed**, com o motivo guardado

## Por que a tela disse "enviado"
A confirmação aparece quando o sistema entrega o pedido à Meta. A recusa chega segundos depois. Ao recarregar a conversa, a mensagem aparece como "Modelo de retomada enviado pela equipe — falhou".

## Impacto maior
Desde 05/10, 16:40, **62 mensagens** falharam com esse mesmo erro de pagamento. Ou seja, todos os envios da conta (Nina, equipe, avisos) podem estar sendo bloqueados até a pendência ser paga.

## Próximos passos (sem código)
1. Quitar a pendência no painel de cobrança da Meta (Business Manager, Faturamento, conta WhatsApp Business).
2. Depois de pago, a Letícia clica de novo em "Enviar modelo de retomada". Como o envio anterior falhou, o sistema já permite nova tentativa.
3. Opcional, em etapa separada: avisar na tela quando a Meta recusar por pagamento, e reenviar as 62 mensagens que falharam (precisa de aprovação própria).

## Confirmação
Nenhuma mensagem reenviada, nenhum dado, código, função ou modelo alterado.
