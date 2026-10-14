# Campanhas WhatsApp: onde bloquear opt-out (auditoria read-only)

Não alterei nada: nenhum código, banco, função, campanha, mensagem ou consentimento.

## 1. Caminho completo do disparo

```text
Tela Campanhas (src/pages/Campaigns.tsx)
  -> monta a audiência no navegador: contacts (até 5000) ou CSV colado
  -> useBroadcasts.create: grava broadcast_campaigns + broadcast_recipients (só telefone + variáveis)
  -> useBroadcasts.start/resume: chama broadcast-processor
broadcast-processor (lotes, chama a si mesmo)
  -> lê broadcast_recipients status=pending
  -> chama send-meta-message por destinatário
send-meta-message
  -> envia DIRETO para a Meta (graph.facebook.com)
```

## 2. Arquivos e funções

- `src/pages/Campaigns.tsx`: monta a audiência (linhas 127-143).
- `src/hooks/useBroadcasts.ts`: cria campanha/destinatários e inicia/retoma.
- `supabase/functions/broadcast-processor/index.ts`: processa os destinatários.
- `supabase/functions/send-meta-message/index.ts`: faz o envio à Meta.

Respostas diretas às perguntas 2-4: Campanhas **não criam `messages`, não usam `send_queue` e não chamam `whatsapp-sender`**. Esse caminho é usado pelo atendimento, rastreio e retomada, e fica de fora. Também não existe agendamento automático de campanhas no banco.

Só existe um caminho que dispara Campanhas: `broadcast-processor` (iniciado por "start" ou "resume", ou por ele mesmo). `send-meta-message`, porém, pode ser chamada diretamente.

## 3. Ponto recomendado de bloqueio

O bloqueio deve ficar no `broadcast-processor`, imediatamente antes de chamar `send-meta-message`, para cada destinatário. Como Campanhas não criam mensagem nem fila, esse é o último ponto antes da Meta. Ele também cobre campanhas antigas, a retomada de campanhas pausadas e destinatários vindos de CSV.

- O destinatário opted_out é marcado `status='skipped'` com `error_message='opted_out'` e não é enviado.
- O contador `failed_count` não sobe.
- Um destinatário marcado assim nunca volta a `pending`. O processador só lê `pending` e não existe retry automático, então ele não será reenviado.

Um filtro na tela pode existir como aviso extra, mas não serve como proteção: a tela pode ser contornada e o CSV traz números que não estão em `contacts`.

## 4. Regra do estado atual

- Ligação: `contact_consents.contact_id` -> `contacts.id`. O destinatário só tem telefone, então é preciso localizar o contato pelo telefone normalizado (`normalize_br_phone`, que já existe e aceita o formato antigo sem o 9).
- Estado atual: a view `contact_consent_current` já existe. Ela usa `DISTINCT ON (contact_id, channel, purpose) ORDER BY occurred_at DESC, created_at DESC`. Recomendo acrescentar `id DESC` como último desempate. Hoje não há empates (0), mas sem esse critério um empate exato teria resultado indefinido.
- Bloquear somente quando o estado atual for `channel='whatsapp'`, `purpose='marketing'` e `status='opted_out'`.
- Ficar sem registro **não** significa opted_in. Esta etapa só bloqueia opted_out, sem passar a exigir opted_in. Hoje existem 0 opted_in, então exigir opted_in bloquearia todos. Essa decisão fica separada.
- Se a consulta de consentimento falhar, o destinatário não é enviado (falha fechada) e permanece pendente.
- Se o telefone corresponder a mais de um contato e qualquer um deles estiver opted_out, o envio é bloqueado.

## 5. Quantas funções alterar

Uma: `broadcast-processor`. A migration seria apenas opcional, para incluir o desempate `id` na view. `send-meta-message` não muda, para não afetar outros usos.

## 6. Campanhas já existentes

Existem 0 campanhas e 0 destinatários pendentes. Mesmo assim, como a regra vale no momento do envio, campanhas criadas antes também seriam filtradas.

## 7-10. Audiência atual (somente leitura)

- Audiência bruta, conforme a tela carrega hoje (contatos com telefone): **818**
- Com estado atual opted_out: **1**
- Após a exclusão: **817**
- 5514997835777: **SIM**, opted_out desde 14/10 19:07:32 UTC. Existe um único contato com esse telefone, e ele seria excluído.

## 11. Riscos de regressão

- Mensagens operacionais (rastreio, pedido_enviado, retomada da Letícia, humano, dermo, Nina, UTILITY, mensagens individuais) passam por `whatsapp-sender` ou outros fluxos. A mudança fica só em `broadcast-processor`, então elas não são afetadas.
- Campanhas hoje também enviam modelos UTILITY e texto livre. A regra combinada bloqueia opted_out em **todas** as campanhas, já que campanhas são marketing. Se preferir bloquear só modelos MARKETING, isso precisa ser decidido.
- Risco à parte, encontrado nesta auditoria: `send-meta-message` envia direto à Meta e, pela leitura, não exige sessão. Quem chamar essa função diretamente consegue contornar o filtro. Recomendo uma etapa separada para restringir essa função a chamadas internas.
- Nova pendência: o telefone vindo do CSV precisa ser normalizado antes de buscar o contato.

## 12. Build mínimo recomendado

1. Em `broadcast-processor`: antes de cada envio, normalizar o telefone, buscar o estado atual de whatsapp/marketing e, se for opted_out, marcar `skipped/opted_out` sem chamar `send-meta-message`. Se a consulta falhar, não enviar.
2. Opcional: migration ajustando a view com o desempate `id DESC`.
3. Testes da regra: opted_out é pulado; sem registro é enviado; opted_in posterior a opted_out é enviado; erro na consulta não envia; telefone sem o 9 é reconhecido.
4. Publicar somente `broadcast-processor`.
5. Etapa futura separada: proteger `send-meta-message`.

## 13. Confirmação

Somente leituras. Nada foi alterado, publicado, criado ou enviado.
