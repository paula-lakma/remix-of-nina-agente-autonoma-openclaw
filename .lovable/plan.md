# Inscrições Shopify: publicar a função e testar de verdade

## Situação agora (confirmado nesta leitura)

- Os dois valores estão salvos no cofre do projeto:
  - `TURNSTILE_SECRET_KEY` — inserido por você pela interface segura (o valor nunca passou pelo chat);
  - `SIGNUP_ALLOWED_ORIGINS` — exatamente `https://lakma.com.br,https://www.lakma.com.br`.
- A função `shopify-signup` já está publicada, mas foi publicada **antes** desses valores existirem. Ela pode continuar recusando tudo com "Inscrições ainda não disponíveis" até ser republicada.
- Nenhuma inscrição foi aceita até hoje. Nenhuma página da Shopify usa o endereço. Nenhuma mensagem foi enviada. Os 709 contatos seguem intactos.

## O que será feito (Build)

1. **Republicar a função** `shopify-signup`, para que ela enxergue os dois valores recém-salvos.
2. **Prova de que os valores foram lidos:** enviar um teste com um código do Turnstile propositalmente inválido. A resposta esperada passa a ser "Não foi possível confirmar que você não é um robô" (recusa do Turnstile) e **não** mais "Inscrições ainda não disponíveis".
3. **Teste real com um número seu:** preciso da **chave pública** do widget do Turnstile (essa é pública, pode colar no chat). Com ela monto uma página provisória **fora do projeto**, que gera um código válido, e envio uma inscrição de verdade com o seu WhatsApp.
4. **Conferir o resultado:** contato criado ou reaproveitado (sem duplicar, inclusive se já existir um registro sem o 9), um registro de aceite guardado, **nenhum** card novo no funil, **nenhuma** mensagem na fila de envio.
5. **Limpeza:** remover a página provisória. Os dois valores continuam salvos. Nada é alterado na Shopify, nas Campanhas ou nos modelos.

## Decisões para você

1. **Chave pública do Turnstile** (site key) para o teste real — sem ela não consigo gerar um código válido.
2. **Qual número** usar na inscrição de teste e **qual tipo** declarar: profissional da estética ou cliente final.
3. **Endurecimento opcional (recomendo sim):** hoje a função aceita um código válido do Turnstile independentemente de **onde** ele foi gerado. Posso exigir que o site que gerou o código esteja na lista autorizada.

## Detalhes técnicos

- Leitura dos valores: `supabase/functions/shopify-signup/index.ts` linha 30 (`TURNSTILE_SECRET_KEY`) e linha 15 (`SIGNUP_ALLOWED_ORIGINS`); a recusa 503 acontece na linha 31.
- Republicação: `deploy_edge_functions` só para `shopify-signup`; nenhuma outra função é tocada.
- Teste 2: `POST` com `Origin: https://www.lakma.com.br`, payload válido e `turnstile_token` falso. Esperado: 400 `turnstile_failed`. Isso confirma segredos lidos sem gravar nada.
- Teste 3: página provisória em `/tmp` (fora do projeto) com o widget da chave pública; envio com `Origin` de um domínio autorizado; verificação por leitura em `contacts`, `contact_consents` (via `contact_consent_current`), `crm_contact_profiles`, `deals` e `send_queue`.
- Verificações de não regressão: nenhum card em `deals` para o contato de teste; `messages`/`send_queue` sem itens novos; contagem de contatos cresce em no máximo 1.
- Rodar a suíte de testes (`shopify-signup.test.ts` e as demais) e o typecheck antes de concluir.
- Se o endurecimento for aprovado: validar `hostname` retornado pelo Turnstile contra a mesma lista de origens autorizadas, com teste próprio.
- Atualizar `roadmap.md` com o status desta etapa (só em build).
