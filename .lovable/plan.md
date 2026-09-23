# Auditoria do Dashboard e do Pipeline (somente leitura)

Nada foi alterado. Abaixo o que encontrei e a proposta de Dashboard MASTER V1.

## 1. Indicadores do Dashboard hoje

| Indicador | Fonte | Funciona? | Por que aparece zerado |
|---|---|---|---|
| Atendimentos (Hoje/7/30) | conversas com última mensagem no período | Sim | Hoje só 1 conversa teve mensagem; o volume real é baixo por dia (43 mensagens nas últimas 24h) |
| Conversões | negócios "ganhos" + agendamentos | Não | Nunca houve negócio marcado como ganho (0 de 934) e não existe nenhum agendamento. Sempre será 0 |
| Tempo Médio | campo de tempo de resposta nas mensagens | Não | Só 19 mensagens em 1.282 têm esse tempo, e a última é de 07/07. O caminho atual da Nina não grava mais esse dado |
| Novos Leads | contatos criados no período | Sim | 31 contatos nas últimas 24h; funciona |
| Volume de Atendimentos (gráfico) | mensagens por dia | Sim | Funciona |
| Conversões (barras) | mesma fonte quebrada acima | Não | Sempre 0 |

Resumo: metade do painel é interface sem dado confiável.

## 2. Status do Sistema

A verificação roda 8 itens e calcula uma única porcentagem. O ElevenLabs entra como "aviso" quando não tem chave, e isso derruba a porcentagem geral e pinta o cartão de amarelo, mesmo com tudo essencial certo.

Menor alteração proposta (não aplicada): marcar o ElevenLabs como opcional na verificação e mostrar duas linhas — "Essenciais: X% configurados" e, abaixo, "Opcionais: ElevenLabs não configurado". A porcentagem e a cor passam a considerar só os essenciais; o ElevenLabs continua visível na lista de detalhes.

## 3. Pipeline: não é fonte confiável hoje

- Cada contato novo cria negócio automaticamente — mas existem **dois gatilhos duplicados** fazendo isso. Resultado: 934 negócios para 467 contatos, ou seja, **todos os 467 contatos têm card duplicado**.
- Distribuição: Novo lead 747, Qualificando 143, Encaminhado para humano 22, Atendimento concluído 15, Link do site 6, Indicação enviada 1, Sem resposta 0.
- 421 cards sem qualquer movimentação há mais de 30 dias; 12 cards sem conversa correspondente.
- Quem move o card: o encaminhamento para humano move para "Encaminhado para humano" (funciona). As demais etapas dependiam de uma análise automática por IA que **não é mais chamada por nenhum fluxo ativo** — logo, quase nada avança sozinho. "Sem resposta" nunca é usada.
- Valores R$ 0,00: nenhum negócio tem valor preenchido. Campo não utilizado.

Conclusão: o Pipeline serve como quadro manual, mas não deve alimentar métricas.

## 4. O que dá para medir com confiança hoje

Direto das conversas, mensagens, eventos de encaminhamento e rastreio (confiáveis):

- conversas recebidas hoje; conversas com a Nina agora; atendimentos humanos ativos (24 agora)
- encaminhamentos por dia e por tipo (116 registros: logística, dermoconsultora, parcerias, comercial, reativação da Nina, atendimento finalizado, reabertura)
- atendimentos finalizados por dia (pelos eventos — 11 até hoje)
- novos leads por dia
- por responsável: ativos agora, recebidos no período, finalizados no período
- fila de atenção: cliente, responsável, motivo, hora da última mensagem, tempo parado, status
- rastreio: total enviado, Correios x Jadlog, manual x automático, sucesso, bloqueado por duplicidade, falha, indeterminado, por usuário da expedição (298 travas + 10 envios manuais)

Não dá para medir com confiança hoje:

- conversões / vendas (nenhum dado real)
- tempo médio de resposta da Nina (parou de ser gravado em julho)
- "conversas resolvidas sem humano" (só por aproximação; hoje nenhuma conversa tem a marca de finalizada no campo próprio — só nos eventos)
- qualquer métrica baseada em etapa do funil

## 5. Proposta de Dashboard MASTER V1 (só para admin)

1. **Visão geral do dia**: conversas recebidas, com a Nina agora, atendimentos humanos ativos, encaminhamentos hoje, finalizados hoje, novos leads.
2. **Por responsável**: tabela com ativos agora, recebidos e finalizados no período (Leticia, Carla, Paula Rodrigues, Cris, Barbara, Mylena, Talia, Laura e demais).
3. **Fila de atenção**: atendimentos humanos ativos ordenados por tempo parado, com destaque para os mais antigos.
4. **Rastreio**: enviados no período, por transportadora, manual x automático, bloqueados e falhas.
5. **Status do Sistema**: mantido, com essenciais e opcionais separados.
6. Filtros Hoje / 7 dias / 30 dias mantidos. Cards sem dado confiável (Conversões, Tempo Médio) saem do painel, em vez de mostrar zero.

## 6. O que precisa ser corrigido antes

- Remover o gatilho duplicado de criação de card e limpar os duplicados já existentes (só com sua aprovação; mexe no Pipeline).
- Decidir se o campo "atendimento finalizado" deve ser corrigido ou se as métricas usam apenas os eventos de encaminhamento (recomendo os eventos, sem mexer em dados).
- Decidir se o tempo de resposta da Nina volta a ser gravado (mudança no fluxo da Nina; fora do escopo deste painel).

## Detalhes técnicos

- Dados vêm de `conversations`, `messages`, `contacts`, `conversation_handoff_events`, `tracking_send_locks`, `manual_tracking_logs`.
- Arquivos envolvidos: `src/components/Dashboard.tsx`, `src/services/api.ts` (`fetchDashboardMetrics`, `fetchChartData`), `src/components/SystemHealthCard.tsx`, `supabase/functions/validate-setup/index.ts`.
- Métricas por responsável e fila de atenção pedem uma consulta agregada; como só o admin vê, pode ser feita no cliente com as políticas atuais, ou via função no banco (mais rápida) — decidir na implementação.
- Migrations necessárias: nenhuma para o painel. Apenas se aprovarmos a limpeza dos cards duplicados (remoção de um gatilho + deduplicação).
- Riscos: a deduplicação de cards altera o Pipeline; nada mais toca chats, encaminhamentos, papéis, RLS, Shopify, WhatsApp ou contas. Plano dos 6 alertas de segurança segue pausado.
