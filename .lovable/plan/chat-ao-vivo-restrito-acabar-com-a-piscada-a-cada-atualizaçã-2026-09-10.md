# Chat ao Vivo restrito: acabar com a piscada a cada atualização

Auditoria somente leitura concluída. Nada foi alterado no código nem no banco.

## 1. Onde está a atualização automática

- **Tela restrita** — usada por Leticia **e por todas as dermoconsultoras** (Mylena, Cris, Talia,
  Barbara, Laura). É o mesmo componente: `DermoChat` é apenas um invólucro de
  `RestrictedHandoffChat`, em `src/components/ExpedicaoChat.tsx`.
- **Tela completa** (admin/gestão/SDR): `ChatInterface.tsx` + `useConversations.ts`.
  Usa tempo real; só faz atualização periódica de 10s quando o tempo real cai. **Fora do escopo
  desta correção.**

Atualização periódica da tela restrita: `setInterval` de **20 segundos**
(`ExpedicaoChat.tsx:219-225`), que recarrega a lista e todas as mensagens da conversa aberta.
Não há recarga de página — é refetch + redesenho.

## 2. Causa exata do problema

A cada 20 segundos, na tela restrita:

1. `loadMessages` liga o indicador de carregando e a conversa é substituída por um spinner;
   ao voltar, a lista de mensagens é um array novo e o container é redesenhado do zero —
   o scroll volta ao início.
2. `loadList` liga o carregando da lista lateral e, se a conversa aberta não vier na resposta,
   **descarta a seleção** e a atendente cai na tela vazia.
3. O bloco de motivo, o histórico e os anexos são recalculados junto, ampliando a piscada.

O rascunho digitado não é apagado hoje; o que atrapalha é o salto visual em volta do campo.

## 3. O que será feito (somente `src/components/ExpedicaoChat.tsx`)

**A. Atualização silenciosa, mantendo os 20 segundos**
- O intervalo continua em 20s.
- A atualização automática **não** liga mais os indicadores de carregando. Eles aparecem apenas:
  carregamento inicial, troca manual de conversa e botão de atualizar.
- Os dados atuais permanecem visíveis enquanto a resposta não chega.

**B. Atualização de conteúdo sem desmontar o DOM**
- Comparação por conteúdo real de cada mensagem (identificador, texto, tipo, mídia, autor,
  data), não apenas quantidade/IDs.
- Se nada mudou, o estado não é substituído. Se algo mudou, as mensagens existentes são
  atualizadas no lugar, preservando a chave de cada item — o container não é remontado.
- A lista lateral segue a mesma regra: atualização no lugar, sem redesenhar tudo.

**C. Scroll**
- Ao abrir uma conversa: ir ao fim **uma única vez**, sem animação.
- Durante a atualização automática: posição preservada, sem scroll automático só porque o
  array foi refetchado.
- Mensagem nova com a atendente próxima do fim (~120px): acompanha.
- Mensagem nova com a atendente lendo acima: não move e aparece um aviso discreto
  "novas mensagens" que leva ao fim ao ser clicado.

**D. Seleção**
- A atualização automática nunca limpa a conversa selecionada.
- A seleção só é limpa quando há confirmação real: atendimento finalizado, acesso revogado ou
  a conversa realmente inacessível (erro de permissão ao carregar as mensagens).

## 4. Testes

1. Leticia abre uma conversa, sobe no histórico e aguarda 2 ciclos de 20s: sem piscada, sem
   mudança de scroll, conversa ainda selecionada.
2. Uma dermoconsultora repete o mesmo teste (mesmo componente).
3. Digitando durante a atualização: texto e foco preservados, sem piscada.
4. Mensagem nova com a atendente no fim: acompanha normalmente.
5. Mensagem nova com a atendente lendo acima: scroll parado + aviso de nova mensagem.
6. Finalizar atendimento: continua removendo a conversa da lista.
7. Perda real de acesso: a conversa deixa de ser acessível normalmente.

## 5. Fora de escopo / preservado

`ChatInterface.tsx` (tela do admin) permanece intacto nesta correção. Nada de backend, banco,
migrations, funções de servidor, handoffs automático e manual da Leticia, concessões/permissões,
Finalizar atendimento, retorno da Nina, dermoconsultoras, rodízio, `weight=8` da Talia,
prioridade da Laura, casos sensíveis, classificação, WhatsApp, RLS, Shopify, chat-media,
mensagens e histórico.
