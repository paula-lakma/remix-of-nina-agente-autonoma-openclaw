# CRM V1 — teste transacional final das permissões

Nada é gravado de forma permanente. Cada papel roda num único bloco que começa com BEGIN e termina sempre com ROLLBACK.

## Método de simulação
Dentro de cada bloco:
- `SET LOCAL ROLE authenticated;` (mesmo papel do app logado, com RLS ativo)
- `SELECT set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);` fazendo `auth.uid()` devolver o usuário de referência
- Nenhum login, senha, sessão, token ou conta é usado ou alterado. Só o ID do usuário, e apenas durante a transação.

## Usuários de referência (1 por papel, só o ID)
admin, sdr (2 contas: A cria a nota, B tenta editar), dermo, expedicao, parcerias, rastreio. No resultado, só nome/e-mail e papel.
Contato de referência: 1 contato real existente, usado só como alvo das linhas temporárias do CRM (o contato em si não muda).

## Roteiro por papel
Cada operação fica isolada por SAVEPOINT, para um erro esperado não interromper o resto. Todos os resultados vão para uma tabela temporária do bloco (apagada no ROLLBACK).
1. crm_notes: SELECT (contagem), INSERT da própria nota, UPDATE da própria nota, UPDATE de nota de outro autor, soft-delete.
2. crm_followups: SELECT, INSERT (open), reagendar, concluir, cancelar; CHECKs: `done` sem completed_at/by, `canceled` sem canceled_at, `open` com dados de conclusão (todos devem falhar).
3. crm_contact_interests: SELECT, INSERT, INSERT repetido (deve dar 23505 pelo UNIQUE), DELETE.
4. crm_contact_profiles: SELECT, INSERT/upsert, UPDATE. Para dermo: confirmar que ela lê o contato em `contacts` mas 0 linhas em crm_contact_profiles.
5. crm_list_staff() e crm_user_names(array com IDs reais): contagem de linhas.
6. Papéis bloqueados: esperado 0 linhas nos SELECTs, recusa (42501) nos INSERTs, 0 linhas afetadas nos UPDATE/DELETE.

## Não impacto
Antes e depois: contagem das 4 tabelas crm_*, messages, conversations, conversation_handoff_events, deals, nina_settings e updated_at máximos. Devem ficar idênticos. Nenhuma mensagem, conversa, handoff, card, Nina, senha ou conta tocada. Grants técnicos de anon, os 2 avisos 0029 e os 6 alertas antigos ficam como estão.

## Retorno
Tabela por papel (notes SELECT/INSERT/UPDATE, followups, interests, profiles, list_staff, user_names, resultado) e as respostas 1 a 12 do pedido, incluindo se as permissões podem ser consideradas validadas para o Publish.

## Detalhes técnicos
- Execução pela ferramenta de SQL do backend (a leitura via psql do sandbox não pode trocar de papel nem executar funções). Cada bloco: `BEGIN; SET LOCAL ROLE authenticated; set_config(...); ... ROLLBACK;` Se a ferramenta não aceitar ROLLBACK explícito, o bloco termina com `RAISE EXCEPTION` intencional em `DO $$...$$`, que também desfaz tudo; os resultados são devolvidos na mensagem da exceção.
- Se nenhum dos dois meios garantir o desfazer, paro e aviso sem executar.
