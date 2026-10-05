# Auditoria: respostas da Letícia e regra de "mais de 7 dias" (somente leitura)

Dados de 05/10/2026 11:18 (horário de São Paulo). Nada foi alterado.

## 1. Quem é a Letícia no sistema
- Cadastro na equipe: `22222222-0000-4000-a000-000000000004`
- Usuário de acesso: `7faca642-…`
- Papel: `expedicao`
- Ela usa a tela restrita do Chat. Cada resposta dela passa pela mesma função de resposta da expedição.

## 2. Como a resposta dela é gravada
- A mensagem é gravada com `from_type = 'human'`, mas **sem nenhum campo que diga quem enviou**.
- No mesmo momento é criado um evento `expedicao_reply` com o usuário que respondeu e o identificador da mensagem. Esse evento é a prova de que foi a Letícia.
- Encontrado nos dados reais:
  - 32 respostas ligadas à Letícia por esse evento;
  - 1 resposta de dermoconsultora e 1 de parcerias, identificadas da mesma forma;
  - 7 mensagens humanas sem evento, enviadas pelo Chat completo (admin ou equipe); não dá para saber quem enviou;
  - **112 mensagens marcadas como humanas que não são resposta**: são os avisos automáticos de rastreio (modelos "pedido enviado").

**Conclusão:** `from_type` sozinho NÃO é suficiente. Ele mistura respostas reais com avisos automáticos de rastreio e não diz qual pessoa respondeu.

## 3. Definições propostas
- **Resposta humana válida:** mensagem humana que não seja um modelo automático, ou seja, sem `template_name`. Resposta da Nina nunca conta.
  - "Resposta da Letícia" = mensagem ligada a um evento `expedicao_reply` dela.
  - Resposta de outro humano (Chat completo, dermo, parcerias) também encerra a espera, porque o cliente foi atendido por uma pessoa. A pessoa é mostrada só quando há evento.
- **Aguardando Letícia:** a Letícia tem acesso ativo à conversa e existe mensagem do cliente depois da última resposta humana válida e depois da última finalização.
- **Início da espera:** a mensagem MAIS ANTIGA do cliente nesse intervalo. Não é a data do encaminhamento, nem o início da conversa, nem a última mensagem.
- **Mais de 7 dias:** agora − início da espera > 7 dias.
- **Finalização e reabertura:** finalizar remove o acesso da Letícia e a conversa sai da conta. Se o cliente volta, a conversa é reaberta e a contagem parte do primeiro contato depois da última resposta humana ou da finalização. Mensagens antigas já respondidas nunca contam.
- **Contato repetido:** dentro do período de espera, o cliente escreveu de novo mais de 2 horas depois da mensagem anterior dele, sem resposta humana válida no meio. Funciona com os dados reais.

## 4. Nova contagem
| | Antes | Agora |
|---|---|---|
| Conversas ativas com a Letícia | 29 | 33 |
| Aguardando resposta | 19 | 23 |
| Mais de 7 dias | 14 | 18 |
| Contato repetido >2 h | — | 9 |

- A diferença vem toda das 4 conversas históricas encaminhadas hoje: 3 delas têm mais de 7 dias e 1 tem 5 dias.
- **Nenhum falso positivo encontrado.** A conta anterior já tratava qualquer mensagem humana como resposta. Separar os avisos de rastreio e identificar a Letícia pelo evento não mudou o início da espera de nenhuma conversa.

## 5. Exemplos (IDs internos)
- Mais de 7 dias, só a Nina respondeu: `eb54fa34` (52 dias), `1928c6f8` (26 dias), `a03a8d51` (10,7 dias).
- A Letícia respondeu e o cliente voltou depois: `757717a0` (espera conta a partir de 10/09, 24,8 dias) e `e2ece15d` (5,7 dias, fora dos 7).
- Respondida pela Letícia e sem nova mensagem do cliente: `a4803156`, `5f9d35f4`, `e8b9dbe0`. Não estão aguardando.
- Outro humano respondeu pelo Chat completo e o cliente voltou depois: `d0e6ec25` (43,8 dias).
- Aviso de rastreio enviado durante a espera, que corretamente não encerra a espera: `5458a93b`.
- Não apareceu nenhum caso que "parecia >7 dias mas tinha resposta da Letícia".

## 6. Dados, banco e riscos
- Os dados atuais são suficientes. **Não é necessária migration.**
- Riscos:
  1. Os 7 envios do Chat completo não têm autor. Recomendo contá-los como resposta humana válida, sem nome.
  2. Se surgir outro tipo de envio automático marcado como humano sem `template_name`, ele seria contado como resposta. Hoje não existe nenhum.
  3. Uma resposta da Letícia que falhou ao enviar ainda conta como resposta. Opcional: ignorar mensagens com status `failed`.
  4. Mensagens muito antigas, de antes do encaminhamento, só contam se nunca houve resposta humana. Foi o que aconteceu em `eb54fa34` e `99b9ef38`, que de fato nunca tiveram resposta.

## 7. Recomendação para o futuro passo de prioridade
- Calcular na própria tela, só leitura, como foi feito na lista de exceções, usando as definições acima.
- Ignorar avisos com `template_name` e, opcionalmente, mensagens com status `failed`.
- ALTO por atraso: início da espera há mais de 7 dias.
- ALTO por contato repetido: a regra de mais de 2 horas acima.
- Testes com estes exemplos reais: `eb54fa34`, `757717a0`, `a4803156`, `5458a93b` e `d0e6ec25`.
