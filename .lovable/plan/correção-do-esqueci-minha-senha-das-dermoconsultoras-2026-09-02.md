# Correção do "Esqueci minha senha" das dermoconsultoras

## 1. Causa raiz exata

As contas criadas administrativamente por SQL em 28/08 ficaram com colunas de token do Auth em `NULL`
(`confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new`).
O serviço de Auth (GoTrue) lê essas colunas como texto e falha ao encontrar `NULL`.

Log real do momento do teste da Mylena:

```text
POST /recover  status 500  error_code=unexpected_failure
error finding user: sql: Scan error on column index 3, name "confirmation_token":
converting NULL to string is unsupported
```

Esse 500 é o que a interface exibe como "Unable to process request". Nenhum e-mail chega porque
o pedido falha antes de gerar o link. Não é problema de Site URL, redirect, cadastro público
desativado nem de senha desconhecida.

## 2. Estado das 5 contas no Auth

| Conta | Usuário existe | E-mail confirmado | Tem senha | Tokens NULL | Recovery funciona hoje |
|---|---|---|---|---|---|
| Mylena — mylenalakma@outlook.com | sim | sim | sim | sim | não |
| Talia — galvaotalia19@gmail.com | sim | sim | sim | sim | não |
| Barbara — barbara@lakma.com.br | sim | sim | sim | sim | não |
| Laura — lakma.vendas5@gmail.com | sim | sim | sim | sim | não |
| Cris — atendimento3@lakma.com.br | sim | sim | sim | não | sim (já logou em 31/08) |

Nenhum usuário está banido nem excluído. A Cris foi criada por outro caminho e está íntegra —
por isso o problema é das outras 4, e não da Mylena isoladamente.

## 3. Arquivo/função responsável pelo reset

- `src/pages/Auth.tsx` — modo `forgot`, `handleSubmit` chama
  `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset-password' })`
  e mostra `toast.error(error.message)` — ou seja, apenas repassa a mensagem do servidor.
- `src/pages/ResetPassword.tsx` — rota pública `/reset-password`, aguarda a sessão de recuperação
  e chama `supabase.auth.updateUser({ password })`.

Esse código está correto; o erro vem do servidor.

## 4. Configuração de redirect atual

`redirectTo` = origem atual + `/reset-password`, o que na produção resolve para
`https://project-perfection-guide.lovable.app/reset-password`. A rota existe e é pública em
`src/App.tsx`. Nada a mudar aqui.

## 5. Mudança mínima necessária

Uma única migração que normaliza as colunas de token de `NULL` para string vazia nos usuários
afetados — o formato que o GoTrue usa para "sem token pendente":

```sql
update auth.users
set confirmation_token = coalesce(confirmation_token, ''),
    recovery_token = coalesce(recovery_token, ''),
    email_change = coalesce(email_change, ''),
    email_change_token_new = coalesce(email_change_token_new, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    phone_change = coalesce(phone_change, ''),
    phone_change_token = coalesce(phone_change_token, ''),
    reauthentication_token = coalesce(reauthentication_token, '')
where confirmation_token is null or recovery_token is null
   or email_change is null or email_change_token_new is null;
```

Sem recriar, apagar ou duplicar usuários; sem tocar em e-mails, roles, `team_members`,
permissões, handoffs, Nina ou Letícia. Nenhuma senha é alterada. A Cris não é afetada
(as colunas dela já estão preenchidas e o `coalesce` não muda nada).

## 5b. Eliminar a causa para contas futuras

Auditoria da origem: não existe hoje nenhuma função, RPC, edge function ou fluxo de aplicação
que crie contas. Buscas por `admin.createUser`, `inviteUserByEmail`, `generateLink` e por
inserções em `auth.users` no repositório não retornam nada — as quatro contas de 28/08 foram
criadas por SQL avulso direto em `auth.users`, informando só alguns campos e deixando as colunas
de token em `NULL`. Esse é exatamente o ponto de origem do defeito, e ele não está versionado:
enquanto o provisionamento continuar sendo SQL manual, o problema se repete.

Correção mínima de origem — criar um único caminho oficial de provisionamento:

- Nova edge function `admin-create-user`, que usa a API administrativa oficial do Auth
  (`auth.admin.createUser` com e-mail já confirmado e senha temporária aleatória descartada).
  Contas criadas por essa via nascem com todos os campos de token preenchidos corretamente.
- Acesso restrito: exige sessão válida e papel `admin` (via `has_role`); qualquer outro papel
  recebe 403. Nada de cadastro público, nada de auto-signup — a configuração atual de signup
  desativado permanece como está.
- Idempotência: se o e-mail já existir no Auth, a função não cria nem altera nada, apenas
  devolve o status existente. Não recria, não duplica, não mexe em roles nem em `team_members`.
- A dermoconsultora recém-criada continua entrando pelo fluxo já desejado: `/auth` →
  "Esqueci minha senha" → define a própria senha.
- Regra de operação, documentada junto: contas internas nunca mais são criadas por SQL direto
  em `auth.users`.

Não será criado trigger no schema `auth` (schema gerenciado, não deve ser alterado); a garantia
vem de haver um único caminho oficial de criação.

## 6. A correção resolve as 5 contas de uma vez?

Sim. A migração cobre Mylena, Talia, Barbara e Laura de uma vez; a Cris já está íntegra e
permanece intacta. O caminho oficial de criação (5b) impede que novas contas nasçam com o mesmo
defeito, então "Esqueci minha senha" passa a funcionar para todas, atuais e futuras.

## 7. Plano de implementação e teste

1. Aplicar a migração de normalização das contas atuais.
2. Reconferir por consulta que nenhuma conta tem coluna de token `NULL` e que a Cris continua igual.
3. Criar e publicar a edge function `admin-create-user` restrita a `admin`.
4. Testar a função em modo idempotente com um e-mail já existente (deve responder "já existe",
   sem alterar nada).
5. Pedir que a Mylena repita "Esqueci minha senha" em `/auth` na URL publicada.
6. Conferir nos logs de Auth que `POST /recover` retorna 200.
7. Ela define a senha em `/reset-password`, faz login e cai no Chat ao Vivo restrito.
8. Repetir para Talia, Barbara e Laura.

Nenhum e-mail de teste é disparado por mim nesta etapa; o disparo real fica com a própria
dermoconsultora no passo 5.

