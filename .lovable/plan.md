# Chat ao Vivo da expedição — leitura clara do handoff

## O que a investigação mostrou

- As mensagens já guardam o autor no banco em `messages.from_type`, com três valores: `user` (cliente), `nina` (resposta automática) e `human` (atendente).
- A tela atual da Letícia (`ExpedicaoChat`) compara o autor com o texto `contact`, que **não existe** no banco. Resultado: mensagens do cliente caem no caso "senão" e são desenhadas como se fossem da atendente. É essa a causa de tudo parecer da mesma pessoa.
- A conversa já encaminhada (motivo `where_is_my_order`) tem: motivo registrado, data do encaminhamento e o texto do cliente que originou o caso ("meu pedido ta atrasado") logo antes da hora do handoff.
- O campo `trigger_message_id` está vazio nessa conversa e o `trigger_snippet` guardou a fala da NINA, não a do cliente. Então o bloco de motivo não pode depender só desses campos: precisa também da última mensagem do cliente anterior ao horário do encaminhamento.
- A tela hoje só recebe motivo, nome e telefone; não recebe a data do encaminhamento, que é o que separa "antes" e "depois" da NINA.

Nada disso exige nova mensagem, novo handoff ou nova concessão: os dados já estão no banco.

## O que será feito

1. **Corrigir a identificação do autor** na tela da Letícia: cliente, NINA e atendimento humano passam a ser reconhecidos pelos valores reais do banco.
2. **Três estilos distintos de mensagem**, cada um com etiqueta de texto acima do balão (não só cor):
   - Cliente (nome do contato, ou "Cliente")
   - NINA (com ícone discreto e rótulo "NINA")
   - Atendimento (nome da atendente / "Atendimento")
3. **Bloco "Motivo do encaminhamento"** no topo da conversa, mostrando o motivo em português amigável e a mensagem do cliente que originou o caso.
   - Motivos traduzidos: pedido atrasado / rastreio, código de rastreio, transportadora, pedido enviado sem atualização, onde está meu pedido, financeiro.
   - Mensagem de origem: usa `trigger_message_id` quando existir; senão a última mensagem do cliente anterior ao horário do encaminhamento; senão o `trigger_snippet`.
4. **Histórico anterior recolhido** em "Ver conversa anterior com a NINA": tudo anterior ao horário do encaminhamento fica escondido atrás de um botão, e ao abrir mantém a mesma diferenciação visual.
5. **Depois do handoff**, as mensagens seguem visíveis normalmente, com autor identificado em cada uma.

## Detalhes técnicos

- **Consulta**: `list_my_expedicao_conversations` ganha três colunas adicionais — `handoff_at` (data da concessão), `trigger_message_id` e `trigger_snippet`. Continua `SECURITY DEFINER` com exatamente os mesmos filtros de papel, atribuição e concessão ativa; nenhum critério de acesso muda.
- **Frontend**: apenas `src/components/ExpedicaoChat.tsx`.
  - mapa `from_type` → `{ rótulo, estilo }` para `user` / `nina` / `human`;
  - separação das mensagens em "antes do handoff" (colapsável) e "depois";
  - bloco de motivo derivado dos dados já retornados;
  - cores via tokens do design system existente.
- **Não muda**: `apply_expedicao_handoff`, `expedicao_reply`, `expedicao_finish_conversation`, `get_my_expedicao_messages`, classificação de handoff, flag `EXPEDICAO_CHAT_HANDOFF_ENABLED`, atribuições, concessões, fluxo dermatológico, Shopify → WhatsApp, rastreio automático e as mensagens gravadas.

## Efeito retroativo

Como a mudança é só de consulta e renderização sobre dados existentes, ao atualizar a página a conversa já encaminhada aparece com o bloco de motivo, a fala "meu pedido ta atrasado" como origem, autores identificados e o histórico antigo recolhido.
