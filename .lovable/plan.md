# Auditoria: ordem dos status das mensagens do WhatsApp (somente leitura)

Data: 05/10/2026. Nada foi alterado.

## 1. Comportamento atual do webhook
Para cada item de `statuses[]`, a função que recebe os avisos do WhatsApp faz uma única atualização em `messages`, buscando pela `whatsapp_message_id`:
- `sent`: grava `status='sent'`.
- `delivered`: grava `status='delivered'` + `delivered_at = agora` (hora do servidor).
- `read`: grava `status='read'` + `read_at = agora`.
- `failed`: grava `status='failed'` (e, desde o Passo A, `metadata.whatsapp_failure`).
Não lê o status atual, não compara horários e não usa o horário da Meta: **o último aviso a chegar sempre ganha**. Se o aviso chegar antes da mensagem estar gravada, ele é perdido sem erro.

## 2-3. Horário do evento da Meta
- Pela documentação da Meta, cada item de `statuses[]` traz `timestamp` (segundos Unix, em texto). O código não usa esse campo e **não o salva**. O aviso completo só vai para o log da função, que é temporário.
- Esse horário serviria para rejeitar avisos antigos, mas tem precisão de segundos: `sent` e `delivered` costumam ter o mesmo segundo. Por isso o desempate precisa usar também a ordem natural (sent < delivered < read).

## 4. Casos reais fora de ordem (mensagens enviadas pela loja/Nina)
| Situação | Quantidade | Explicação provável |
|---|---|---|
| Status `sent`, mas com `delivered_at`/`read_at` preenchido | **73** (68 Nina, 5 equipe; 19 com leitura) | Um `sent` atrasado chegou depois do `delivered`/`read` e rebaixou a mensagem |
| Status `delivered`, mas com `read_at` preenchido | **10** | Um `delivered` atrasado chegou depois do `read` e rebaixou a mensagem; em 9 delas o `delivered_at` ficou depois do `read_at`, pois foi regravado |
| Status `failed` com `delivered_at`/`read_at` | **0** | — |
| Status `delivered`/`read` com `whatsapp_failure` | **0** | O registro só existe desde o Passo A |
| `read_at` antes de `delivered_at` | 9 (as mesmas acima) | Mesma causa |
Total confirmado: **83 mensagens rebaixadas**. Nenhum caso envolve `failed`.

## 5-6. As 27 (e todas as 56) falhas
Confirmado de novo: nenhuma falha tem `delivered_at` ou `read_at`. Também não há nenhum sinal de entrega antes ou depois. As 27 continuam válidas como não entregues.

## 7. Regra de precedência recomendada
Ordem natural: `sent (1) < delivered (2) < read (3)`; `failed` é um estado terminal à parte.
1. **Mesmo status repetido**: não faz nada. Não regrava `delivered_at`/`read_at` nem o motivo da falha.
2. **sent / delivered / read**: só aplica se for de nível maior que o atual. Um nível menor nunca rebaixa, mesmo que chegue depois. Os horários ficam fixos na primeira vez em que são gravados.
3. **failed chegando com a mensagem já delivered/read**: o status **não** muda, porque já existe prova de entrega. O motivo é guardado assim mesmo, marcado como "ignorado".
4. **delivered/read chegando com a mensagem em failed**: aceito **só se** o horário da Meta for maior que o da falha. Para isso, o horário da Meta precisa estar salvo. Caso contrário, fica `failed` e o aviso é registrado para análise manual. A Meta normalmente não "desfalha" uma mensagem, então esse caso deve ser raro.
5. **Aviso mais antigo que o último já processado** (pelo horário da Meta): ignorado, exceto quando é um nível maior, como `read` atrasado depois de `delivered`. Esse é seguro aplicar.

## 8. Precisa de migration?
**Não.** O horário da Meta pode ficar em `metadata.whatsapp_status = { last_status, last_ts, failed_ts? }`, gravado junto com a atualização. As mensagens antigas não têm esse dado. Para elas, a regra usa só a ordem natural (itens 1-3), que já resolve os 83 casos daqui para frente.

Atenção: ler e depois gravar abre uma janela de disputa entre dois avisos simultâneos. Mitigação sem migration: fazer a gravação condicional, ou seja, só atualizar se o status no banco ainda for o lido antes. Se mudou, ler de novo e repetir uma vez.

## 9. Impacto na prioridade
- Hoje a prioridade só olha `failed`. Os rebaixamentos encontrados (para `sent`/`delivered`) **não** geram falso "aguardando" nem falso ALTO.
- Risco futuro: um `failed` atrasado depois de `read` marcaria como não entregue uma resposta que o cliente leu, o que daria falso "aguardando" e falso ALTO. Nenhum caso real hoje, mas a regra 3 impede.
- A tela mostra um check errado nas 83 rebaixadas (um check em vez de dois). É só visual.

## 10. Arquivos que mudariam
- `supabase/functions/whatsapp-webhook/status.ts` (novo, função pura `decideStatusUpdate(atual, aviso)`).
- `supabase/functions/whatsapp-webhook/index.ts` (usa a decisão e faz gravação condicional).
- `src/__tests__/whatsapp-status-order.test.ts` (novo).
Sem mudanças em sender, fila, prioridade, Chat ou Nina.

## 11. Testes
Um teste para cada caso: repetido sem efeito; sent→delivered→read normal; delivered depois de read é ignorado; sent depois de delivered é ignorado; failed depois de read mantém read e guarda o motivo; read depois de failed é aceito só com horário maior; read depois de failed sem horário mantém failed; aviso antigo pelo horário é ignorado; horários de entrega/leitura não são regravados; disputa simultânea (a gravação condicional falha e repete).

## 12. Riscos
- Os 83 históricos continuam rebaixados. Corrigi-los seria um passo separado, se você quiser: subir para `delivered`/`read` com base nos horários já gravados.
- Avisos que chegam antes da mensagem estar gravada continuam perdidos. Isso fica fora deste escopo.
- O horário da Meta tem precisão de segundos. O desempate pela ordem natural cobre isso.

## 13. Plano mínimo de Build (após aprovação)
1. Criar a função pura de decisão com as regras 1-5 e os testes acima.
2. Ligar a decisão no webhook, com gravação condicional e o horário da Meta em `metadata.whatsapp_status`. Manter o Passo A.
3. Rodar os testes, a suíte completa e a verificação de tipos. Republicar só a função que recebe os avisos do WhatsApp.
4. Conferir que nenhuma mensagem histórica foi alterada.
Não corrigir históricos, não mexer na prioridade e não começar o Passo B da janela de 24 h.
