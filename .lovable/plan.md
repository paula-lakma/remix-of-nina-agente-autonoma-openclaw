# Retomada, lançamento PLLA/GHK-CU e base elegível para marketing — auditoria (06/10/2026, somente leitura)

## A. Modelo de retomada `retomada_atendimento_lakma`

Consultei a Meta direto, só leitura, sem rodar a sincronização (ela grava no banco).
- **Situação na Meta agora: PENDING, ainda em análise.** Categoria UTILITY, idioma pt_BR, número 1426141972819125, motivo de rejeição "NONE" (nenhum).
- Situação no sistema: PENDING, UTILITY, pt_BR, mesmo número, última atualização 05/10 às 15:01. **A tela está igual à Meta**, sem divergência.

## B. Novo modelo `lancamentos_plla_ghkcu_lakma`

- **Não existe** nem no sistema nem na Meta (20 modelos na Meta).
- Não há modelo parecido sobre lançamentos ou PLLA/GHK-CU. O mais próximo é `interesse_produtos_protocolos_lakma`, que é genérico e tem outra finalidade. Não há duplicação.
- Nome válido (letras minúsculas, números e _). Categoria MARKETING correta (é promoção de produto). pt_BR correto.
- Sem variáveis, então não precisa de exemplo. Emojis e quebras de linha são aceitos pela Meta no corpo, e a tela atual de Templates já envia o texto como foi digitado.
- Atenção ao texto: "Fluído" com acento. A grafia correta é "Fluido". Mantenho como você escreveu, a menos que você peça a correção.
- O texto termina com "eu te explico", em primeira pessoa. A resposta do cliente cairá na Nina, que conduz a conversa.

## C. Quem pode receber marketing — o que a base tem hoje

**Dados existentes sobre os contatos (709 no total):**
- telefone: 709 com telefone; 705 no formato brasileiro válido; 0 números repetidos;
- "WhatsApp válido" (`whatsapp_valid`): existe o campo, mas está **vazio em todos** (0 sim, 0 não);
- bloqueio (`is_blocked`, `blocked_reason`): existe, **0 bloqueados**;
- tipo de cliente (`crm_contact_profiles.contact_type`): só **1** contato marcado (profissional_estetica); 708 sem tipo;
- etiquetas, campos extras, listas de contatos: praticamente vazios (1 etiqueta de teste, 0 listas);
- `status_lead`: todos "new".

**Dados que NÃO existem:** nenhum campo ou tabela de consentimento (opt-in) para WhatsApp, permissão de marketing, origem ou data do consentimento, ou descadastro (opt-out).

**Origem dos contatos:** 374 com pedido na loja (Shopify); 329 só conversaram pelo WhatsApp/Nina; 6 sem nenhuma das duas. Não há formulário profissional, importação ou lista registrada. Comprar ou conversar **não** prova consentimento de marketing.

**Descadastro:** não existe mecanismo. Procurei nas mensagens frases como "pare de me mandar", "não quero receber", "sair", "remover meu número": **0 ocorrências** hoje. Mas, se alguém pedir, nada impede um novo disparo.

**Contagens pedidas:**

| Item | Total |
|---|---|
| Contatos com telefone | 709 |
| Telefone válido | 705 |
| Com consentimento WhatsApp comprovado | 0 (campo não existe) |
| Com permissão de marketing | 0 (campo não existe) |
| Com descadastro registrado | 0 (campo não existe) |
| Sem consentimento comprovável | 709 |
| **Elegíveis pela regra segura** | **0** |
| Elegíveis por tipo (profissional / cliente final / distribuidor / desconhecido) | 0 / 0 / 0 / 0 |

**Disparos anteriores:** a tela de Campanhas já envia modelos aprovados para listas, mas nunca foi usada (0 campanhas, 0 destinatários). Ela não filtra consentimento nem descadastro.

## Avaliação de risco

- A) Disparo seguro hoje: **não**. Não há como provar quem aceitou receber marketing.
- B) Consentimento insuficiente: sim, para 100% da base.
- C) Registrar o consentimento antes: **sim, é pré-requisito**.
- D) Só profissionais: sim, faz sentido para esse lançamento. Mas hoje só 1 contato está marcado como profissional, então antes é preciso classificar a base.
- Riscos de disparar mesmo assim: bloqueios e denúncias de usuários derrubam a qualidade do número na Meta, podem limitar ou pausar o envio (inclusive avisos de rastreio e atendimento), além do risco de violar a LGPD.

## D. Plano de Build (cada etapa só com a sua aprovação)

**Etapa 1 — submeter o modelo** (sem banco novo, sem código)
- Pela tela de Templates já existente (proteções de duplicado e permissão ativas): nome `lancamentos_plla_ghkcu_lakma`, MARKETING, pt_BR, corpo exatamente aprovado, sem cabeçalho, botão ou variável.
- Depois, acompanhar com "Sincronizar". Nada é enviado a clientes.

**Etapa 2 — registro de consentimento e descadastro** (precisa de mudança no banco)
- Novos dados por contato: consentimento WhatsApp, consentimento de marketing, origem, data, descadastro (data e motivo).
- Descadastro automático quando o cliente escrever "parar", "sair", "não quero receber" etc., com resposta de confirmação.
- Marcação manual do tipo de cliente (já existe `contact_type`).
- Nunca marcar consentimento retroativo sem prova.

**Etapa 3 — coletar consentimento**
- Formas possíveis (você escolhe): pergunta da Nina dentro da janela de 24h ("Quer receber novidades e lançamentos?"), formulário profissional, checkout da loja com caixa de aceite.

**Etapa 4 — disparo seguro** (só depois do modelo APPROVED)
- Campanhas passa a aceitar só contatos com consentimento de marketing, sem descadastro, sem bloqueio, com telefone válido e do segmento escolhido (profissionais).
- Antes de enviar, mostrar: total selecionado, total excluído e motivos, segmento.
- Nunca disparar para toda a base automaticamente.

## Detalhes técnicos

- Arquivos da Etapa 1: nenhum (usa `submit-template` como está).
- Etapa 2: migration em `contacts` (ou tabela `contact_consents`) + `whatsapp-webhook` (detectar descadastro) + `Contacts`/`ContactProfile` (exibir e editar).
- Etapa 4: `src/pages/Campaigns.tsx`, `useBroadcasts.ts` e a função de envio de campanha (filtro obrigatório no servidor).

## Decisões para você

1. Submeter já o modelo de lançamento (Etapa 1), mesmo sem base elegível ainda?
2. Corrigir "Fluído" para "Fluido"?
3. Como coletar consentimento (Nina, formulário, checkout)?
