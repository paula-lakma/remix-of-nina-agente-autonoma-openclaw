# Teste real da prioridade da Laura — auditoria read-only e correção mínima

Auditoria feita agora, sem alterar banco, código, contas ou conversas.

## 1. Classificação real da mensagem sensível

Texto avaliado (idêntico ao enviado):
"Estou usando um ácido e minha pele ficou muito vermelha e ardendo. Posso continuar usando?"

Execução real de `detectHandoffTarget(...)` → **null**. Nenhuma entrada da matriz sensível casou.

## 2. Motivo canônico detectado

**Nenhum.** A entrada `reacao` exige literalmente `reação` / `reagiu` / `ardência forte` / `inchaço`;
a mensagem diz "vermelha e ardendo". `pele_sensibilizada` exige `sensibiliz` / `pele sensível` /
`lesionad`. "ácido", "vermelha", "ardendo", "irritada", "queimando", "coçando", "descamando"
não existem em nenhuma regex.

## 3. O motivo é sensível?

Não se aplica — não houve motivo. Se `reacao` tivesse casado, ele resolve para o canônico
`reaction`, que **está** na allowlist de `public.is_sensitive_dermo_reason`. Ou seja, a regra de
prioridade da Laura está correta; ela simplesmente nunca foi alcançada.

## 4. `isConfirmedHandoffResponse` da frase da Nina

Testado com a frase real ("Vou te encaminhar agora para a nossa dermoconsultora...") → **true**.
A palavra "agora" **não** quebra a regex. Este ponto não é a causa.

## 5. `resolveHandoffDecision`

`target: null`, `source: "customer_intent"`, sem marcador `[[HANDOFF:...]]` no texto do agente
(o texto limpo é idêntico ao original, logo nenhum marcador foi emitido nem extraído).
Sem motivo estruturado e sem classificação de texto, não há alvo.

## 6. `applyHandoff` / `pick_dermo_assignee` / prioridade da Laura

Nada executou. `applyResolvedHandoff` só roda com `target` preenchido.
`pick_dermo_assignee` não foi chamado, nenhuma dermoconsultora foi escolhida e o ramo
`sensitive_direct` da Laura não chegou a executar. Não houve erro posterior.

## 7. Estado real da conversa (Joao Felipe, `a7b8eddb-…a5a1`)

| Campo | Valor |
| --- | --- |
| status | `nina` |
| ai_paused | `false` |
| human_takeover_required | `false` |
| requires_dermoconsultant | `false` |
| handoff_type / handoff_reason | `null` / `null` |
| assigned_user_id / assigned_at | `null` / `null` |
| attendance_finished | `false` |
| human_status | `devolvido_para_nina` |
| last_message_at | 08/09 19:34 UTC |

## 8. Grants e eventos após 16:33 (19:33 UTC)

Nenhum. Os últimos registros do dia são de 15:51 UTC (handoff `dermoconsultora_request`, já
inativo) e 16:11 UTC (`nina_reactivated`). Zero grant, zero evento no horário do teste.

## 9. Laura

Ativa, `lauralakma@outlook.com` vinculada ao team_member correto, Dermoconsultora Sênior.
`pick_dermo_assignee` reconhece o e-mail novo (e mantém o legado como fallback) e retorna
`sensitive_direct` para os motivos sensíveis. Nenhuma condição faria o caso cair no
least-loaded — exceto Laura inativa, o que não ocorre.

## 10. Ponto exato onde o fluxo parou

`detectHandoffTarget` dentro de `resolveHandoffDecision`
(`supabase/functions/_shared/handoff.ts`, matriz sensível) — retornou `null`.

## 11. Causa raiz

A matriz de casos clínicos sensíveis cobre o **vocabulário técnico** ("reação", "alergia",
"sensibilizada") mas não o **vocabulário real do cliente** para uma reação adversa em curso:
pele vermelha, ardendo, queimando, irritada, coçando, descamando, ferida/ferindo, após uso de
ácido/peeling. Como nada casa, não existe motivo — e sem motivo não há handoff nem prioridade.

Ponto secundário observado (não é a causa deste caso, mas fragiliza o fluxo): motivos dermo
clínicos ainda dependem de a Nina escrever uma frase de confirmação. Só `financeiro` e
`dermoconsultora_request` são determinísticos hoje.

## Correção mínima proposta

Somente em `supabase/functions/_shared/handoff.ts`:

1. **Ampliar a entrada `reacao`** (que resolve para o canônico `reaction`, já sensível) para
   reconhecer sinais de reação adversa em curso descritos em linguagem natural, exigindo
   **sintoma + pele/uso de produto** no mesmo texto: vermelhid[ãa]o/vermelha, ardendo/ardência,
   queimando/queimou, irritada/irritação, coçando/coceira, descamando/descamação, inchou,
   bolha, "ficou ferida", combinados com "pele"/"rosto"/"após usar"/"usando o ácido/peeling".
   Frases informativas sem sintoma atual (ex.: "quais ácidos vocês têm?") continuam **sem**
   handoff.
2. **Tornar determinístico o handoff para motivos clinicamente sensíveis**, igual ao que já
   existe para logística e `dermoconsultora_request`: quando `detectHandoffTarget` devolver um
   motivo sensível, o encaminhamento acontece independentemente da frase escolhida pelo modelo.
3. Nenhuma mudança em `is_sensitive_dermo_reason`, `pick_dermo_assignee`, prioridade da Laura,
   `dermoconsultora_request`, balanceamento, Leticia/logística, reabertura, RLS, WhatsApp,
   Shopify, chat-media, contas ou histórico. Nenhuma migration.

**Testes a adicionar** em `src/__tests__/handoff-classification-matrix.test.ts`:
a mensagem real do teste e variações ("minha pele está queimando depois do ácido",
"fiquei toda vermelha e coçando", "minha pele descamou muito") → motivo `reaction`,
destino `dermoconsultant`, sensível = true; negativos ("qual ácido vocês indicam?",
"quero saber sobre ácido hialurônico") → `null`; logística continua com precedência;
`dermoconsultora_request` e demais casos inalterados.

Depois: suíte completa + typecheck e publicação apenas de `nina-reply` e `nina-orchestrator`.

**Validação**: repetir a mensagem real do teste e confirmar Pausado + Dermo +
`handoff_reason=reaction` + atribuição direta à Laura (`mode: sensitive_direct`), com grant e
evento criados.

## Fora do escopo

João Felipe não é atribuído, normalizado nem alterado; nenhuma mensagem é enviada;
nenhum grant ou evento é criado nesta etapa.
