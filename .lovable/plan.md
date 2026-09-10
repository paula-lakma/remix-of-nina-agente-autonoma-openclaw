# Chat ao Vivo: parar o "reload" a cada poucos segundos

Auditoria somente leitura. Nada foi alterado no código nem no banco.

## 1. Onde está a atualização automática

Existem duas telas de Chat ao Vivo:

- **Tela restrita** — usada por Leticia (logística/financeiro) **e por todas as dermoconsultoras**
  (Mylena, Cris, Talia, Barbara, Laura). É o mesmo componente: `DermoChat` é apenas um invólucro
  de `RestrictedHandoffChat`, dentro de `src/components/ExpedicaoChat.tsx`.
- **Tela completa** — usada por admin/gestão/SDR: `src/components/ChatInterface.tsx` com o hook
  `src/hooks/useConversations.ts`.

O comportamento relatado é o da **tela restrita**.

## 2. Frequência exata e tipo de atualização

- Tela restrita: `setInterval` de **20 segundos** (`ExpedicaoChat.tsx:219-225`) que recarrega
  a lista de atendimentos **e** todas as mensagens da conversa aberta.
- Tela completa: **não tem** atualização periódica em operação normal. Usa Supabase Realtime
  (mensagens e conversas). Só quando o Realtime cai/expira entra um `setInterval` de **10 segundos**
  como plano B (`useConversations.ts:280` e `:293`).

Em nenhum dos casos há recarga da página (`window.location.reload`). É refetch + re-render.

## 3. Causa exata da perda de posição

Tela restrita, a cada 20 segundos:

1. `loadMessages` liga o estado de carregamento e a área de mensagens é substituída por um
   indicador de carregando; ao voltar, a lista de mensagens é um array novo e o container é
   redesenhado do zero — o scroll volta ao início.
2. `loadList` liga o carregamento da lista lateral e reordena os atendimentos conforme o retorno
   do servidor; se a conversa aberta não voltar na lista, a seleção é **descartada** e a atendente
   é jogada para a tela vazia.
3. O bloco "Ver conversa anterior" e a mídia são recalculados junto, aumentando o efeito de piscada.

Tela completa: o scroll é forçado para o fim **sempre** que chega qualquer mensagem
(`ChatInterface.tsx:140-142`), mesmo se a atendente estiver lendo mensagens antigas. Além disso,
há uma seleção automática da primeira conversa quando nada está selecionado
(`ChatInterface.tsx:93-98`).

Campo de digitação: o rascunho fica em estado local que **não** é limpo pela atualização; ele não
é apagado hoje. O que atrapalha é a piscada/salto do conteúdo ao redor, não a perda do texto.

## 4. Já existe tempo real suficiente?

- Tela completa: sim, Realtime cobre novas mensagens, novas conversas e mudanças de status/handoff.
  O intervalo de 10s só existe como plano B e deve permanecer.
- Tela restrita: **não** há Realtime — todo acesso passa pela função de servidor que revalida papel
  e concessão. Portanto a atualização periódica precisa continuar, mas de forma silenciosa.

## 5. Correção mínima proposta (vale para todas as atendentes)

Somente frontend, no código compartilhado. Sem identificar ninguém por nome ou e-mail.

**A. Atualização silenciosa na tela restrita**
- A atualização automática deixa de ligar os indicadores de carregamento: os dados atuais
  permanecem na tela até a resposta chegar. O carregando continua aparecendo apenas na abertura
  inicial, na troca de conversa e no botão manual de atualizar.
- A lista de mensagens só é substituída quando o conteúdo realmente mudou (comparação por
  identificadores/quantidade), evitando redesenho desnecessário.
- A atualização automática nunca descarta a conversa selecionada; a seleção só é limpa em
  ação explícita (finalizar atendimento ou perda real de acesso).
- Intervalo passa de 20s para 30s.

**B. Scroll respeitoso (nas duas telas)**
- Ao abrir uma conversa: posicionar no fim, sem animação.
- Chegando mensagem nova: só acompanha o fim se a atendente já estiver perto do fim
  (margem de ~120px). Se estiver lendo acima, a posição é mantida e aparece um aviso discreto
  "novas mensagens" que leva ao fim quando clicado.
- Durante atualização automática, a posição de rolagem é preservada.

**C. Lista lateral**
- Preservar a rolagem da lista e a conversa selecionada entre atualizações; a ordem continua
  seguindo a regra atual.

## 6. Arquivos que precisariam ser alterados

- `src/components/ExpedicaoChat.tsx` (beneficia Leticia e as cinco dermoconsultoras)
- `src/components/ChatInterface.tsx` (scroll respeitoso na tela completa)
- possivelmente um pequeno utilitário de rolagem compartilhado

Nenhuma alteração em banco, migration, funções de servidor, permissões ou mensagens.

## 7. Plano de testes

1. Leticia: abrir um atendimento, rolar até o meio do histórico e aguardar 2 ciclos —
   posição, seleção e rascunho intactos, sem piscada.
2. Dermoconsultora (ex.: Cris): mesmo teste, confirmando que a correção é compartilhada.
3. Mensagem nova enquanto a atendente está no fim: acompanha automaticamente.
4. Mensagem nova enquanto lê mensagens antigas: não move; aviso de novas mensagens aparece.
5. Digitar uma resposta longa e aguardar a atualização: texto e foco preservados.
6. Finalizar atendimento: continua saindo da conversa normalmente.
7. Admin: lista, seleção e envio seguem funcionando como hoje.

## Preservado

Handoff automático e manual da Leticia, concessões e permissões, Finalizar atendimento, retorno
da Nina, dermoconsultoras, rodízio, `weight=8` da Talia, prioridade da Laura, casos sensíveis,
classificação, WhatsApp, RLS, Shopify, chat-media, mensagens e histórico.
