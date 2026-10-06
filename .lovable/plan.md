# Inscrições da página pública da Shopify na Nina (plano, somente leitura — 06/10/2026)

Nada foi alterado: nenhum contato, nenhuma tabela, função, campanha ou configuração da Shopify.

## 1. O que existe hoje

- **Contatos (`contacts`):** 709. O telefone é único no banco (`contacts_phone_number_unique`). 707 estão no formato 55+DDD+número, e **169 deles sem o 9 da frente** (só 8 dígitos depois do DDD). Isso abre risco de a mesma pessoa virar dois contatos (com e sem o 9).
- Já existem `is_blocked`/`blocked_at`/`blocked_reason` (0 bloqueados) e `whatsapp_valid` (vazio).
- **Tipo de cliente (`crm_contact_profiles.contact_type`):** um por contato. Valores permitidos: `profissional_estetica`, `cliente_final`, `distribuidor`, `influenciador`, `outro`. Só 1 contato está preenchido.
- **Consentimento / descadastro:** não existe nada.
- **Ao criar um contato,** um gatilho (`auto_create_deal_on_contact`) abre automaticamente um card no funil de vendas. Uma inscrição pelo site também abriria um card. É preciso decidir se isso é desejado.
- **Proteções de acesso:** contatos e perfis só são lidos e escritos pela equipe logada. Não existe hoje nenhum endereço público que grave contatos. Os endereços públicos atuais (webhooks da Shopify e do WhatsApp) são protegidos por assinatura.
- **Campanhas:** a função de disparo (`broadcast-processor`) envia para listas e não filtra bloqueio, consentimento ou descadastro.

## 2. Modelo recomendado: tabela separada de consentimentos

Comparação:
- **Campos dentro do contato:** é simples, mas guarda só o último estado e perde o histórico (quem aceitou, quando, com qual texto, quando saiu).
- **Tabela separada (recomendada):** cada aceite ou saída vira um registro que nunca é apagado. O estado atual é sempre o registro mais recente por contato e canal. Serve de prova para a LGPD e para a Meta.

Tabela nova `contact_consents`:

| Campo | Exemplo |
|---|---|
| contact_id | contato |
| channel | `whatsapp` |
| purpose | `marketing` |
| status | `opted_in` / `opted_out` |
| occurred_at | data e hora |
| source | `shopify_site`, `whatsapp_keyword`, `manual` |
| consent_version | `v1-2026-10` |
| consent_text | texto exato do checkbox aceito |
| evidence | página, IP resumido, navegador (sem dados excessivos) |
| created_by | equipe, quando manual |

**Precisa de mudança no banco:** sim. São a tabela nova, as regras de acesso (leitura só para admin e gerente; gravação só pelo servidor) e uma visão do "estado atual" por contato.

## 3. Endereço de recebimento

Uma função nova, `shopify-signup`, pública e chamada pela página da Shopify. Ela recebe nome, telefone, tipo de cliente, aceite e versão do texto, e passa por estas etapas:

1. **Validação:** nome com 2 a 80 caracteres; tipo só `profissional_estetica` ou `cliente_final`; aceite obrigatório e igual a "sim"; versão do texto conhecida. Fora disso, a inscrição é recusada.
2. **Normalização do telefone:** só dígitos, 55 na frente, DDD válido e celular com 9 (11 dígitos depois do 55). Telefone fixo ou inválido é recusado com a mensagem "Informe um WhatsApp válido".
3. **Antirrobô:** verificação Cloudflare Turnstile, feita no servidor. Precisa de uma chave secreta, que você criaria na Cloudflare.
4. **Limite de envios:** até 5 por telefone por dia e um teto por endereço de internet, com registro das tentativas.
5. **Origem permitida:** só o domínio da loja.
6. **Resposta igual em todos os casos:** "Inscrição recebida", para não revelar se o número já existia.

## 4. Deduplicação

- Procura o contato pelo telefone normalizado **e também pela versão sem o 9**, por causa dos 169 antigos sem o 9.
- Se achar, usa esse contato. Se achar os dois formatos, usa o mais antigo e não cria outro.
- Inscrição repetida pelo mesmo número não duplica o contato. Só registra um novo aceite se o último estado for "saiu" ou se a versão do texto for nova. Caso contrário, nada muda.

## 5. Contato existente

- Nada é apagado nem sobrescrito: nome, histórico, conversa e funil ficam como estão.
- O nome só é preenchido se estiver vazio.
- Registra o novo aceite.
- **Tipo de cliente:** só é preenchido se estiver vazio. Se já houver um tipo, nunca é trocado pelo site (ex.: um "distribuidor" não vira "cliente final"). Se o site disser "profissional" e o atual for "cliente final", também não troca automaticamente: o caso fica marcado para revisão da equipe.

## 6. Contato novo

- Cria o contato com nome, telefone normalizado e a etiqueta `origem:shopify_site`.
- Cria o tipo de cliente e registra o aceite com a origem `shopify_site`.
- Card no funil: decidir (ver abaixo).

## 7. Descadastro

- Pelo WhatsApp: mensagem do cliente com "sair", "parar", "não quero receber", "remover meu número" grava um registro de saída e envia uma confirmação curta.
- Manual: botão "Descadastrar" no contato, só para a equipe.
- Descadastro **sempre vence** um aceite anterior. Um novo aceite só vale se vier depois, com nova inscrição.

## 8. Campanhas (futuro, sem mexer agora)

Para uma pessoa poder receber um disparo de marketing, todas estas condições valem:
- último estado WhatsApp marketing = `opted_in`;
- sem saída posterior;
- não bloqueada;
- telefone válido;
- dentro do segmento escolhido: Profissional da estética, Cliente final ou Todos os elegíveis.

O filtro roda **no servidor**, na hora do disparo, e não só na tela. Antes de enviar, a tela mostra quantos foram selecionados, quantos foram excluídos e por quê.

## 9. Arquivos que mudariam

- Nova migration: `contact_consents`, visão do estado atual, regras de acesso e registro de tentativas da inscrição.
- Nova função: `supabase/functions/shopify-signup/index.ts` e regra pura em `_shared/signup.ts`, com testes.
- Depois: `whatsapp-webhook` (descadastro), `ContactProfile.tsx` (mostrar consentimento e o botão de descadastro), e `broadcast-processor` + `Campaigns.tsx` (filtro).

## 10. Primeiro Build recomendado

1. Tabela de consentimentos + função `shopify-signup` com validação, Turnstile, limite de envios e deduplicação.
2. Testes com casos reais simulados (número com e sem o 9, repetido, tipo conflitante, aceite ausente, robô).
3. Um teste de ponta a ponta com um número seu, e só depois a página da Shopify passa a usar o endereço.
4. Descadastro e Campanhas ficam para os Builds seguintes.

## Decisões para você

1. Uma inscrição nova pelo site deve abrir card no funil de vendas, como acontece hoje com qualquer contato novo?
2. Você aceita criar a chave do Cloudflare Turnstile (gratuita) para a proteção antirrobô?
3. Texto exato do checkbox e versão: "Quero receber novidades, lançamentos, promoções e conteúdos da Lakma Dermocosméticos pelo WhatsApp." como `v1`?
