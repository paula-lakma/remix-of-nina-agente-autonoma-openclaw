# Dashboard MASTER V1 — plano final (aguardando aprovação)

Baseado na auditoria aprovada. Não usa o Pipeline. Nada é implementado até você aprovar.

## 1. KPIs da visão geral (filtros Hoje / 7 dias / 30 dias)

| Card | Definição exata | Fonte |
|---|---|---|
| Conversas recebidas no período | conversas com mensagem do cliente no período (contagem de conversas distintas) | mensagens |
| Conversas com a Nina agora | conversas ativas, sem responsável humano e com a Nina ligada | conversas |
| Atendimentos humanos ativos agora | conversas ativas com responsável atribuído e atendimento não finalizado | conversas |
| Encaminhamentos no período | eventos de encaminhamento (logística, dermoconsultora, parcerias, comercial) criados no período; reativações e respostas não contam | eventos de encaminhamento |
| Atendimentos finalizados no período | eventos de finalização criados no período | eventos de encaminhamento |
| Novos leads no período | contatos criados no período | contatos |

Removidos da V1: Conversões e Tempo Médio (sem dado confiável). Gráfico de volume por dia continua, alimentado pelas mensagens.

## 2. Atendimentos por responsável

Tabela com uma linha por pessoa (Leticia, Carla, Paula Rodrigues, Cris, Barbara, Mylena, Talia, Laura e demais responsáveis válidos):

- **Ativos agora**: conversas ativas atribuídas à pessoa, com atendimento humano ainda em aberto.
- **Recebidos no período**: eventos de encaminhamento no período em que a pessoa foi a destinatária. Cada evento conta uma vez; reativações da Nina, respostas e reaberturas não contam.
- **Finalizados no período**: eventos de finalização no período feitos pela pessoa.

Linhas com tudo zerado aparecem com traço, para deixar claro que a pessoa não tem movimento no período.

## 3. Fila de atenção — "Atendimentos que precisam de atenção"

Somente atendimentos humanos ativos, com: cliente, responsável, motivo do encaminhamento, última atividade, tempo parado e status. Ordenados do mais parado para o mais recente, com faixas de destaque: até 30 min, 30 min–1h, 1h–4h, 4h–24h, mais de 24h.

## 4. Bloco de rastreio (no período)

Total enviado, Correios, Jadlog, automático Shopify, manual, sucesso, falha, bloqueados por duplicidade e indeterminados. Envios manuais por usuário quando houver identificação do solicitante. A origem já é gravada como "shopify" ou "manual", então acrescentar "Frenet" no futuro é só um novo valor — nenhuma mudança agora.

## 5. Status do Sistema

Passa a ter dois blocos: **Essenciais** (identidade, WhatsApp, agente, horário, Lovable AI, perfil, configurações) com a porcentagem e a cor do cartão, e **Opcionais** (ElevenLabs), exibido separadamente e sem afetar a porcentagem. O ElevenLabs continua visível nos detalhes como integração opcional não configurada.

## 6. Acesso

Todo o painel novo é exclusivo do admin (paula@lakma.com.br). sdr, parcerias, expedicao, rastreio e dermo não ganham nada — a rota do Dashboard já é restrita a admin.

## 7. Detalhes técnicos

- **Sem RPC e sem migration.** Verifiquei as permissões: o admin já lê conversas, mensagens, contatos, eventos de encaminhamento, travas de rastreio e histórico manual diretamente. Os volumes são pequenos (1.282 mensagens, 934 registros de rastreio), então as contagens podem ser feitas por consultas de contagem no próprio cliente, em paralelo.
- Consultas usam `count` sem trazer linhas, exceto a fila de atenção e a tabela por responsável, que trazem poucas linhas.
- Arquivos afetados: `src/services/api.ts` (novas funções de métricas, removendo as quebradas), `src/components/Dashboard.tsx` (novos cards, tabela por responsável, fila de atenção, bloco de rastreio), novos componentes em `src/components/dashboard/`, `src/components/SystemHealthCard.tsx` e `supabase/functions/validate-setup/index.ts` (separação essenciais/opcionais).
- Testes: novos testes unitários para o cálculo das faixas de tempo parado, para a contagem por responsável (não contar reatribuição/resposta/reabertura) e para o cálculo de essenciais x opcionais. Suíte atual (224 testes) deve continuar verde.
- Performance: cerca de 10 consultas leves em paralelo por carregamento, mesma ordem de grandeza do painel atual.
- Publicação: só a interface do painel e a função de verificação do sistema; nada de banco.

## 8. Confirmações

- **Pipeline fica fora desta implementação.** Fica registrado: dois gatilhos criam cards, 467 contatos geraram 934 cards, duplicação sistemática, etapas automáticas parcialmente inativas, Pipeline não é fonte de métricas. Correção em etapa separada.
- **`attendance_finished` não será corrigido nem preenchido retroativamente**; a métrica usa os eventos reais.
- **Tempo médio da Nina não entra na V1**; a Nina não é reinstrumentada.
- **Os 6 alertas de segurança continuam pausados.**
- Nada de chats, encaminhamentos, rodízio, rastreio, Shopify, WhatsApp, papéis, RLS ou contas é alterado.
