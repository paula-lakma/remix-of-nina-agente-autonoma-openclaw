# Snippet do formulário de inscrição (página Shopify)

## Objetivo

Entregar um bloco de código único, pronto para colar na página pública da Lakma, que envia inscrições para a função já publicada. Nenhuma alteração no app, nas funções, no banco ou na Shopify.

## O que será entregue

Um arquivo só: `shopify-signup-form.html` — HTML + estilo + script juntos, com o widget de verificação da Cloudflare embutido. Cópia também no painel de arquivos para download.

O formulário tem: campo de nome, campo de WhatsApp (com máscara brasileira), escolha entre "Profissional de estética" e "Cliente final", caixa de aceite com o texto de consentimento exato já aprovado, o selo de verificação e o botão de enviar. Erros aparecem na própria tela, com a mensagem devolvida pelo servidor.

## Como funciona o envio

```text
POST https://bfuuucuzebtkregbycqd.supabase.co/functions/v1/shopify-signup
Content-Type: application/json
```

Corpo enviado pelo formulário:

```text
{
  "name": "nome digitado",
  "phone": "telefone digitado",
  "contact_type": "profissional_estetica" ou "cliente_final",
  "consent_accepted": true,
  "consent_version": "v1",
  "turnstile_token": "token gerado pelo widget"
}
```

Resposta de sucesso: sempre "Inscrição recebida." — sem revelar se o número já existia.

## Regras que a página precisa respeitar

- A página precisa estar publicada em `lakma.com.br` ou `www.lakma.com.br`. Em endereço de visualização da Shopify (`*.myshopify.com`) ou em qualquer outro domínio, o envio é recusado.
- O widget de verificação já existente precisa ter exatamente esses dois nomes de máquina na lista de permitidos; se o widget for outro, a inscrição é recusada.
- A chave pública do widget entra nosnippet no lugar marcado `SUA_SITE_KEY_PUBLICA`. A chave secreta já está guardada e não aparece aqui.
- Limites de proteção: 5 tentativas por número por dia e 30 por rede por hora. Acima disso aparece "Muitas tentativas. Tente novamente mais tarde."

## Texto de consentimento (exato)

```text
Quero receber novidades, lançamentos, promoções e conteúdos da Lakma Dermocosméticos pelo WhatsApp.
```

Este é o texto da versão `v1`, já gravado como prova de aceite. O snippet mostra exatamente estas palavras, sem reescritas.

## Como colar na Shopify

1. Painel da Shopify → Loja online → Páginas → adicionar página (ex.: "Novidades no WhatsApp").
2. No editor, abrir a opção de HTML e colar o conteúdo do arquivo.
3. Substituir `SUA_SITE_KEY_PUBLICA` pela chave pública do widget já existente.
4. Publicar a página e conferir em `https://www.lakma.com.br/...`.
5. Se o editor da página remover o script de verificação, usar uma seção do tema no mesmo lugar — o mesmo bloco funciona.

## Verificação

- Teste no projeto confirmando que o texto de consentimento do snippet é idêntico, byte a byte, ao texto canônico `v1` e que os nomes dos campos batem com a validação do servidor (evita erro de digitação que invalidaria a prova de aceite).
- Revisão do payload gerado antes do envio: campos, formatos e botão travado durante o envio, sem permitir clique duplo.
- Nada é enviado a nenhum número durante a preparação.

## O que NÃO será feito

- Nenhuma alteração em funções, banco, permissões, segredos, modelos ou Campanhas.
- Nenhum contato, consentimento, card, mensagem ou item de fila criado por mim.
- Nenhum envio real: o primeiro envio verdadeiro acontece quando uma pessoa preencher o formulário na página publicada.

## Detalhes técnicos

- Arquivo canônico no projeto: `docs/shopify-signup-form.html` (fica versionado e permite o teste do texto de consentimento).
- Cópia para download: `/mnt/documents/shopify-signup-form.html`.
- Teste: `src/__tests__/shopify-signup-snippet.test.ts` comparando o texto do snippet com `CONSENT_TEXTS.v1` de `supabase/functions/_shared/signup.ts` e conferindo as chaves do payload contra `validateSignup`.
- O snippet não envia header de autenticação (a função aceita apenas `content-type`) e usa `fetch` com `Origin` natural do navegador, que é justamente o endereço da página.
