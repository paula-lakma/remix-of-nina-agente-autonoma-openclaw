## Diagnóstico

A NINA já recebe `site_url` e `mercadolivre_url` no `produtos.md` (gerado pelo `brain-build`, linhas 109–110), mas:

1. O rendering atual lista apenas "Site: …" e "Mercado Livre: …" entre outros bullets, sem marcar explicitamente que é o **link aprovado** do produto — fácil de a IA ignorar.
2. O conhecimento **`regras-de-venda-links-precos-crm-e-contato`** instrui a NINA a responder *"Esse link não está disponível no material aprovado…"* sempre que ela não enxerga um link "no material aprovado", **sem dizer onde está esse material** (o `produtos.md`). É essa instrução que está bloqueando o envio.
3. Não há instrução explícita sobre cupom `LAKMA35` ao mandar link do site, nem sobre mover o deal para "Link do site enviado".

A correção é só de **conteúdo** (markdown + knowledge entry) + um pequeno ajuste no renderer. Nada de schema novo — os campos já existem (`brain_products.site_url`, `mercadolivre_url`).

## Mudanças

### 1. `supabase/functions/brain-build/index.ts` — `renderProducts`

Reescrever a seção de links para destacá-los como **dado estruturado e aprovado**, incluindo bloco JSON-like que a IA reconheça facilmente, e injetar cupom/canal:

```
### Links aprovados deste produto

- **Site oficial (aprovado):** https://… ← cupom LAKMA35 = 35% de desconto
- **Mercado Livre (aprovado):** https://…

```json
{
  "produto": "<nome>",
  "link_site": "<site_url ou null>",
  "link_mercadolivre": "<mercadolivre_url ou null>",
  "cupom_site": "LAKMA35",
  "desconto_site": "35%"
}
```
```

Se ambos vierem vazios, renderizar `_(Nenhum link cadastrado — só nesse caso a Nina deve responder que o link não está aprovado.)_` para deixar inequívoco para a IA.

### 2. Atualizar o conhecimento `regras-de-venda-links-precos-crm-e-contato`

Via `INSERT/UPDATE` no `brain_knowledge` (usando o insert tool), substituir as seções "Links que a Nina pode enviar" e "Preços e cupons" por regras explícitas:

- O **material aprovado de links** é `knowledge/produtos.md`, na seção "Links aprovados deste produto".
- Quando o lead pedir link de um produto: localizar o produto em `produtos.md`, ler `link_site` / `link_mercadolivre`, e **enviar o link cadastrado**.
- Se `link_site` estiver presente: enviar o link **e** informar o cupom `LAKMA35` (35% off no site).
- Resposta-modelo: *"Esse é o link oficial do produto: [LINK]. Você pode usar o cupom LAKMA35 para 35% de desconto no site."*
- A resposta *"Esse link não está disponível no material aprovado…"* **só** pode ser usada quando `link_site` e `link_mercadolivre` estiverem ambos vazios para o produto.
- Adicionar lista de gatilhos (link, me manda o link, onde compro, quero comprar, tem no site, manda o link do produto, etc).
- Após enviar link do site, deixar registrado que o pipeline deve mover para "Link do site enviado" (a movimentação automática é feita pelo `analyze-conversation` lendo os critérios do stage — esse estágio já existe e já tem `ai_trigger_criteria` desde a iteração de pipeline).

### 3. Reforço de critério no stage "Link do site enviado"

Garantir via `UPDATE pipeline_stages` que `ai_trigger_criteria` inclua "Nina enviou link de produto (site oficial ou Mercado Livre) durante a conversa" — para que o `analyze-conversation` mova o deal automaticamente.

### 4. Próximo passo do usuário

Depois das mudanças, clicar **Sincronizar / Brain Build** em `/cerebro` para o `produtos.md` e o knowledge atualizados subirem para o branch `nina-brain` e o cron `brain_sync.sh` puxar na VPS (até 2 min).

## Critérios de aceite

- `produtos.md` mostra cada produto com bloco "Links aprovados deste produto" e JSON inline com `link_site`/`link_mercadolivre`/`cupom_site`.
- Conhecimento de links instrui a NINA a consultar `produtos.md` antes de usar o fallback.
- Quando o produto tem `site_url`, a NINA envia o link + cupom LAKMA35.
- Fallback "link indisponível" só dispara quando ambos os campos estão vazios.
- Pipeline `Link do site enviado` move automaticamente quando link é enviado.

## Fora de escopo

- Não mexer no schema de `brain_products` (campos já existem).
- Não mexer em `nina-orchestrator` nem nos scripts da skill — o fluxo já entrega `produtos.md` corretamente; o problema é puramente de conteúdo/instrução.
