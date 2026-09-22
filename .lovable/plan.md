# Auditoria das 3 mudanças — rastreio, chat do admin e novo acesso de expedição

Auditoria somente de leitura. Nada foi alterado. O plano dos 6 alertas de segurança (equipe, times, funções, etiquetas, etapas do funil e pacotes) continua pausado.

---

## A. Transportadora errada no rastreio

### Causa (verificada nos dados reais)

O aviso automático de envio (Shopify) repassa ao cliente, sem nenhuma tradução, o nome que vem da loja. Contagem real dos eventos recebidos: Correios 313, **Other 192**, **Frenet 137**, Outra 2, UPS 1. O texto enviado monta a frase com esse nome direto ("foi enviado pela Frenet").

O envio manual (tela da Leticia) **não tem esse problema**: só aceita Correios ou Jadlog, e o banco tem trava que impede qualquer outro valor.

### Como identificar a transportadora com segurança

Os dados reais permitem decidir sem adivinhar:

| Sinal no evento | Transportadora | Exemplo real |
|---|---|---|
| Link de rastreio contém `frenet.com.br/JAD/` | Jadlog | Frenet e Other, todos |
| Código no formato duas letras + 9 dígitos + BR | Correios | AP434990101BR |
| Código só numérico de 9 dígitos | Jadlog | 622119559 |
| Link dos Correios | Correios | correios.com.br/rastreamento |

Todos os 137 "Frenet" e todos os "Other" com link são, de fato, Jadlog. Os "Other" sem link (62) são códigos numéricos de 9 dígitos — também Jadlog pelo formato.

### Correção mínima

1. Uma única função compartilhada de normalização (`resolveCarrier`), usada pelo aviso automático e pelo envio manual, decidindo por link → formato do código → nome informado.
2. Quando nem link nem formato nem nome permitirem decidir: **não inventar**. A mensagem passa a falar apenas "foi enviado" e mostra código e link genérico, sem nome de transportadora, e o evento fica registrado como indeterminado para conferência.
3. Nunca escrever "Frenet", "Other", "Outra" ou "transportadora" como nome ao cliente.

Arquivos: `supabase/functions/_shared/shopify.ts` (nova função + montagem da mensagem), `supabase/functions/shopify-webhook/index.ts` (grava a transportadora já normalizada), `src/lib/trackingForm.ts` (reaproveita a mesma regra). Mensagens já enviadas não são reescritas.

Testes: casos reais de Frenet, Other com link, Other sem link, Correios e caso indeterminado; simulação do webhook sem enviar WhatsApp.

---

## B. Admin não enxerga todas as conversas da Leticia

### Causa exata (verificada)

O Chat completo do admin busca **as 50 conversas mais recentes** de um total de **430 ativas**. A tela restrita da Leticia não tem esse limite: lista todas as conversas concedidas a ela.

Leticia tem 19 conversas ativas. Destas, apenas as 5 mais recentes entram nas 50 mais recentes do sistema:

| Conversa | Última mensagem | Aparece para o admin |
|---|---|---|
| Bianca Ramos | 19/09 | sim |
| Andressa Alessandra | 19/09 | sim |
| Nayane | 18/09 | sim |
| Mônica Amaral | 17/09 | sim |
| Camila Tinoco | 15/09 | sim |
| Luciana, Selma, Larissa, Bruna, Stefanie, Débora, Angélica, Brena, Rosana, Sheila, Amanda, Thais, Anny, Aline | 15/09 a 17/08 | **não** |

Não é permissão, filtro de status, finalização, cache nem RLS: é puramente o corte de 50 por recência. Vanessa Reis (Carla) aparece para o admin porque é recente — está correto, o admin tem visão global.

Efeito secundário verificado: dentro de cada conversa o admin carrega só as **100 primeiras** mensagens (mais antigas), então conversas longas mostram histórico truncado.

### Correção mínima

- Carregamento por páginas no Chat completo: primeira carga de 50 e botão/rolagem para carregar mais, em vez de corte fixo.
- Busca por nome/telefone feita no servidor, para achar qualquer conversa mesmo fora da página atual.
- Filtro por responsável (Leticia, Carla, dermoconsultoras, Nina) na lista do admin.
- Mensagens: carregar as **mais recentes** primeiro, com opção de carregar histórico anterior.

Arquivos: `src/services/api.ts` (`fetchConversations`), `src/hooks/useConversations.ts`, `src/components/ChatInterface.tsx`. Sem migration. Chats restritos de Leticia, Carla e dermoconsultoras não são tocados; finalização e reabertura ficam como estão.

Testes: admin encontra as 19 da Leticia; busca por "Aline" e "Anny"; conversa longa abre no fim; telas restritas inalteradas.

---

## C. Novo acesso só para envio de rastreio

### Situação atual auditada

A tela "Envio de rastreio" usa o formulário próprio (nome, telefone, pedido, código, transportadora Correios/Jadlog), lê o histórico de envios e chama a função de servidor `send-manual-tracking`, que revalida sessão e papel (hoje: admin, gestão, expedicao), confere o modelo aprovado, adquire trava anti-duplicidade e envia pelo WhatsApp. O envio real continua desligado pelo interruptor de segurança.

Reutilizar o papel `expedicao` daria ao novo funcionário o Chat restrito da Leticia — não serve.

### Arquitetura recomendada: novo papel `rastreio`

Menor mudança segura e sem tocar na Leticia:

- Novo papel `rastreio` na lista de papéis do sistema.
- Menu e rotas: somente "Envio de rastreio"; nada de Chat, Pipeline, Contatos, Agendamentos, Campanhas, Templates, Equipe, Cérebro ou Configurações.
- Servidor: `send-manual-tracking` passa a aceitar também `rastreio`; nada mais muda.
- Banco: leitura do histórico de envios liberada para `rastreio` (hoje admin/gestão/expedicao). Nenhum acesso a conversas, mensagens, contatos, negócios, campanhas, modelos ou configurações — as regras atuais já bloqueiam tudo isso para papéis fora de admin/gestão/sdr.
- O modelo aprovado é conferido pelo servidor com chave de serviço, então o novo papel não precisa ler a tabela de modelos (que já é restrita a admin/gestão).
- Leticia continua exatamente igual: Chat restrito + Envio de rastreio + handoffs.

Contas continuam sendo criadas por administrador; nenhum cadastro público. Nenhuma conta é criada agora.

Sem conflito com o plano de segurança pausado: aquele plano restringe equipe, times, etiquetas e etapas do funil a admin/gestão/sdr, e o papel `rastreio` não usa nenhuma dessas telas.

Testes: entrar com o novo papel e ver só "Envio de rastreio"; tentativa direta de abrir as outras páginas é negada; leitura direta de conversas, contatos e campanhas bloqueada; envio manual valida campos e respeita o interruptor; Leticia e demais papéis sem alteração.

---

## Resumo de execução (quando aprovado)

- Migrations: 1 — novo papel `rastreio` e leitura do histórico de envios para ele.
- Funções de servidor a publicar: `shopify-webhook`, `send-manual-tracking`.
- Publicar o site: sim (menu, rotas e paginação do chat).
- Reconstruir o Cérebro: não é necessário.
- Riscos de regressão: baixos e isolados — texto do aviso de envio, lista de conversas do admin, e um papel novo sem efeito sobre os existentes. Mensagens já enviadas, handoffs, rodízio, Shopify, WhatsApp e históricos ficam intactos.
