# Mensagem de card duplicado + tabela sem regra de acesso

## 1. Mensagem de card duplicado

**Causa da mensagem genérica.** O código atual já tem o tratamento: quando o banco recusa, aparece "Este contato já possui um card ativo no Pipeline." Esse ajuste foi feito na correção do Pipeline e **ainda não foi publicado**. O site publicado roda a versão antiga, que mostra sempre "Erro ao criar deal". Por isso o teste deu a mensagem genérica.

**Como o banco avisa a duplicidade.** Código `23505` (valor repetido), vindo do índice `deals_one_active_per_contact`: um card aberto (sem ganho/perda) por contato.

**Onde fica o tratamento hoje:**
- `src/services/api.ts` (createDeal): troca o erro `23505` pela frase amigável.
- `src/components/CreateDealModal.tsx`: mostra essa frase; qualquer outro erro continua "Erro ao criar deal".

**Menor mudança proposta:**
1. Deixar a regra mais precisa em `api.ts`: usar a frase amigável só quando for `23505` **e** o erro citar `deals_one_active_per_contact`. Assim, outro valor repetido nunca vira essa frase por engano. Os demais erros continuam com o tratamento atual.
2. Testar na pré-visualização: tentar criar um card para um contato que já tem card. A frase amigável tem que aparecer e nenhum card novo pode ser criado.
3. Publicar só com a sua aprovação.

Não muda: a regra do banco, o índice, a criação de cards, as etapas, os encaminhamentos, os responsáveis nem as outras mensagens.

## 2. Tabela protegida sem regra de acesso (checagem só de leitura, já feita)

- Schema/tabela: `pipeline_backup.deals_20260924`
- Para que serve: é o backup dos cards, feito antes de tirar as duplicatas do Pipeline em 24/09.
- Proteção de linhas (RLS): ligada, sem nenhuma regra, então tudo fica bloqueado.
- anon: sem acesso à tabela e sem acesso ao schema.
- authenticated: sem acesso à tabela e sem acesso ao schema.
- service_role: só leitura (acesso técnico).
- Exposta pelo app? Não. O schema `pipeline_backup` não é publicado pela API do app.
- O site usa essa tabela? Não, não há nenhuma referência nas telas nem nas funções.

**Conclusão:** é o backup do Pipeline. Ele está fechado de propósito e bem isolado, sem risco real. **Não precisa de nenhuma mudança de segurança.** Não serão criadas regras, e RLS e permissões ficam como estão. Os 6 alertas pausados não serão tocados.

## Arquivos
- `src/services/api.ts`: só a condição da frase amigável.
