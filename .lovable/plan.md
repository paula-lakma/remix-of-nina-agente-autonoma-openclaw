# Roteamento completo de entrega/frete/prazo/logística para a Leticia

## Causa exata do bug

A classificação vive em um único lugar: `supabase/functions/_shared/handoff.ts`, na matriz de regex `REASON_MATRIX` (fallback determinístico), consumida por `resolveHandoffDecision()` e aplicada por `applyResolvedHandoff()` (que chama a RPC existente `apply_expedicao_handoff`). O orchestrator, o callback `nina-reply` e o `reap-orphan-runs` já usam essa mesma decisão.

No caso da **Wellen Cristine** (conversa `9ea95d72…`, ainda `status=nina`, sem pausa, sem handoff, sem concessão), as mensagens reais foram:

- "Foi enviado hoje?"
- "É que paguei pelo frete que chegaria em quatro dias"
- "E pedi na quinta se não me engano"

Execução real do classificador atual sobre essas três frases retorna `null` nas três. Motivos:

- não existe regra para **envio/postagem/despacho** isolado ("foi enviado hoje?", "já foi postado?");
- a regra de frete exige a palavra `frete`/`endereço` seguida em até 35 caracteres de `pedido|entrega|compra` — "frete que chegaria em quatro dias" não casa;
- a regra de prazo exige `prazo|previsão` + `entrega|pedido` — "chegaria em quatro dias" / "quando chega" não casa;
- `paguei` não casa com a regex financeira (`pagamento|pagar`).

Sem motivo estruturado vindo do agente e sem match no fallback, `resolveHandoffDecision` devolve `target: null` e **nenhum handoff é aplicado** — mesmo a Nina tendo escrito ao cliente que "já repassei para a expedição". Ou seja: a lacuna é de **cobertura da matriz de intenção**, não da RPC, nem das concessões, nem da tela da Leticia (todas já funcionam, comprovado pelos casos `carrier_question` ativos da Sheila, Stefanie, Anny, Rosana, João Felipe e Thais).

## Mudança mínima necessária

Somente ampliar a cobertura da matriz financeira/expedição em `_shared/handoff.ts`, reutilizando motivos canônicos **já existentes** e já presentes na allowlist `EXPEDICAO_GRANT_REASONS`:

| Intenção não coberta hoje | Motivo existente a usar |
|---|---|
| "foi enviado hoje?", "já postou?", "já despachou?", "saiu para entrega?" | `shipped_no_info` |
| "quando chega", "chegaria em X dias", "quanto tempo demora", prazo/previsão soltos | `order_financial_question` |
| frete pago / frete expresso / valor do frete / frete atrasado | `order_financial_question` |
| "ainda não chegou", "não recebi minha encomenda", localização do pedido | `where_is_my_order` |
| logística pós-compra: postagem, expedição, entrega, encomenda, transportadora, Correios/Jadlog | motivo já existente correspondente |

Também alinhar as instruções de prompt (`TRACKING_HANDOFF_PROMPT`, `skills/nina/SKILL.md`, `skills/nina/prompts/conversa.md`) para citar envio/postagem/prazo/frete, mantendo o backend como fonte da verdade.

Precedência ajustada: a checagem logística passa a ser avaliada **antes** da `SENSITIVE_REASON_MATRIX`. Se a necessidade/mensagem atual contiver solicitação real de entrega, frete, prazo de entrega, envio, postagem, despacho, transportadora, rastreio, localização do pedido, pedido não recebido ou logística pós-compra, o destino é a **Leticia** — mesmo que a conversa tenha histórico dermatológico ou que a mesma mensagem também mencione um problema de pele. Em conversas **sem** assunto logístico, a classificação de casos sensíveis continua exatamente como hoje, sem qualquer alteração.

### Nada disso muda

Nenhum novo `handoff_type`, RPC, conta, papel, tabela, política ou tela. Dermoconsultoras, Laura e a rotação por carga, Auth, Shopify, WhatsApp sender, envio de rastreio e travas compartilhadas ficam intactos.

## Arquivos que precisariam mudar

- `supabase/functions/_shared/handoff.ts` (matriz + prompt) — único arquivo com lógica.
- `skills/nina/SKILL.md` e `skills/nina/prompts/conversa.md` (texto de instrução).
- Republicação das funções dependentes: `nina-orchestrator`, `nina-reply`, `reap-orphan-runs`, `brain-build`.

