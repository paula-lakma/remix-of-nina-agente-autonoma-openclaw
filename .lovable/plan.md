# Auditoria: mensagens da equipe com falha no envio (somente leitura)

Data: 05/10/2026. Nada foi alterado, reenviado ou publicado.

## 1-4. Números
- Total failed (humanas): **27** em **25 conversas**.
- Por origem:
  - Letícia / expedição (evento `expedicao_reply`): **12** mensagens, **9** conversas.
  - Parcerias (`parcerias_reply`): **1**.
  - Dermoconsultora: **0**.
  - Chat completo/admin (texto livre): **0**.
  - Aviso automático de rastreio (envio manual, template `pedido_enviado_correios` 9 / `pedido_enviado_jadlog` 5): **14** — não são respostas.
- Das 9 conversas da Letícia, **7** continuam com acesso ativo dela: c1752737, 908c93e1, d552ad3d (2 falhas), a4803156, e8b9dbe0, 0f032230, 256c1034. As outras 2 (120573eb, 3 falhas; c6e8d6da) já voltaram para a Nina, sem acesso.

## 5. Fluxo técnico atual
```text
Letícia responde -> expedicao-chat (expedicao_reply) -> grava em messages (from_type=human)
  -> send_queue -> whatsapp-sender -> Meta aceita e devolve ID (whatsapp_message_id)
  -> send_queue = completed, retry 0
  -> minutos depois Meta manda aviso de status "failed" -> whatsapp-webhook
  -> apenas troca messages.status para failed (o motivo do erro é descartado)
```
- Retry do sender: só existe para erro na hora do envio (Meta recusou na chamada). Falha assíncrona da Meta não gera retry.

## 6. Significado de failed
Nas 27: **a Meta aceitou a mensagem e depois informou que não conseguiu entregar** (opção A — recusa definitiva do WhatsApp, após aceite). Não é erro interno nem retry esgotado: todas têm ID da Meta e fila `completed` com 0 tentativas extras. Uma mensagem failed não vira entregue depois (a Meta não reverte), salvo aviso fora de ordem — nenhum caso com delivered/read registrado.

## 7-8. Causas
- **CAUSA NÃO REGISTRADA em todas as 27**: o webhook não salva o código/descrição do erro da Meta.
- Evidência forte (não confirmada pelo código de erro):
  - **13 respostas de texto livre** (12 Letícia + 1 parcerias): todas enviadas **mais de 24 h depois da última mensagem do cliente** (de 24,2 h a 318 h). Isso bate exatamente com a regra da janela de 24 h do WhatsApp (erro típico 131047 — fora da janela só se pode mandar template).
  - **14 avisos de rastreio (templates)**: a janela não se aplica a template. Causa provável: número do cliente sem WhatsApp/inválido, ou bloqueio do número. Taxa geral de falha desses templates desde 20/09: ~16% (38 de 238). Sem como confirmar.

## 9-10. Retry
- Nenhuma das 27 tem retry pendente; nenhuma será retentada sozinha. **Risco de envio duplicado ao reenviar: zero hoje.**
- Mas reenviar o mesmo texto livre vai falhar de novo pelo mesmo motivo (fora de 24 h), a menos que o cliente fale primeiro ou se use template.

## 11-12. Resposta posterior
- Respondidas com sucesso depois: **0**.
- Cliente voltou a escrever depois da falha: **0**.
- Finalizadas depois: 0 (2 conversas voltaram para a Nina sem finalização formal pela Letícia).
- Ou seja: **13 respostas nunca chegaram e o cliente não sabe**; classificação geral: FAILED E CONTINUA SEM RESPOSTA.

## 13. As 7 conversas da Letícia (todas com acesso ativo, Nina pausada)
| Conversa | Falha em | Horas após cliente | Resposta depois | Cliente voltou | Recomendação |
|---|---|---|---|---|---|
| c1752737 | 28/08 | 28 h | não | não | PENDENTE (via template) |
| 908c93e1 | 09/09 | 24,5 h | não | não | PENDENTE (via template) |
| d552ad3d | 09/09 e 10/09 | 54 h / 80 h | não | não | PENDENTE (via template) |
| a4803156 | 29/09 | 30 h | não | não | PENDENTE (via template) |
| e8b9dbe0 | 29/09 | 142 h | não | não | PENDENTE (via template) |
| 0f032230 | 29/09 | 144 h | não | não | PENDENTE (via template) |
| 256c1034 | 29/09 | 121 h | não | não | PENDENTE (via template) |
Tentativas: 1 em todas. Todas aparecem como aguardando >7 dias / ALTO pela regra do Passo C. Revisão manual extra para c1752737 (mais de 5 semanas).

## 14-15. a4803156 e e8b9dbe0
Ambas: 1 tentativa, Meta aceitou e depois falhou, sem erro salvo, enviadas fora da janela de 24 h, sem entrega posterior, cliente não voltou, com a Letícia (Nina pausada). Estão corretamente "aguardando".

## 16. CRÍTICA 3ed2f596
Nenhuma resposta humana (nem falha, nem sucesso). Só Nina e cliente; última mensagem do cliente 02/10 20:00 (~2,6 dias). Continua aguardando e sem resposta humana. Não alterada.

## 17. O que o atendente vê
No Chat completo, mensagem failed mostra **o mesmo ícone de "enviado" (um check cinza)** — sem ícone de erro, sem texto "falha no envio", sem botão de tentar de novo. A tela da Letícia segue o mesmo padrão. **A Letícia não tem como perceber que o cliente não recebeu.** Causa operacional provável de os casos passarem despercebidos.

## 18-19. Causa raiz provável e riscos
- Causa: Letícia responde depois que a janela de 24 h do WhatsApp fechou; a Meta rejeita; o sistema não guarda o motivo e a tela mostra como enviada.
- Riscos: clientes sem retorno há semanas; reenvio simples repete a falha; a lista de prioridades conta corretamente, mas a atendente não entende por quê.

## 20. Plano de correção (passos separados, cada um com aprovação)
- **A. Registrar o motivo**: `whatsapp-webhook` passa a salvar código/título do erro da Meta em `messages.metadata` (sem migration). Confirma a causa nos próximos casos.
- **B. Aviso antes de enviar**: na tela da Letícia e no Chat, se a última mensagem do cliente tem mais de 24 h, avisar "Fora da janela de 24 h — use um modelo aprovado" e oferecer envio por template, em vez de deixar mandar texto que vai falhar.
- **C. Sinalização visual**: bolha failed com ícone vermelho e "Não entregue"; sem retry automático. Botão "Reenviar" só dentro da janela; fora dela, só por template.
- **D. Pendentes atuais (7 conversas da Letícia + 120573eb/c6e8d6da para revisão)**: retomada pela Letícia via template aprovado de reabertura de conversa — ação manual dela, nada automático.
- **E. Prioridade**: recomendo **sim**, "resposta não entregue" como motivo próprio (ALTO) na regra única `_shared/priority.ts`, só após A e C.
- Avisos de rastreio failed: tratar à parte (não são respostas), depois de A mostrar o código de erro.

Passo D visual de prioridades continua pausado até aprovação.
