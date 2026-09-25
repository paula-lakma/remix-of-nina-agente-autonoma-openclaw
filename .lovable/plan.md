# CRM V1 — verificação final de segurança (resultado, read-only)

Rodados agora (25/09 18:29 UTC): varredura de segurança completa e linter do banco. Nada foi alterado.

## 1. Números atuais
- Varredura: 11 itens — 3 críticos, 7 avisos, 1 informativo.
- Linter: 74 itens em 4 tipos — 0008 (1), 0014 extensão em public (1), 0028 anon executa função definer (27), 0029 logado executa função definer (45).

## 2. Itens do CRM
- Nenhum item da varredura cita crm_notes, crm_followups, crm_contact_interests, crm_contact_profiles ou as duas funções.
- RLS ativo nas 4 tabelas, 3 regras em cada, nenhuma liberando anon ou public.
- As duas funções: anon sem EXECUTE (não entram no 0028); logado com EXECUTE (0029, esperado).
- A extensão de busca do CRM (pg_trgm) está no schema `extensions`, então o aviso 0014 não é dela.
- Sem RLS ausente, regra permissiva, definer insegura ou elevação de privilégio no CRM.

## 3. Os 2 avisos 0029
Seguem esperados: as funções continuam executáveis só por usuário logado e o teste anterior mostrou 0 linhas para os papéis fora de admin/sdr. O linter só devolveu o total (45) por tipo, sem listar nomes; a presença das duas no 0029 é deduzida da permissão, não lida na lista.

## 4. Permissão técnica de anon nas tabelas crm_*
Continua existindo e continua sem efeito: nenhuma regra libera anon, então anon lê 0 linhas e não grava. Não alterada.

## 5. Os 6 alertas antigos (inalterados, todos de 02/09)
Regras que deixam qualquer usuário logado ler tudo em:
1. team_members (crítico)
2. teams (crítico)
3. pipeline_stages (crítico)
4. tag_definitions (aviso)
5. team_functions (aviso)
6. skill_packs (informativo)

Também continuam os 5 avisos de arquivos (whatsapp-media e brain-media), da mesma data. Nenhum foi agravado pelo CRM.

## 6. Itens novos
Nenhum item novo na varredura. Todos os 11 já existiam em 02/09. Os totais do linter não puderam ser comparados item a item com a rodada anterior.

## 7. Bloqueio para o Publish
Nenhum bloqueio de segurança vindo do CRM V1.

## 8. Nada alterado
Sem mudança em banco, regras, permissões, funções, código, Chat, Nina, Pipeline, encaminhamentos, WhatsApp, Shopify, rastreio, papéis, contas ou senhas.
