# Consentimentos de marketing na Shopify — auditoria (06/10/2026, somente leitura)

Nada foi alterado: nem a Shopify, nem permissões do app, nem clientes, contatos ou o banco da Nina. Só consultas de leitura à Shopify (incluindo a descrição dos campos da API) e aos pedidos já recebidos.

## Respostas diretas

- **A) Aceitaram marketing por e-mail:** impossível contar hoje, porque o app não tem permissão de leitura de clientes. O único sinal disponível é o aceite marcado nos pedidos recebidos: **3 de 487 pedidos**.
- **B) Aceitaram WhatsApp marketing:** impossível contar hoje (mesma permissão faltando). Nenhum dado de WhatsApp chega nos pedidos.
- **C) Profissionais identificáveis:** **0** com o acesso atual. Os pedidos não trazem etiqueta de cliente; nas etiquetas de pedido só há 2 de teste ("tag1", "tag2").
- **D) O checkout coleta WhatsApp?** Não dá para confirmar: as configurações do checkout não são acessíveis pelo app. Nenhum pedido recebido traz telefone de aceite SMS/WhatsApp (0 de 487), um sinal de que hoje isso não é coletado ou não está ativo.
- **E) O app atual consegue ler esses dados?** **Não.**
- **F) O que falta:** a permissão `read_customers`.
- **G) Dá para usar a Shopify como fonte de verdade do WhatsApp?** Tecnicamente sim: a versão da API que usamos (2026-07) tem um campo próprio de consentimento de WhatsApp por cliente. Mas só depois de liberar a permissão de leitura de clientes e de a loja de fato coletar esse aceite.
- **H) O que fica na Nina:** descadastro pelo WhatsApp ("parar", "sair"), consentimento coletado na conversa, tipo de cliente quando não vier da Shopify e o histórico de quando e de onde veio cada aceite.

## 1–2. App e permissões (confirmadas na instalação atual)

- Permissão concedida: **somente `read_orders`**.
- Não concedidas: `read_all_orders`, `read_customers` e qualquer permissão de marketing.
- Teste real: a contagem de clientes foi recusada pela Shopify com "Access denied… Required access: `read_customers`".
- Ficam bloqueados: lista de clientes, contagens, etiquetas e campos extras de cliente, e os três consentimentos.

## 3–4. Campos reais de consentimento na API (versão 2026-07)

Cada canal tem estado separado:

| Canal | Onde fica | Campos |
|---|---|---|
| E-mail | `Customer.defaultEmailAddress` (`CustomerEmailAddress`) | `marketingState`, `marketingOptInLevel`, `marketingUpdatedAt`, `marketingUnsubscribeUrl` |
| SMS | `CustomerSmsMarketingConsentState` (no telefone do cliente) | `marketingState`, `marketingOptInLevel`, `consentUpdatedAt`, `consentCollectedFrom` |
| WhatsApp | `CustomerPhoneNumber.whatsAppMarketingConsent` (`CustomerWhatsAppMarketingConsent`) | `state`, `optInLevel`, `updatedAt`, `collectedFrom`, `sourceLocation` |

Também existe `Customer.dataSaleOptOut`. E-mail, SMS e WhatsApp são independentes: um não implica o outro.

## 5–6. Contagens

- **Clientes da Shopify:** sem acesso, não dá para contar.
- **Pedidos recebidos:** 487 pedidos com dado de cliente. Neles, o cliente vem **sem** campos de consentimento, porque a Shopify os omite sem `read_customers`.
- **Aceite marcado no pedido** (`buyer_accepts_marketing`): 3 verdadeiros. Esse aceite é genérico, de e-mail, e **não** serve como aceite de WhatsApp.

**Depois de liberar `read_customers`**, conseguiríamos ler por cliente:
- os estados de e-mail, SMS e WhatsApp;
- as etiquetas e os campos extras;
- o identificador do cliente.

## 7–9. Checkout, cadastro profissional e cliente final

- **Configuração do checkout:** o app não acessa. É preciso conferir no painel da Shopify, em Configurações → Checkout ("Marketing por e-mail", "Marketing por SMS"; o WhatsApp depende do app de mensagens instalado na loja).
- **Formulário profissional, cadastro e login do cliente final, formulários PageFly:** ficam no tema da loja, fora deste projeto. Não foi possível auditar pelo código nem pelo acesso atual.
- **O que os pedidos mostram:** origem "web" em todos. Os campos extras dos pedidos são só de pagamento (pix, cartão, desconto), sem tipo de cliente ou aceite.

## 10. Identificar profissionais

- Com o acesso atual: nenhum dado disponível.
- Com `read_customers`: dá para ler etiquetas de cliente (ex.: "profissional", "aprovado") e campos extras, se a loja os usar. Precisa confirmar no painel quais etiquetas o cadastro profissional grava.

## 11. Ligação Shopify ↔ Nina

- Melhor chave: o **identificador do cliente Shopify**, que já está salvo nos pedidos (421 clientes distintos).
- Hoje, 374 contatos da Nina já estão ligados a pedidos, pelo telefone normalizado. Esses poderiam ser ligados com segurança.
- O e-mail fica como chave de reserva, não como principal.

## Plano futuro (não executar agora)

1. **Na Shopify (você, no painel):**
   - conferir o que o checkout coleta (e-mail, SMS, WhatsApp);
   - conferir quais etiquetas o cadastro profissional grava.
2. **Nova versão do app com `read_customers`** (precisa reautorizar a instalação). Só leitura.
3. **Leitura de teste:** contagens por estado de e-mail, SMS e WhatsApp e por etiqueta, sem gravar nada.
4. **Guardar na Nina, separadamente,** `email_marketing_consent` e `whatsapp_marketing_consent` (estado, data, origem), ligados pelo identificador do cliente Shopify.
   - Nunca converter e-mail em WhatsApp.
   - O descadastro feito no WhatsApp sempre vence o dado da Shopify.
5. **Só então** usar esses dados no filtro das Campanhas.

## Detalhes técnicos

- Consultas feitas com a credencial atual do app (client_credentials), API 2026-07: `currentAppInstallation.accessScopes` → `["read_orders"]`; `customersCount` → ACCESS_DENIED; leitura da estrutura da API para os tipos listados.
- Base local: `shopify_events.raw_payload` (901 eventos distintos, 487 pedidos com `buyer_accepts_marketing`) e `orders` (`shopify_customer_id`, `contact_id`).
- Migration: não agora. Será necessária na etapa 4.
