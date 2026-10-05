# Janela de 24 h do WhatsApp para respostas humanas — auditoria e plano

Data: 05/10/2026, 12:20 (São Paulo). Somente leitura; nada foi alterado.

## 1-3. Definição da janela
- Fonte: a última mensagem **recebida do cliente** na conversa (`messages.from_type='user'`, campo `sent_at`, que guarda o horário que o WhatsApp informou). Não contam mensagens da Nina, respostas da equipe, templates, mensagens com falha nem handoffs.
- `janela_aberta_até = último sent_at do cliente + 24 h`, em horário absoluto, sem efeito de fuso.
- Aberta se `agora < janela_aberta_até`. Com 23h59 está aberta; com exatamente 24h00 ou 24h01 está **fechada**. A borda é tratada como fechada por segurança, porque a Meta também conta em segundos.
- Mensagem do cliente que chega com atraso: vale o horário dela. Se esse horário ainda estiver dentro das 24 h, a janela está aberta.
- Cliente escreve de novo depois que a janela fechou: ela reabre por 24 h a partir dessa nova mensagem.
- Sem nenhuma mensagem do cliente: a janela é considerada fechada.

## 4. Todos os caminhos de resposta humana
| Quem | Tela | Caminho no servidor | Grava a mensagem / fila |
|---|---|---|---|
| Letícia | tela restrita do Chat | `expedicao-chat` -> `expedicao_reply` | grava a mensagem e a fila juntas, depois aciona o envio |
| Dermoconsultora | tela restrita | `dermo-chat` -> `dermo_reply` | igual |
| Parcerias | tela restrita | `parcerias-chat` -> `parcerias_reply` | igual |
| Admin / Chat completo | `ChatInterface` | **direto do navegador**: grava a mensagem como `processing` e coloca na fila | sem nenhuma função do servidor no meio |
Avisos de rastreio (`send-manual-tracking`) usam template e não são afetados pela janela.

## 5-6. Onde validar
- **Servidor (obrigatório)**: dentro das três funções de banco `expedicao_reply` / `dermo_reply` / `parcerias_reply`, antes de gravar qualquer coisa. Elas já consultam a conversa, então a checagem usa o dado atual do servidor e resolve a corrida "o cliente acabou de escrever". Se a janela estiver fechada, recusam com o erro `whatsapp_window_closed` e o horário de fechamento. Nada é gravado: nem bolha, nem fila, nem falha.
- **Chat completo**: hoje grava direto da tela, então só a tela não basta. Proteção no banco: um gatilho na fila de envio recusa item de texto livre de humano com a janela fechada. Templates ficam liberados. É a única forma de fechar esse caminho sem reescrever o envio do admin. **Precisa de migration.**
- **Envio (última barreira, opcional)**: `whatsapp-sender` não muda nesta etapa.
- **Tela**: aviso logo acima do campo de resposta na tela da Letícia (e das outras áreas) e no Chat completo, calculado a partir da última mensagem do cliente já carregada e atualizado a cada minuto. O servidor continua sendo quem decide.

## 7-10. Templates existentes (cópia local sincronizada com a Meta; todos aparecem como APROVADO)
- Utilidade: `pedido_confirmado`, `pedido_enviado`, `pedido_enviado_correios`, `pedido_enviado_jadlog`. Todos são de pedido/rastreio e **não servem** para retomar atendimento.
- Marketing (15): promoções, catálogo, lançamento, pesquisa, `boas_vindas_nina_lakma`, `retomada_conversa_nina_lakma`, `continuacao_atendimento_nina_lakma`, `acompanhamento_nina_lakma`, `pos_compra_suporte_lakma` e outros. Todos falam em nome da **NINA** ou têm tom comercial, são cobrados como marketing e podem ser bloqueados para quem não aceitou marketing. **Não servem** para a Letícia retomar um caso de entrega.
- Não confirmei ao vivo na Meta. O status vem da última sincronização.

**NÃO EXISTE TEMPLATE ADEQUADO ATUALMENTE.**

Sugestão para submeter à Meta no futuro, em etapa separada: categoria UTILITY, nome `retomada_atendimento_lakma`, pt_BR:
"Olá, {{1}}! Aqui é a equipe da Lakma Dermocosméticos. Estamos retornando o seu atendimento sobre o pedido {{2}}. Quando puder, responda esta mensagem para continuarmos."

## 11. Fluxo com template (quando houver um aprovado)
Botão "Enviar modelo de retomada" -> o mesmo servidor da área (ex.: `expedicao-chat`, ação nova) -> grava a mensagem com `metadata.template_name` e parâmetros (nome do contato, número do pedido) -> fila de envio com `message_type='template'` -> `whatsapp-sender`, que já envia templates (usado no rastreio) -> status pelo webhook já corrigido. A janela só reabre quando o cliente responder.