## Auditoria das conversas ativas e não finalizadas

Já corretamente com a Leticia (pausadas, atribuídas, concessão ativa) — **não tocar**: Sheila Bruno, Stefanie de Camargo, Rosana Bastos, Lakma Dermocosmeticos (teste), João Felipe, Thais Galvão, Anny Caroline.

Candidatas ao backfill:

| Cliente | Mensagem real | Motivo | Estado atual | Handoff/concessão | Seguro sem mensagem ao cliente |
|---|---|---|---|---|---|
| Wellen Cristine (`9ea95d72…`) | "É que paguei pelo frete que chegaria em quatro dias" / "Foi enviado hoje?" | `order_financial_question` | `status=nina`, ativa, não finalizada | nenhum | Sim — a Nina já disse ao cliente que repassou; o backfill só materializa isso |
| Amanda Mota (`eb54fa34…`) | "Só me confirma se foi alterado número de entrega por favor" | `order_financial_question` | `status=nina`, não finalizada | nenhum | Sim — Nina já afirmou ter encaminhado |
| Aline (`99b9ef38…`) | "Como faço pra acompanhar meus pedidos" / "quantos dias ainda" | `where_is_my_order` | `paused`, `handoff_type=dermoconsultant`, `handoff_reason=sensitive_case`, **sem concessão ativa** | classificação incorreta a corrigir | Sim — incluída no backfill; correção de destino usando a mesma `apply_expedicao_handoff`, sem mensagem ao cliente |

Não são candidatas: `25918df9…` (Jusleyanne — mensagem automática de salão, não é cliente com pedido) e a conversa de rastreio `057bfd43…` da Wellen (apenas notificação Shopify, sem pergunta do cliente).

## Idempotência do backfill

O caminho já é idempotente por construção e será reutilizado sem alteração:

1. `applyResolvedHandoff` verifica antes se a conversa já está `ai_paused` + `human_takeover_required` + `handoff_type=financeiro` + mesmo `handoff_reason` **e** com concessão ativa daquele motivo; nesse caso apenas registra dedup e não chama a RPC.
2. `apply_expedicao_handoff` é atômica: atribui a Leticia, pausa a Nina, cria concessão e evento em uma única operação.
3. O backfill roda um por conversa, verificando o estado antes e depois, e nunca insere em `send_queue` — portanto **zero mensagens ao cliente**.

## Riscos

- **Falso positivo comercial**: termos como "entrega" podem aparecer em conversa de produto. Mitigado mantendo a precedência dermatológica e exigindo contexto de pedido/envio nas novas regras.
- **Volume de handoff para a Leticia** aumenta: mais casos legítimos chegam à fila dela.
- **Aline**: o backfill corrige um handoff já existente (dermoconsultora → Leticia). Como não há concessão dermatológica ativa, não há acesso a revogar; a operação apenas reatribui e cria a concessão correta.
- **Precedência logística**: uma conversa dermatológica que mencione entrega passa a ir para a Leticia. Mitigado exigindo intenção logística explícita na mensagem atual e mantendo o dermatológico à frente quando houver risco clínico presente.
- Republicar `_shared` afeta as quatro funções dependentes — regressão coberta pela suíte existente.

## Plano mínimo de implementação (após aprovação)

1. Ampliar `REASON_MATRIX` em `_shared/handoff.ts` com as intenções de envio/postagem, prazo/previsão, frete e não-recebimento, mapeadas aos motivos canônicos já existentes.
2. Atualizar `TRACKING_HANDOFF_PROMPT` e os dois arquivos de skill.
3. Rodar a suíte existente de classificação (`src/__tests__/handoff-classification-matrix.test.ts`) e ampliar os casos com as frases reais da Wellen.
4. Publicar `nina-orchestrator`, `nina-reply`, `reap-orphan-runs`, `brain-build`.
5. Backfill idempotente de **Wellen, Amanda e Aline** via `apply_expedicao_handoff`, um por vez, com verificação de estado antes/depois e confirmação de fila de envio em zero.
6. Reportar o resultado das três conversas; nenhum outro atendimento é tocado.
