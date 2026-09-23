# Dashboard MASTER V1 — plano final (aguardando aprovação)

Baseado na auditoria aprovada. Não usa o Pipeline. Nada é implementado até você aprovar.

## 0. Definição de "atendimento humano realmente ativo" (fechada)

Condição única, usada nos três lugares (card, tabela por responsável e fila de atenção). Uma conversa conta quando **todas** são verdadeiras:

1. conversa ativa;
2. tem responsável atribuído;
3. atendimento não finalizado;
4. **e** apresenta pelo menos um sinal real de atendimento humano: Nina pausada, takeover humano marcado ou tipo de encaminhamento preenchido.

O item 4 é o que exclui o caso residual que você citou (status Nina, sem pausa, sem takeover, mas com responsável antigo). Verifiquei agora: com a regra completa dá **24 conversas** e **nenhuma** atribuição residual — ou seja, a regra não quebra nenhum fluxo (Leticia, Carla, Paula Rodrigues, dermoconsultoras). Das 24, 23 também têm permissão de acesso ativa; a exceção é uma atribuição feita direto pelo admin, que é legítima — por isso a permissão de acesso entra como reforço, não como exigência.

Quando uma conversa volta para a Nina (permissão revogada e marcas de encaminhamento limpas), ela deixa de contar automaticamente.

## 1. KPIs da visão geral (filtros Hoje / 7 dias / 30 dias)

| Card | Definição exata | Fonte |
|---|---|---|
| Conversas recebidas no período | conversas distintas com mensagem do cliente no período | mensagens |
| Conversas com a Nina agora | conversas ativas, sem atendimento humano ativo (regra acima) e com a Nina ligada | conversas |
| Atendimentos humanos ativos agora | regra do item 0 | conversas |
| Encaminhamentos no período | eventos de encaminhamento (logística, dermoconsultora, parcerias, comercial) criados no período; reativação, resposta e reabertura não contam | eventos de encaminhamento |
| Atendimentos finalizados no período | eventos de finalização criados no período | eventos de encaminhamento |
| Novos leads no período | contatos criados no período | contatos |

Removidos da V1: Conversões e Tempo Médio. Gráfico de volume por dia continua, alimentado pelas mensagens.

## 2. Atendimentos por responsável

Uma linha por pessoa (Leticia, Carla, Paula Rodrigues, Cris, Barbara, Mylena, Talia, Laura e demais válidos):

- **Ativos agora**: conversas que atendem à regra do item 0 e estão atribuídas à pessoa.
- **Recebidos no período**: eventos de encaminhamento no período em que a pessoa foi a destinatária; cada evento conta uma vez.
- **Finalizados no período**: eventos de finalização no período feitos pela pessoa.

Linhas zeradas aparecem com traço.

## 3. Fila de atenção — "Atendimentos que precisam de atenção"

Somente atendimentos da regra do item 0, com cliente, responsável, motivo, última atividade, tempo parado e status. Ordem do mais parado para o mais recente, com faixas: até 30 min, 30 min–1h, 1h–4h, 4h–24h, mais de 24h.

## 4. Bloco de rastreio — fonte de verdade por número (fechada)

**Fonte principal: as travas de envio de rastreio.** Toda origem passa por ela (automático e manual), então ela evita dupla contagem; o histórico manual serve apenas para o que não existe na trava.

| Número | Critério | Fonte |
|---|---|---|
| Enviados com sucesso ("Total enviado") | travas com resultado de envio concluído no período | travas de rastreio |
| Correios / Jadlog | mesmos envios concluídos, agrupados por transportadora | travas de rastreio |
| Automático Shopify | envios concluídos com origem Shopify | travas de rastreio |
| Manual | envios concluídos com origem manual | travas de rastreio |
| Bloqueados por duplicidade | tentativas manuais recusadas por duplicidade + eventos da Shopify ignorados por duplicidade | histórico manual + eventos Shopify |
| Falhas | travas com resultado de falha + tentativas manuais com falha | travas + histórico manual |
| Indeterminados | eventos da Shopify sem transportadora reconhecida ou sem código, que não geraram envio | eventos Shopify |
| Envios manuais por usuário | envios concluídos de origem manual, agrupados por quem solicitou | histórico manual |

Total enviado nunca inclui duplicidade, falha, indeterminado ou tentativa não enviada.

Dois pontos reais dos dados de hoje, que o painel vai tratar na exibição (sem alterar nada no banco):

- há registros antigos com transportadora gravada como "Frenet" (11), "Other" (83) e maiúsculas/minúsculas misturadas; o painel normaliza para Correios/Jadlog pela mesma regra do backend e mostra o que não for reconhecido como "Outros (histórico antigo)";
- há 56 registros de origem "shopify_seed" (carga antiga, sem transportadora); entram como histórico antigo, fora de Correios/Jadlog.

A separação por origem já existe como campo, então acrescentar "Frenet" no futuro é apenas um novo valor — nada é implementado agora.

## 5. Status do Sistema

Dois blocos: **Essenciais** (identidade, WhatsApp, agente, horário, Lovable AI, perfil, configurações) definindo a porcentagem e a cor; **Opcionais** (ElevenLabs) exibido separadamente, sem afetar a porcentagem e ainda visível nos detalhes.

## 6. Acesso

Exclusivo do admin (paula@lakma.com.br). sdr, parcerias, expedicao, rastreio e dermo não ganham nada.

## 7. Detalhes técnicos

- **Sem RPC e sem migration.** O admin já lê conversas, mensagens, contatos, eventos de encaminhamento, travas de rastreio, histórico manual e eventos da Shopify pelas permissões atuais. Volumes pequenos (1.282 mensagens, ~300 travas), então contagens diretas bastam.
- Arquivos afetados: `src/services/api.ts` (novas funções de métricas, removendo as quebradas), `src/components/Dashboard.tsx`, novos componentes em `src/components/dashboard/`, `src/components/SystemHealthCard.tsx` e `supabase/functions/validate-setup/index.ts`.
- Testes: regra de atendimento humano ativo (inclui o caso residual que não deve contar), faixas de tempo parado, contagem por responsável sem contar reatribuição/resposta/reabertura, normalização de transportadora no painel e separação essenciais x opcionais. Suíte atual (224 testes) deve continuar verde.
- Performance: cerca de 12 consultas leves em paralelo por carregamento.
- Publicação: interface do painel e função de verificação do sistema; nada de banco.

## 8. Confirmações

- **Pipeline fora desta implementação.** Registrado: dois gatilhos criam cards, 467 contatos geraram 934 cards, duplicação sistemática, etapas automáticas parcialmente inativas, Pipeline não é fonte de métricas.
- **`attendance_finished` não é corrigido nem preenchido retroativamente**; finalizações vêm dos eventos.
- **Tempo médio da Nina fora da V1**; a Nina não é reinstrumentada.
- **Os 6 alertas de segurança continuam pausados.**
- Nada de chats, encaminhamentos, rodízio, rastreio, Shopify, WhatsApp, papéis, RLS ou contas é alterado.
