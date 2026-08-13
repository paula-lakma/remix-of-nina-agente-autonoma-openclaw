# Corrigir o comportamento de qualificação da NINA

Objetivo: a NINA passar a indicar produto + link diretamente quando houver produto específico, intenção clara de compra e tipo de uso já informado — sem entrevista, sem perguntar tipo de pele "para confirmar se é ideal".

Escopo aprovado: as três frentes de origem do problema + cupom lido dinamicamente do banco.

## 1. Remover as regras hardcoded de qualificação no Brain Build

Arquivo: `supabase/functions/brain-build/index.ts`

- **Linha 128** (`renderProducts`): a regra "faça PRIMEIRO esta única pergunta de qualificação: *Você procura para uso profissional ou para home care?*" cobre praticamente toda intenção real (peeling, clareamento, manchas, acne, rejuvenescimento, hidratação, limpeza). Passa a valer somente quando o tipo de uso **não** foi informado pelo lead e não puder ser inferido do produto (`tipo_uso`).
- **Linha 101**: a lista de exceções que autoriza "UMA pergunta antes de indicar" fica restrita a caso sensível real — gestação, lactação, alergia, reação, pele lesionada, procedimento recente, medicamento, contraindicação. Sai a condição genérica de "necessidade confusa" e sai qualquer gatilho ligado ao campo de tipo de pele.
- Reforço explícito no topo de `produtos.md`: **produto específico + intenção clara + tipo de uso informado = indicar direto**, com foto, nome, link e cupom; proibido segurar o link para "confirmar se é ideal" ou perguntar tipo de pele fora de caso sensível.
- **Linha 65** (`renderIdentity`): remover o rótulo fixo "SDR consultiva".
- **Linha 72**: o `system_prompt_override` deixa de ser a seção final "Instruções adicionais" e passa a abrir o `identity.md` como fonte primária de verdade, com os dados de empresa/tagline/público logo abaixo.

## 2. Passar a regenerar os arquivos estáticos da skill

Hoje o Brain Build só grava `identity/*` e `knowledge/*`. `SKILL.md` e `prompts/conversa.md` ficam presos na versão genérica antiga ("SDR consultiva", "Descoberta é prioridade máxima", "uma pergunta aberta por vez", exemplos de "Viver de IA") e são lidos pelo agente na VPS a cada mensagem.

- O Brain Build passa a gerar e commitar também `skills/nina/prompts/conversa.md` e `skills/nina/SKILL.md` no branch `nina-brain`, alinhados ao System Prompt salvo: fluxo comercial direto, sem etapa obrigatória de descoberta, sem "70% do tempo", sem "nunca afirme se puder perguntar".
- `scripts/` continua intocado (o `brain_sync.sh` já preserva essa pasta).
- O `soul.md` gerado também deixa de herdar linguagem de descoberta obrigatória.

## 3. Alinhar o caminho de teste do painel com a produção

Arquivo: `supabase/functions/nina-test/index.ts`

Hoje o teste envia só a mensagem do lead ao `/hooks/agent`, sem system prompt — então o teste não reflete o cérebro configurado. Passa a montar o mesmo contexto do `nina-orchestrator` (System Prompt efetivo do banco), para o resultado do teste representar a produção.

Arquivo: `supabase/functions/nina-orchestrator/index.ts`

O fallback `getDefaultSystemPrompt()` (linhas 1018-1040) perde o bloco de filosofia de descoberta ("faça o lead falar 70% do tempo", "nunca afirme se puder fazer uma pergunta aberta", "descubra a dor real antes de apresentar soluções"), que hoje é prefixado a toda mensagem enviada ao OpenClaw. O fallback fica neutro; quando houver `system_prompt_override`, ele continua sendo a única fonte.

## 4. Cupom dinâmico (sem alterar valores)

O `brain-build` hoje escreve **LAKMA35 / 35%** em texto fixo. Passa a ler `coupon_enabled`, `coupon_code` e `coupon_discount_percent` de `nina_settings` e renderizar esses valores no `produtos.md`. Quando `coupon_enabled = false`, nenhuma menção a cupom é gerada.

Os valores atuais do banco (LAKMA30 / 30%) **não** serão alterados.

## Fora de escopo (não será tocado)

Produtos, Protocolos, Conhecimentos, Habilidades, pipeline, WhatsApp, handoff, regras de horário da dermoconsultora e o System Prompt salvo pelo usuário.

## Detalhes técnicos

- Alterações em: `supabase/functions/brain-build/index.ts`, `supabase/functions/nina-test/index.ts`, `supabase/functions/nina-orchestrator/index.ts`, e novos renderizadores para `SKILL.md` / `prompts/conversa.md`.
- Sem migrations: nenhuma coluna nova; o cupom já existe em `nina_settings`.
- Depois do deploy é necessário rodar o **Brain Build** em `/cerebro` para publicar os arquivos novos no branch `nina-brain`; o `brain_sync.sh` (cron */2) leva até 2 minutos para aplicar na VPS.
- Validação: rodar o Brain Build, conferir os arquivos gerados e repetir o teste "Oi, quero comprar o Sabonete Glicólico para uso em casa" — a resposta esperada é indicação curta com foto, nome, link e cupom, sem pergunta de tipo de pele.

## Observação

O Sabonete de Ácido Glicólico está com `tipo_uso` nulo e `categoria_intencao` vazio, e a ressalva sobre pele sensibilizada está no campo "Tipo de pele / condição indicada". Isso não bloqueia a correção, mas completar esses campos no cadastro deixa a indicação direta mais precisa.
