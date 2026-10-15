# Equipe de dermoconsultoras — auditoria read-only e plano

Nada foi alterado. Só foram feitas leituras no banco e no código.

## 1. As seis pessoas (dados reais)

| Nome | Login ativo (e-mail) | user_id (login) | team_member_id | Papel | Status equipe | Último acesso |
|---|---|---|---|---|---|---|
| Barbara | barbaralakma@outlook.com | 72d2dee1… | 652c1dcc… | dermo | active | 08/09 |
| Talia | talialakma@outlook.com | 415ec427… | 8b104801… (peso 8) | dermo | active | 08/09 |
| Laura | lauralakma@outlook.com | 4bcf6a7f… | dcf6c6ed… (Sênior) | dermo | active | 08/09 |
| Mylena | mylenalakma@outlook.com | 224565ef… | 7abd5818… | dermo | active | 08/09 |
| Cris | atendimento3@lakma.com.br | 44c46675… | 22222222-…-0003 | dermo | active | 31/08 |
| Duda | ep749530@gmail.com | não existe | não existe | — | — | — |

## 2. Divergências de e-mail

Barbara, Talia e Laura têm **dois logins cada**:
- Logins antigos (28/08), sem papel e não ligados à equipe: barbara@lakma.com.br (`229405ea…`, nunca entrou), galvaotalia19@gmail.com (`bb2ab87b…`, entrou 02/09, **1 sessão ainda aberta**), lakma.vendas5@gmail.com (`557ada5f…`, nunca entrou). São esses que aparecem na tabela de perfis.
- Logins atuais (03/09), com papel `dermo` e ligados à equipe, mas **sem linha de perfil**.
- Sem papel, os logins antigos não veem nenhuma conversa, mas ainda conseguem entrar.
- Mylena e Cris: e-mail igual no login, no perfil e na equipe.
- Peso de Talia na equipe = 8 (regra de participação reduzida em vigor). Duda "igual à Barbara e Talia": precisa decidir se Talia mantém peso 8.

## 3. Onde aparecem no roteamento

- `pick_next_dermoconsultora()`: escolhe entre membros `active` com função contendo "dermoconsultor" — hoje Mylena, Cris, Barbara, Talia e Laura. Ordem: menor carga ativa, depois quem recebeu há mais tempo, depois id. Talia só entra após 8 atendimentos comuns (ou se as demais tiverem carga >= 2).
- `pick_dermo_assignee()`: motivo sensível (`is_sensitive_dermo_reason`: gestação/amamentação, alergia, reação, pele sensibilizada, contraindicação, medicamento, procedimento recente, caso sensível) vai direto para Laura, localizada por **e-mail fixo** `lauralakma@outlook.com` ou `lakma.vendas5@gmail.com`. Se Laura indisponível → balanceamento normal.
- Atenção: Laura também participa do balanceamento normal hoje. A estrutura desejada (normal = Duda/Barbara/Talia) exige tirá-la do normal.
- Código: `_shared/handoff.ts` (linha ~724, chama as funções acima); nomes fixos só em testes (`dermo-balance-weight`, `handoff-classification-matrix`, `assign-dropdown-routing`, `conversation-context`) e em duas migrations antigas. Telas não têm nomes fixos.

## 4. Atendimentos de Mylena e Cris

- Mylena: 0 conversas, 0 acessos, 0 cards.
- Cris: 1 conversa `9a1c0000-…-0f02` (dermo, humano, não finalizada, 1 acesso ativo, última msg 31/08 da Nina) e 1 card. O id indica conversa de laboratório/teste; confirmar antes de mexer.
- Nenhum follow-up de CRM verificado por elas ainda (verificar no Build).

## 5. Autenticação hoje

- Login por e-mail e senha no Lovable Cloud.
- "Esqueci minha senha" em `/auth` envia link; `/reset-password` define a senha nova e encerra a sessão.
- Existe `admin-create-user` (só admin): cria conta bloqueada, define papel, desbloqueia e devolve **uma senha temporária forte gerada no servidor** uma única vez na resposta (não grava em banco nem em log).
- Não existe "trocar senha obrigatoriamente no primeiro acesso" (sem campo nem tela).
- Trocar a senha não derruba sessões abertas automaticamente; bloquear a conta (ban) impede novos logins e renovação de sessão; encerrar sessões exige ação do servidor.

## 6. Recomendação

Senhas das quatro ativas (preferido): link de redefinição por e-mail para cada uma — ninguém conhece a senha, nada transita no chat. Alternativa se pediu senha temporária: gerar uma por pessoa no servidor, mostrar uma vez ao admin, marcar "trocar no primeiro acesso" (pequeno Build: flag no perfil + tela de troca obrigatória) e encerrar sessões antigas.

Mylena e Cris: não apagar. Bloquear o login (ban), encerrar sessões, remover papel `dermo`, mudar status na equipe para `disabled`. Histórico e autoria ficam (mensagens referem o id, que não é apagado). Bloquear também os 3 logins antigos duplicados.

## 7. Build mínimo proposto (aguardando aprovação)

1. Criar Duda via `admin-create-user` com papel `dermo`, membro de equipe com a mesma função de Barbara.
2. Desativar Mylena e Cris (ban + sessões + papel + status `disabled`).
3. Bloquear os 3 logins antigos duplicados de Barbara/Talia/Laura e criar perfil para os logins atuais.
4. Migration: Laura fora do balanceamento normal (exceto como fallback se ninguém mais estiver disponível); Laura identificada por team_member_id em vez de e-mail.
5. Decidir caso da conversa da Cris (provavelmente teste): finalizar ou reatribuir pela lógica de balanceamento.
6. Senhas: link de redefinição (ou senha temporária + troca obrigatória, se escolhido).

## 8. Testes

Mylena/Cris nunca recebem; normal só Duda/Barbara/Talia; sensível → Laura; Laura indisponível → fallback; ex-funcionárias não entram; ativas entram com a nova senha; senha não aparece em banco/log; histórico intacto; Letícia, Paula, Carla, rastreio, Campanhas, opt-out, templates e retomada sem mudança (suíte completa).

## 9. Riscos e decisões pendentes

- Peso 8 da Talia: manter ou igualar à Duda/Barbara?
- Laura sai do normal? (pedido indica que sim)
- Cris tem 1 conversa ativa com acesso; desativar sem tratar deixa-a órfã.
- Sessão aberta do login antigo da Talia.
- Nenhum outro setor é afetado: só funções de dermo e contas dessas pessoas.

Confirmação: nada foi alterado.
