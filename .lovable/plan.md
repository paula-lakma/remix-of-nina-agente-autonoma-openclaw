# Acesso restrito da Carla ao Chat ao Vivo

## 1. Causa exata do acesso amplo

A Carla tem papel `sdr`. A regra de leitura das conversas (`conversations_select_staff`) libera tudo para quem é `admin`, `manager` ou `sdr` (função `is_operational_staff`). Ou seja: hoje qualquer pessoa com papel `sdr` enxerga o Chat ao Vivo inteiro — não é um problema específico da conta dela.

No frontend, `ChatRouteSwitch` só entrega a tela restrita para os papéis `expedicao` e `dermo`; todos os outros recebem o chat completo.

## 2. Modelo restrito já existente (reutilizável)

Leticia (expedição) e as dermoconsultoras já usam exatamente o padrão desejado:

- papel próprio (`expedicao` / `dermo`);
- concessão de acesso por conversa (`conversation_access_grants`) criada no encaminhamento automático;
- leitura, resposta e "Finalizar atendimento" passando por funções de servidor que revalidam sessão, papel e concessão ativa;
- uma tela única compartilhada (`RestrictedHandoffChat`), com `DermoChat` sendo apenas um invólucro de 15 linhas.

Portanto a menor mudança segura é **replicar esse modelo para parcerias** (opção B+C do seu questionamento), e não criar uma exceção só para o e-mail da Carla. Uma regra "somente Carla" ficaria hardcoded e frágil.

## 3. O que falta hoje

O encaminhamento de influenciadora/collab/parceria já atribui a conversa à Carla, mas **não cria concessão de acesso** — só expedição e dermo criam. Sem isso, ao restringir a Carla ela não veria nada. A criação da concessão faz parte desta implementação.

## 4. Plano de implementação

1. Novo papel `parcerias` e função que define os motivos válidos, restritos ao fluxo da Carla: influenciadora, criadora de conteúdo, collab, parceria de divulgação e relacionamento com influenciadoras. "Permuta" só entra quando vier em contexto claro de influenciadora/criadora/divulgação. Problema de cupom **não** é motivo de parcerias: "meu cupom não funciona" segue o fluxo atual; só vai para a Carla quando a mensagem trouxer contexto explícito de influenciadora/parceria. A matriz atual não é ampliada além disso.
2. Nova regra de leitura de conversas para esse papel: só conversa com concessão ativa e atribuída a ela. As regras atuais de `sdr`, expedição, dermo, Paula e Leticia ficam intactas.
3. Funções de servidor espelhando as da expedição: listar minhas conversas, ler histórico, responder, finalizar atendimento.
4. Encaminhamento de parcerias passa a criar a concessão (mesmo mecanismo do dermo), mantendo atribuição, eventos de handoff, pausa da Nina e agendamento como estão.
5. Nova função de servidor `parcerias-chat` e tela `ParceriasChat` reutilizando `RestrictedHandoffChat`; `ChatRouteSwitch` passa a direcionar o papel `parcerias`; o papel ganha acesso apenas à área de chat.
6. Migração da conta da Carla de `sdr` para `parcerias` (mesma conta, mesmo e-mail, mesmo id, mesmo cadastro de equipe).
7. Concessões retroativas apenas para conversas de parceria atualmente atribuídas à Carla e ainda em atendimento (não finalizadas). Históricos já encerrados não são reabertos nem liberados.

## 4.1 Reabertura após finalização (regra preservada)

Quando a Carla finaliza o atendimento, a conversa fica finalizada. Se o cliente escrever depois: a Nina é reativada, o responsável é limpo, as concessões antigas deixam de dar visibilidade e a conversa volta ao fluxo normal. A conversa não retorna para a Carla só porque ela atendeu antes. Se a nova mensagem trouxer novamente intenção de influenciadora/parceria, o classificador faz um novo encaminhamento, com nova atribuição e nova concessão.

Paula Rodrigues continua `sdr` e sem nenhuma alteração.

## 5. Impactos

- A Carla deixa de ver painel, contatos, campanhas e o histórico geral; passa a ver apenas a lista restrita.
- Continua conseguindo: abrir a conversa atribuída, ler o histórico completo dela, responder, finalizar atendimento e receber novos encaminhamentos de influenciadora automaticamente.
- Conversa finalizada ou retirada dela desaparece da lista (mesma regra já usada por Leticia e dermoconsultoras).
- Sem impacto em: Paula, Leticia, dermoconsultoras, Laura, Talia, rodízio, agendamento, WhatsApp, Shopify, mensagens e histórico.

## 6. Arquivos e objetos afetados

- Migração: papel `parcerias`, função de motivos, regra de leitura, funções de listar/ler/responder/finalizar, concessões retroativas, papel da Carla.
- `supabase/functions/_shared/handoff.ts` (criar concessão no destino parcerias), nova função `supabase/functions/parcerias-chat`.
- `src/components/ParceriasChat.tsx` (novo, invólucro), `src/components/ChatRouteSwitch.tsx`, `src/hooks/useUserRole.ts`.

## 7. Testes

- Encaminhamento de influenciadora cria atribuição + concessão e a conversa aparece para a Carla.
- Carla não enxerga conversas da Nina, da Leticia, das dermoconsultoras nem da Paula.
- Carla responde e finaliza atendimento; conversa finalizada some da lista.
- Reabertura por nova mensagem devolve a conversa para ela.
- Paula (`sdr`) continua com acesso completo; Leticia e dermoconsultoras inalteradas.
- Bateria automatizada atual (210 testes) e verificação de tipos.

## 8. Publicação

Publicar `parcerias-chat`, `nina-orchestrator`, `nina-reply` e `nina-tools` após a implementação. Não é necessário reconstruir o cérebro (as instruções da Nina não mudam).
