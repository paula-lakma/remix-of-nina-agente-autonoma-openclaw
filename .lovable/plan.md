## Confirmação importante

O `POST /894141783645722/subscribed_apps` retornou `{"success": true}` ✅ — o app **Lakma Wpp** agora está inscrito no WABA. Esse era o elo que faltava.

Porém: a tabela `messages` continua **vazia** e a função `whatsapp-webhook` **ainda não recebeu nenhum POST** desde a inscrição. Isso é esperado — Meta só envia eventos a partir do **próximo** evento gerado após a inscrição. Eventos anteriores não são reenviados.

## Próximos passos (na ordem)

### 1. Mande uma mensagem de teste agora

Do seu celular pessoal (ou de qualquer outro número), envie um **"oi"** para o número de WhatsApp conectado ao `phone_number_id 1166218746570352`.

### 2. Eu verifico a chegada

Assim que você confirmar que enviou, eu rodo:
- `whatsapp-webhook` logs → procuro o POST com o payload.
- `SELECT FROM messages` → confirmo o registro.
- `message-grouper` + `nina-orchestrator` logs → confirmo que a resposta da Nina foi enfileirada.
- `whatsapp-sender` logs → confirmo o envio de volta ao lead.

### 3. Se a mensagem ainda não chegar

Verificamos via Graph API (você executa, eu interpreto):

```
GET https://graph.facebook.com/v22.0/894141783645722/subscribed_apps
  Authorization: Bearer <seu_token>
```

A resposta tem que listar o app `Lakma Wpp` com os campos inscritos (precisa conter `messages`). Se vier vazio ou sem `messages`, fazemos:

```
POST https://graph.facebook.com/v22.0/<APP_ID>/subscriptions
  object=whatsapp_business_account
  callback_url=https://<seu-projeto>.functions.supabase.co/whatsapp-webhook
  verify_token=<token>
  fields=messages,message_template_status_update,messaging_handovers
```

### 4. Causa secundária possível (só se nada chegar)

O número `1166218746570352` pode estar:
- Vinculado a outro app/BSP que está consumindo os eventos (Meta entrega só ao app "dono").
- Não registrado no Cloud API (precisa `POST /{phone_number_id}/register` com PIN).

Investigamos isso se o teste do passo 1 falhar.

## O que não vai mudar no código

Nada. O backend (`whatsapp-webhook` → `message-grouper` → `nina-orchestrator` → `whatsapp-sender`) está pronto e funcionando. Estamos apenas destravando a entrega do lado Meta.

**Manda o "oi" agora e me avisa.**
