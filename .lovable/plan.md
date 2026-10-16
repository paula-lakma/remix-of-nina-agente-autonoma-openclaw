# Vânia Martins: diagnóstico (só leitura)

Nada foi alterado: não mexi em código nem no banco, não reatribuí nada e não enviei nenhuma mensagem.

## 1. Conversa
- conversation_id: `f7f4d8a9-9244-4fb9-a2b9-a941448906b3`
- contact_id: `5a7c0053-6645-474d-afc6-cb98b1a18acf` (telefone 558586139731, sem o 9)
- Existe um segundo contato com o mesmo número, agora com o 9: JOSI `2b42d2bc…`, telefone 5585986139731, conversa `6911faa0…`. Ele foi criado 7 s antes pelo envio de rastreio do pedido #32610. Fica só como observação, não é a causa.
- Estado atual: status `nina`, responsável vazio, Nina ativa (`ai_paused=false`), sem atendimento humano pedido (`human_takeover_required=false`), sem `handoff_type` nem `handoff_reason`, atendimento não finalizado.
- **Nenhum evento de encaminhamento** foi gravado nessa conversa.

## 2. Por que ficou "Não atribuído"
O encaminhamento **nunca foi disparado**. A equipe não chegou a ser consultada (`pick_dermo_assignee` não rodou).
Sequência em 15/10 (horário de Brasília):
- 21:18 a cliente pede "protocolo de clareamento íntimo… e facial… estrias". Isso é pedido de protocolo, não de uma pessoa. Pela regra, a Nina responde sozinha.
- 21:19 a Nina pergunta: "Posso encaminhar você para ela [dermoconsultora]?"
- 21:19 a cliente responde "Sim".
- 21:20 a Nina escreve "Vou encaminhar você agora para nossa dermoconsultora…", mas **sem o marcador de encaminhamento**.

Na regra de encaminhamento (`resolveHandoffDecision`, em `_shared/handoff.ts`):
- "Sim" não indica destino nenhum. A confirmação só vale quando a própria mensagem atual traz um destino.
- O histórico só pode decidir o destino para logística/financeiro ou para Paula e Carla, **nunca para dermo**.
- A rede de segurança "a Nina prometeu" existe **só para a Letícia**.

Resultado: a promessa ficou sem ação. Desde então a Nina repetiu três vezes que a dermoconsultora entraria em contato. A última foi hoje, às 07:10.

## 3. Equipe
Ativas hoje: Duda `69d0a53a…`, Barbara `652c1dcc…`, Talia `8b104801…` (peso 1), Laura `dcf6c6ed…` (função sênior). Todas com peso 1. Mylena e Cris estão desativadas e não aparecem entre as elegíveis. Como a escolha não chegou a rodar, nenhuma delas foi avaliada nesse caso.

## 4. Classificação
O pedido é **normal** (protocolo estético, sem sinal clínico sensível). Deveria ter ido para quem tem menos atendimentos, sem prioridade para a Laura. Com todas sem atendimentos ativos, o desempate vai para quem recebeu caso há mais tempo. Pela nova regra, a mais provável seria a Duda (nunca recebeu nenhum), mas isso não foi simulado.

## 5. Erro do envio manual
- Duas tentativas hoje, às 08:39:08 e 08:39:46 (Brasília), pelo Chat completo (`api.sendMessage` no navegador).
- A mensagem foi gravada nas duas vezes (`40e78e0e…` e `c64d32f1…`) e as duas estão paradas em `processing`.
- **Nenhum item entrou na fila de envio**, então nada chegou à Meta.
- Causa exata: a fila de envio só aceita gravação pelo servidor. A única regra de acesso existente é `service_role_all_send_queue`, e o navegador conectado é recusado ("new row violates row-level security policy for table send_queue"). A tela mostra isso só como "Erro ao enviar mensagem".
- Pelo histórico, nenhuma resposta humana pelo Chat completo entrou na fila por esse caminho. Já havia mensagens presas assim em 21/08 (3), 01/09 (3) e 03/09 (1).

## 6. Janela de 24h
Último contato da cliente: hoje às 07:10. A janela vai até 17/10 às 07:10, e o texto livre fica liberado até 07:05. A tela está certa. A trava do banco **aprovou** a gravação das mensagens (se a janela estivesse fechada, elas teriam sido recusadas). **Não foi a janela.** Não consegui rodar `whatsapp_freeform_window` daqui (sem permissão), mas a trava que aceitou a gravação usa exatamente essa regra.

## 7. Permissão ou responsável
O envio **não** falhou por falta de responsável, Nina ativa, conversa pausada ou sessão. Nenhuma checagem barra isso. Falhou só porque o navegador não tem permissão para gravar na fila de envio.

## 8. Mudança recente na equipe
**Não causou regressão.** A regra de escolha nem foi chamada. A falha é anterior e independente da troca de equipe.

## 9. Outras conversas
Busquei conversas desde 14/10 sem responsável em que a Nina prometeu dermoconsultora: **só a da Vânia** (`f7f4d8a9…`). Não há outros eventos de encaminhamento para dermo sem responsável no período.

## 10. Correção mínima recomendada (aguarda aprovação)
A. Encaminhamento: quando a Nina perguntar "posso encaminhar para a dermoconsultora?" e a cliente confirmar ("sim", "pode", "quero"), ou quando a Nina prometer dermoconsultora sem o marcador, aplicar o encaminhamento normal **antes** de enviar a resposta (`dermoconsultora_request`, mesma lógica de escolha). É o mesmo padrão já usado para a Letícia.
   - Arquivos: `supabase/functions/_shared/handoff.ts` (`resolveHandoffDecision` + detector de promessa ou confirmação de dermo), e conferir se `nina-reply` e `nina-orchestrator` usam essa decisão. Testes novos ao lado dos existentes.
B. Envio manual: tirar do navegador a gravação na fila de envio. O Chat completo passaria a enviar por uma função do servidor que confere a sessão e o papel (admin/manager/equipe), grava a mensagem e a fila e aciona o envio. A trava da janela de 24h continua no banco.
   - Arquivos: `src/services/api.ts` (`sendMessage`) e uma função nova ou existente no servidor. Sem abrir a fila de envio para o navegador.
C. Mostrar na tela o erro real em vez do genérico (`useConversations.ts`).
D. Depois de aprovado: encaminhar a Vânia pelo fluxo oficial, uma única vez, e decidir o que fazer com as 2 mensagens dela e as 7 antigas presas em `processing`.

## 11. Confirmação
Somente leitura. Nenhuma alteração, nenhum envio e nenhuma publicação.
