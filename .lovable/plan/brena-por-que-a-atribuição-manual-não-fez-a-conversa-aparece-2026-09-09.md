# Brena — por que a atribuição manual não fez a conversa aparecer para a Leticia

Auditoria read-only concluída. Nada foi alterado.

## 1. Por que a Brena não apareceu para a Leticia

A tela da Leticia (papel `expedicao`) não lista conversas por "responsável". Ela lista
apenas conversas que têm uma **concessão de acesso ativa** com motivo logístico aprovado.
A conversa da Brena não tem nenhuma concessão — por isso está invisível para ela.

Conversa auditada: `1928c6f8-…c984` (Brena kezia✨). Estado atual:

| Campo | Valor |
| --- | --- |
| status | `paused` |
| ai_paused | `false` |
| human_takeover_required | `false` |
| handoff_type / handoff_reason | `null` / `null` |
| assigned_user_id | `22222222-…0004` (Leticia — financeiro@lakma.com.br) |
| assigned_at | `null` |
| attendance_finished | `false` |
| human_status | `null` |

`conversation_access_grants`: **zero registros**.
`conversation_handoff_events`: **zero registros**.

Existe também uma segunda conversa da mesma cliente (`b9199551-…6ec1`, "Brena kezia
silveira Queiroz Silveira"), ainda com a Nina e sem atribuição — não faz parte desta correção.

## 2. Dados que faltam

A listagem da Leticia exige, ao mesmo tempo:
concessão ativa + concessão pertencente ao team_member dela + `assigned_user_id` igual a
esse team_member + motivo dentro da lista logística aprovada.

Hoje só o `assigned_user_id` está correto. Faltam: a concessão ativa, o motivo canônico,
`handoff_type='financeiro'`, `human_status`, `assigned_at` e o evento de handoff.
Além disso, `ai_paused` continua `false` — a pausa feita no painel não persistiu nesse campo.

## 3. Atribuição manual x handoff real

| | Dropdown "Responsável" | apply_expedicao_handoff |
| --- | --- | --- |
| Altera assigned_user_id | sim | sim |
| Cria concessão de acesso | não | sim (revoga anteriores e cria nova) |
| Pausa a Nina | não | sim (`ai_paused`, `status`, `human_takeover_required`) |
| Define motivo/tipo de handoff | não | sim |
| Registra evento de histórico | não | sim |
| Torna visível para a Leticia | **não** | sim |

O dropdown também sincroniza o dono do negócio (deals) — nada além disso.

## 4. Correção mínima proposta (somente a Brena)

Executar uma única chamada da função já existente, sem criar nada novo:

`apply_expedicao_handoff` na conversa `1928c6f8-…c984`, com
motivo `where_is_my_order`, origem `manual`, e mensagem de origem
`a8c272a5-…5dea6` ("Gostaria de saber sobre os meus produtos, por que ainda não chegaram",
09/09 12:36 UTC).

Resultado esperado: Nina pausada, conversa atribuída à Leticia com data, motivo e tipo
financeiro, concessão ativa criada, evento registrado e a conversa passando a aparecer no
Chat ao Vivo da Leticia.

Nenhuma mensagem é enviada à cliente, nada entra na fila de WhatsApp, nenhuma outra
conversa é tocada. Depois confirmo o estado final e que zero mensagens foram enviadas.

## 5. Sobre o dropdown "Responsável" no futuro

Recomendação: manter o dropdown como atribuição visual para os papéis internos, mas,
quando o responsável escolhido for a Leticia (papel logístico), executar o handoff completo
— pedindo o motivo. Hoje o dropdown cria um estado inconsistente: a conversa parece
atribuída no painel e continua invisível para quem deveria atender. Isso é uma mudança
separada, fora desta correção, e só entra se você aprovar depois.

## Preservado

Dermoconsultoras, rodízio, `weight=8` da Talia, prioridade da Laura, classificação sensível,
reabertura, RLS, Shopify, WhatsApp sender, chat-media, contas e histórico.
