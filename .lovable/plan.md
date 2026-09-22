# Auditoria (somente leitura) — conversa da Duda com "Nina" + responsável Leticia

Nada foi alterado. Abaixo o resultado e a correção mínima proposta, que só será feita com aprovação.

## Resultado

1. **Conversa:** `a0f2aaa4-9baf-4a4c-93fe-ebf99cb00a79` (contato `0874b621-437f-4dd8-920c-7a716febcd3c`, telefone 553791052046). Criada 02/09 15:24; última mensagem 02/09 15:27:45; última alteração 03/09 11:35:37.
2. **Estado atual:** status = nina; ai_paused = false; human_takeover_required = false; assigned_user_id = `22222222-0000-4000-a000-000000000004`; assigned_at, handoff_type, handoff_reason, handoff_created_at = vazios; attendance_finished = false (sem data/autor); human_status = vazio.
3. **Leticia:** o valor aponta para o cadastro de equipe da Leticia (financeiro@lakma.com.br). Não existe nenhuma permissão de acesso (grant) para ela nesta conversa — nem ativa nem antiga. Por isso ela **não vê** essa conversa no chat dela; só o admin vê o nome "Leticia" no campo Responsável.
4. **Histórico de encaminhamento:** **nenhum registro**. A Nina disse "vou encaminhar para a equipe", mas nenhum encaminhamento foi criado (sem evento, sem pausa, sem grant). Não houve finalização nem reabertura.
5. **Quando "voltou" para Nina:** nunca saiu da Nina. O único campo fora do padrão é o responsável, gravado sozinho em 03/09 11:35, cerca de 20h após a última mensagem, sem nenhum outro campo junto.
6. **Estado correto hoje:** cenário B (Nina ativa, sem responsável). Não há atendimento humano ativo com a Leticia.
7. **Grant residual:** não existe.
8. **Caso isolado:** sim. Das conversas ativas, esta é a **única** com Nina ativa + responsável humano preenchido.
9. **Outras no mesmo estado:** 0.

## Causa (provável, não 100% confirmada)

O responsável foi preenchido isoladamente em 03/09 11:35, sem pausar a Nina, sem criar encaminhamento e sem grant. Esse padrão corresponde à troca manual no seletor "Responsável" da versão anterior a 09/09 (antes da correção que passou a fazer o encaminhamento completo ao escolher a Leticia), ou a um ajuste manual naquela data. O sistema não guarda autor dessa alteração, por isso a origem exata não pode ser provada.

Problema secundário real: a Nina prometeu encaminhar e o encaminhamento não aconteceu em 02/09 (reclamação de produto faltante). Não investigado a fundo aqui.

## Correção mínima proposta (aguarda aprovação)

Uma única alteração de dados só nesta conversa: limpar o responsável (assigned_user_id = vazio). Nada mais muda — Nina segue ativa, sem grant, sem evento, sem mensagem. Efeito: some do grupo "atendimentos humanos" na lista do admin e o filtro "Leticia" passa a mostrar 20 conversas.

Alternativa, se a reclamação da Duda ainda estiver pendente: em vez de limpar, fazer o encaminhamento completo para a Leticia pelo seletor atual (pausa a Nina e cria o acesso dela).
