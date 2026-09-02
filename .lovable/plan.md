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
permissões, handoffs, Nina ou Letícia. Nenhuma senha é alterada.

## 6. A correção resolve as 5 contas de uma vez?

Sim. A mesma correção cobre Mylena, Talia, Barbara e Laura (Cris já está íntegra) e previne o
mesmo erro em qualquer conta futura provisionada da mesma forma.

## 7. Plano de implementação e teste

1. Aplicar a migração de normalização acima.
2. Reconferir por consulta que nenhuma conta tem coluna de token `NULL`.
3. Pedir que a Mylena repita "Esqueci minha senha" em `/auth` na URL publicada.
4. Conferir nos logs de Auth que `POST /recover` retorna 200.
5. Ela define a senha em `/reset-password`, faz login e cai no Chat ao Vivo restrito.
6. Repetir para Talia, Barbara e Laura.

Nenhum e-mail de teste é disparado por mim nesta etapa; o disparo real fica com a própria
dermoconsultora no passo 3.
