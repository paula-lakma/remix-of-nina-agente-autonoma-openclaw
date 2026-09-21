# Auditoria do papel `parcerias` da Carla (read-only)

Nada foi alterado. Somente leitura de banco e código.

## 1. Papel no banco — correto

- `user_roles`: um único papel, `parcerias` (user id `b2e23817-…8fb`, `carla@lakma.com.br`). Não sobrou `sdr`.
- `team_members`: mesma pessoa, id `22222222-0000-4000-a000-000000000002`, ativa.
- Regra de leitura `conversations_select_parcerias` ativa e funcionando.

Conclusão: a restrição de dados **foi aplicada corretamente**. Ela já não enxerga as conversas das outras áreas.

## 2. As duas conversas "Desconhecido / Sem mensagens" são reais

| Conversa | Contato | Motivo | Mensagens | Situação |
|---|---|---|---|---|
| `82face21-…820b` | Vanessa Reis | parceria de divulgação | 10 | em atendimento, Nina pausada, responsável Carla, concessão ativa |
| `632eeef4-…5d7ee` | Carla Marketing (influenciadora) | influenciadora | 86 | em atendimento, Nina pausada, responsável Carla, concessão ativa |

Não são registros órfãos nem de teste. **Devem mesmo aparecer** para ela: atribuídas a ela, concessão ativa, atendimento não finalizado, motivo válido de parcerias. A conversa real de influenciadora (item 4 do pedido) é justamente a segunda — ela está na lista, com as 86 mensagens no banco.

As funções de servidor de parcerias devolvem corretamente nome do contato, telefone mascarado, motivo e data — testadas e idênticas às das dermoconsultoras.

## 3. Causa raiz de tudo o que está errado na tela: ela está usando a versão antiga do site

Os três sintomas (nome "Desconhecido", "Sem mensagens", e os menus Pipeline/Contatos/Agendamentos) vêm todos da mesma origem: o navegador dela ainda está carregando a versão publicada **antes** desta alteração.

Como isso se encaixa exatamente:

- Na versão antiga o papel `parcerias` não existe; o código não reconhece o papel e assume `sdr` como padrão. Papel `sdr` mostra exatamente Pipeline, Chat ao Vivo, Contatos e Agendamentos — o que ela relatou.
- Pelo mesmo motivo, ela recebe a tela de chat completa (a antiga), e não a tela restrita nova.
- A tela antiga lê conversas, contatos e mensagens diretamente. Como no banco ela já é `parcerias`, ela só consegue ler as duas conversas liberadas — mas **não** tem permissão de leitura direta de `contacts` nem de `messages` (confirmado: só existem regras dessas duas tabelas para admin/gestor/sdr, expedição e dermo). Resultado: as duas conversas aparecem sem nome ("Desconhecido") e sem mensagens.

A tela restrita nova não sofre disso, porque lê tudo por funções de servidor que já revalidam sessão, papel e concessão.

## 4. Correção mínima

1. **Publicar o site** e pedir para a Carla sair, recarregar com atualização forçada e entrar de novo. Isso resolve, de uma vez: menus extras, nome do contato, mensagens e a tela restrita correta.
2. **Proteção contra repetição** (uma linha de código): quando o papel do usuário não for reconhecido pela versão carregada, não assumir mais `sdr`; tratar como acesso mínimo (somente Chat ao Vivo). Assim uma versão desatualizada nunca mais concede menus a mais.

Nada de migração, nada de mudança de conta, papel, concessões ou fluxo da Nina. As duas conversas ficam como estão.

## 5. Verificação após publicar

- Carla vê apenas as duas conversas, com nome do contato e histórico completo (10 e 86 mensagens).
- Menu lateral mostra somente Chat ao Vivo.
- Ela responde e finaliza atendimento normalmente; ao finalizar, a conversa sai da lista.
- Paula Rodrigues, Leticia, dermoconsultoras e administradores inalterados.
