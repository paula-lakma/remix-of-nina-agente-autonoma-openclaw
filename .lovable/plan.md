# Diagnóstico — NINA pedindo "tipo de pele" antes de enviar o link

Somente diagnóstico. Nenhum arquivo do projeto foi alterado.

## A) Origem exata do comportamento

Não é o System Prompt novo. O prompt novo **entrou** no cérebro, mas ele **não é o único texto que a instância lê**. O OpenClaw lê o workspace inteiro da skill, e três fontes concorrentes ainda mandam qualificar antes de indicar:

1. **`knowledge/produtos.md` gerado pelo `brain-build`** — o cabeçalho é escrito em código (hardcoded), não vem do cérebro novo, e contém uma regra explícita de pergunta obrigatória antes da indicação.
2. **Arquivos estáticos da skill que o Brain Build nunca reescreve** — `skills/nina/SKILL.md` e `skills/nina/prompts/conversa.md` continuam com o protocolo antigo "SDR consultiva / Descoberta é prioridade máxima / uma pergunta aberta por vez".
3. **Dados do próprio produto** — o "Sabonete de Ácido Glicólico - 150ml" está com `tipo_uso = NULL` e `categoria_intencao = []`, e o campo "Tipo de pele / condição indicada" contém a ressalva *"evitando peles sensibilizadas, irritadas, descamando ou lesionadas"*. Com a regra do item 1 ativa, o modelo entende que precisa confirmar a pele antes de liberar o link.

## B) Arquivo / função / bloco responsável

| # | Arquivo | Bloco | Papel |
|---|---------|-------|-------|
| 1 | `supabase/functions/brain-build/index.ts` | `renderProducts()`, linhas 101 e 128 | Injeta a regra de qualificação obrigatória em `produtos.md` |
| 2 | `supabase/functions/brain-build/index.ts` | `renderIdentity()`, linha 65 e 72 | Rotula a Nina como "SDR consultiva" e rebaixa o System Prompt novo para a seção `## Instruções adicionais`, abaixo da identidade hardcoded |
| 3 | `skills/nina/prompts/conversa.md` linhas 7–16 e `skills/nina/SKILL.md` linha 42–43 | protocolo antigo | Ficam no workspace da VPS; o `brain_sync.sh` copia a pasta inteira do branch, mas o `brain-build` só grava `identity/*` e `knowledge/*` — esses dois nunca são regenerados |
| 4 | `brain_products` (registro do glicólico) | `tipo_uso` nulo, `skin_types` com ressalva | Dispara a "necessidade de confirmar" |
| — | `supabase/functions/nina-reply/index.ts` | — | **Inocente**: não monta prompt nenhum, só entrega texto e faz handoff/marcadores |

## C) Trechos que causaram o comportamento

`brain-build/index.ts:128`:

```text
Quando o lead pedir peeling, clareamento, manchas..., faça PRIMEIRO esta única
pergunta de qualificação: "Você procura para uso profissional ou para home care?"
```

`brain-build/index.ts:101`:

```text
Só faça UMA pergunta antes de indicar quando: não souber se é uso pessoal/home care
ou profissional/cabine; a necessidade estiver confusa; houver risco técnico...
pele sensibilizada/lesionada... Nesses casos, uma pergunta de cada vez.
```

`brain-build/index.ts:65` (identidade):

```text
- **Persona:** Nina (SDR consultiva)
```

`skills/nina/prompts/conversa.md:16`:

```text
2. **Descoberta (prioridade máxima):** ... 3. Educação ...
```

`skills/nina/identity/identity.md` (estático no repo, ainda com conteúdo "Viver de IA"):

```text
2. Objetivo: fazer o lead falar 70% do tempo...
3. Regra de ouro: nunca faço uma afirmação se puder fazer uma pergunta aberta.
```

## D) O teste usou cérebro novo ou cache?

**Cérebro novo — mas misturado com o antigo.** Evidências:

- `nina_settings.system_prompt_override` tem 19.588 caracteres, salvo em 12/08 19:19 UTC.
- A instância `srv1775861` está **online**, último heartbeat 19:35 UTC, e o `system_prompt` reportado **contém o bloco `<identity>` do prompt novo** — ou seja, o build entrou e o sync chegou na VPS.
- No mesmo texto ainda aparecem `Instruções adicionais` (posição 1503) e o rótulo "SDR consultiva" antes dele.
- O `system_prompt` gravado tem **exatamente 22.000 caracteres**, valor redondo que indica **truncamento** no caminho heartbeat → banco. Isso afeta o que o painel exibe; o arquivo real na VPS não é truncado, mas impede auditoria confiável pelo painel.
- Não há cache de prompt no backend: `nina-reply` não monta prompt, e o `nina-orchestrator` só usa `system_prompt_override` no caminho AI-Gateway (não usado quando a instância OpenClaw responde).

Conclusão: **não é cache antigo** — é **coexistência** do prompt novo com regras antigas hardcoded e arquivos estáticos não regenerados.

## E) Correção mínima recomendada (não executada)

1. **`brain-build/index.ts` — remover/condicionar as regras hardcoded de qualificação** (linhas 101 e 128): quando o lead já informou produto específico + tipo de uso, indicar direto. Manter a pergunta apenas para caso sensível real (gestação, alergia, reação, pele lesionada).
2. **Inverter a precedência em `renderIdentity()`**: o `system_prompt_override` deve abrir o `identity.md` como fonte primária de verdade, não como "Instruções adicionais" no rodapé; e trocar o rótulo "SDR consultiva" pelo posicionamento comercial novo.
3. **Fazer o `brain-build` regravar também `skills/nina/SKILL.md`, `skills/nina/prompts/conversa.md` e `skills/nina/identity/soul.md`** no branch `nina-brain`, alinhados ao prompt novo — hoje esses arquivos ficam presos na versão "Viver de IA / descoberta primeiro".
4. **Completar o cadastro do produto**: definir `tipo_uso` do Sabonete Glicólico (`home_care` ou `ambos`) e `categoria_intencao`, e mover a ressalva de pele sensibilizada de "tipo de pele indicada" para o campo de contraindicação/segurança, para ela não virar gatilho de pergunta.
5. **Corrigir o truncamento de 22.000 caracteres** no heartbeat/coluna `instances.system_prompt`, para auditar o prompt real da VPS.
6. **Observação fora de escopo, mas relevante:** `nina_settings` está com `coupon_code = LAKMA30` e `coupon_discount_percent = 30`, enquanto o `produtos.md` gerado escreve **LAKMA35 / 35%** — fonte dupla e divergente de cupom.

Nenhuma dessas mudanças foi aplicada. Aprove para eu executar as que você escolher.