## 12. Nina
- A Nina responde pelo mesmo sistema de envio, mas só em reação a uma mensagem do cliente, então quase sempre dentro da janela. Respostas que atrasam muito ainda podem falhar.
- O follow-up automático (`nina-stale-leads`) **já respeita** a janela: nunca envia depois de 24 h.
- Existem **29 mensagens da Nina com falha**. O problema não é só de humanos, mas as causas da Nina não foram auditadas aqui. Nada será mudado na Nina.

## 13-16. Situação atual
- Conversas ativas da Letícia: **33, todas com janela FECHADA** (0 abertas). Portanto, todas as prioridades ALTO estão fora da janela.
- CRÍTICA `3ed2f596`: última mensagem do cliente em 02/10 20:00, há ~67 h. **JANELA FECHADA**.
- As 7 com resposta falha, todas **JANELA FECHADA**, com a opção "aguardar o cliente ou um template futuro":
  - c1752737: 938 h
  - 908c93e1: 646 h
  - d552ad3d: 676 h
  - a4803156: 169 h
  - e8b9dbe0: 281 h
  - 0f032230: 283 h
  - 256c1034: 260 h
- `120573eb` (938 h) e `c6e8d6da` (507 h): já com a Nina, **JANELA FECHADA**. Mesma situação.

Consequência prática: com o bloqueio ligado, a Letícia hoje **não consegue responder nenhuma** das suas 33 conversas até haver um template aprovado ou o cliente voltar. Isso é o correto tecnicamente, porque hoje essas respostas falham sem ninguém ver. Mesmo assim, recomendo submeter o template antes ou junto com o bloqueio.

## 17. Migration
Sim, uma, para: (a) checagem da janela nas três funções de resposta; (b) gatilho na fila de envio para o Chat completo. Função auxiliar única `whatsapp_window_open(conversation_id)`, para a regra ficar num lugar só.

## 18. Arquivos
- Migration nova (função da janela, três funções de resposta, gatilho da fila).
- `supabase/functions/_shared/whatsappWindow.ts` + `src/lib/whatsappWindow.ts` (mesma regra pura para a tela). Se for preciso, a tela importa a versão de `_shared`.
- `expedicao-chat`, `dermo-chat`, `parcerias-chat`: traduzir o erro `whatsapp_window_closed` em resposta 409 clara.
- `ExpedicaoChat.tsx` e `ChatInterface.tsx`: aviso + campo desabilitado com a janela fechada.
- `useConversations.ts`: hoje já remove a bolha otimista quando dá erro, mas mostra só "Erro ao enviar mensagem". Passar a mostrar o aviso da janela.

## 19. Testes
Regra pura: 23h59 aberta; 24h00 e 24h01 fechadas; mensagem do cliente atrasada; nova mensagem reabre; Nina, humano, template e falha não contam; sem nenhuma mensagem do cliente fica fechada. Servidor: texto livre com janela fechada é recusado sem gravar mensagem nem fila; com janela aberta, passa; template passa; cliente acabou de escrever, passa. Tela: com o erro, a bolha otimista sai e o aviso aparece.

## 20. Riscos
- Bloquear sem um template aprovado deixa a Letícia sem como agir nos 33 casos. É uma decisão operacional sua.
- O gatilho na fila afeta qualquer item de texto livre de humano. Itens da Nina e templates ficam de fora pelo `from_type` e pelo tipo de mensagem.
- Margem: a Meta pode contar a janela a partir do horário que ela recebeu a mensagem. Uma folga de alguns minutos (ex.: bloquear a partir de 23h55) evita falhas na borda. Recomendo 5 min.

## 21. Plano de Build em etapas (cada uma com aprovação)
1. Regra pura + testes (sem efeito no sistema).
2. Servidor: migration com a função da janela + checagem nas três funções de resposta + gatilho na fila; erro claro nas três funções; testes.
3. Tela: aviso e bloqueio no campo, mensagem de erro correta, sem bolha falsa.
4. Template de retomada: submeter o texto aprovado por você à Meta e, quando ele estiver aprovado, ligar o botão.
5. Só depois: recuperar as 7 conversas e as 33 pendentes.
Não mexer em prioridade, visual CRÍTICO/ALTO, handoff, Nina, Pipeline, CRM, Shopify, Vendas, históricos nem retry.

## Decisões para você
- Ligar o bloqueio (etapas 2 e 3) antes de ter o template, ou esperar o template (etapa 4)?
- Folga de 5 min antes das 24 h: sim ou não?
- Aprovar o texto sugerido do template de retomada (ou ajustar).
