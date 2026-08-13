# Diagnóstico: de onde vem LAKMA35 / 35% no fluxo de Protocolo

Nenhum arquivo do projeto foi alterado.

## A) Origem exata

Arquivos **antigos (órfãos) do branch `nina-brain`**, já sincronizados na VPS, gerados por builds anteriores à correção do cupom dinâmico. Eles carregam o texto literal semeado em junho:

> "No site, você pode usar o cupom **LAKMA35** para ter 35% de desconto."
> "Cupom **LAKMA35** = 35% off → `valor_com_cupom = valor_sem_desconto * 0,65`."

(strings presentes em `supabase/migrations/20260625164536_*.sql` e `20260626143300_*.sql`, que inseriram esses conteúdos como Conhecimentos/Habilidades na época).

O que foi verificado e está **limpo hoje**:

- `nina_settings`: `coupon_enabled=true`, `coupon_code=LAKMA30`, `coupon_discount_percent=30`; o `system_prompt_override` **não** contém LAKMA35 nem 35%.
- `brain_knowledge` (10 registros), `brain_protocols` (15), `custom_knowledge_skills` (14), `brain_products`: **zero** ocorrências de `LAKMA35`.
- `brain-build/index.ts`: 100% dinâmico (`couponFrom(settings)`); nenhuma ocorrência de `LAKMA35`, `35%` ou `0.65`.
- `nina-orchestrator` e `nina-test`: nenhuma menção a cupom.
- `skills/nina/*` no repo: nenhuma menção a cupom.

Único resíduo em código-fonte vivo: `src/components/cerebro/train/ProductForm.tsx:187-191` — o **rótulo da UI** diz "cupom LAKMA35 … (35% off)" e calcula a prévia com `* 0.65`. Isso é só exibição no painel, não vai para o cérebro, mas confunde o cadastro.

## B) Arquivo / função / bloco responsável

`supabase/functions/brain-build/index.ts`, bloco de commit (~linhas 975-1000):

```ts
const newTree = await gh("POST", `${base}/git/trees`, token, { base_tree: baseTreeSha, tree });
```

O commit usa `base_tree`, ou seja, **só sobrescreve os arquivos que ele gera nesta rodada e nunca remove os demais**. O prune existente (`.nina-packs.json`) cobre apenas `skills/<pack>` e `skills/custom-*` — **não** cobre `skills/nina/knowledge/*.md`.

Consequência: todo `knowledge/<slug>.md` de um Conhecimento que foi renomeado (mudança de slug) ou excluído continua vivo no branch e na VPS, com o texto antigo.

## C) Trecho conflitante

Dois textos coexistem no workspace da VPS:

- gerado hoje (correto): `- Quando enviar um link individual aprovado do site, sempre informar o cupom **LAKMA30** = 30% de desconto no site.`
- órfão (errado): `No site, você pode usar o cupom **LAKMA35** para ter 35% de desconto.`

## D) Por que afeta protocolo e não o fluxo de produto

`brain_protocols` **não é exportado pelo brain-build** — não há uma única referência à tabela nas edge functions (só no hook do painel `useBrainProtocols.ts`). O "Protocolo ACNE OFF" não existe em nenhum arquivo gerado hoje: os 10 Conhecimentos atuais não citam ACNE OFF.

Logo, quando a Nina respondeu com o Protocolo ACNE OFF, ela leu um **arquivo órfão** de um build antigo — e esse mesmo arquivo traz o cupom antigo junto. Já o fluxo de produto lê `knowledge/produtos.md`, que é regravado a cada build a partir de `nina_settings` — por isso sai LAKMA30 corretamente.

## E) Correção mínima recomendada

1. **Prune do diretório `skills/nina/knowledge/`** no `brain-build`: gerar a lista canônica de arquivos esperados (`produtos.md` + um por slug de `brain_knowledge`) e remover do tree qualquer outro `.md` sob esse diretório. É a correção que elimina toda a classe do problema (não só o cupom).
2. **Exportar `brain_protocols`** no brain-build (`knowledge/protocolos/<slug>.md`), com o bloco comercial usando o mesmo `coupon` dinâmico — hoje os Protocolos cadastrados no painel simplesmente não chegam ao cérebro, e o agente depende de arquivo velho.
3. **Ajustar o rótulo do painel** em `ProductForm.tsx` para ler `coupon_code` / `coupon_discount_percent` de `nina_settings` em vez de "LAKMA35 / 35% / 0.65".
4. Depois disso, rodar um Build e aguardar o `brain_sync` (*/2 min) para que a VPS receba a remoção dos órfãos.

Não recomendo tocar em `nina_settings`, Produtos, Protocolos, Conhecimentos, System Prompt, WhatsApp, pipeline ou handoff.
