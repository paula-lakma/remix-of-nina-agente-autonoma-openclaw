# Acesso MASTER — listas, campanhas e modelos restritos a admin/gestão

Plano final, ainda não implementado. Auditoria feita somente com leitura.

## 0. Confirmação de identidade (verificado no banco)

| Papel | Conta |
|---|---|
| admin | paula@lakma.com.br (Paula Simionato Tondato) — **única conta MASTER hoje** |
| sdr | comerciallakma0@gmail.com (Paula Rodrigues) · joaofelipemolero@outlook.com (João Felipe) |
| parcerias | carla@lakma.com.br (Carla) |
| expedicao | financeiro@lakma.com.br (Leticia) |
| dermo | mylenalakma, barbaralakma, lauralakma, talialakma, atendimento3 |

Não existe nenhuma conta `manager`. Paula Rodrigues permanece apenas `sdr`.

## 1. Confirmação pedida: nenhuma tela de sdr depende dessas tabelas

Verificado no código:

- `contact_lists` e `contact_list_members` **não são usadas em nenhuma tela** — nem por sdr nem por admin; aparecem apenas na criação original do banco.
- `broadcast_campaigns` e `broadcast_recipients` são usadas somente pela tela de Campanhas.
- `meta_templates` é usada pela tela de Modelos e pela tela de Campanhas (para escolher um modelo aprovado). `message_templates` não é usada em nenhuma tela.
- As áreas Campanhas e Modelos só aparecem para admin e gestão. O papel sdr tem apenas Pipeline, Chat ao Vivo, Contatos e Agendamentos.

Conclusão: **nada do que Paula Rodrigues e João Felipe usam hoje depende das seis tabelas.** Restringir a admin/gestão não quebra nenhuma tela deles.

## 2. Causa do alerta de segurança

As seis tabelas foram criadas com uma única regra ampla `FOR ALL TO authenticated` cuja condição é só `auth.role() = 'authenticated'`. Qualquer pessoa logada — Carla, Leticia, dermoconsultoras, qualquer conta nova — pode ler, criar, alterar e apagar esses registros direto do banco. Esconder o menu não protege.

| Tabela | Regra atual | Comando | Condição |
|---|---|---|---|
| contact_lists | Authenticated access contact_lists | ALL | auth.role() = 'authenticated' |
| contact_list_members | Authenticated access contact_list_members | ALL | auth.role() = 'authenticated' |
| broadcast_campaigns | Authenticated access broadcast_campaigns | ALL | auth.role() = 'authenticated' |
| broadcast_recipients | Authenticated access broadcast_recipients | ALL | auth.role() = 'authenticated' |
| message_templates | Authenticated access message_templates | ALL | auth.role() = 'authenticated' |
| meta_templates | Authenticated access meta_templates | ALL | auth.role() = 'authenticated' |

`anon` ainda tem privilégios diretos nas seis tabelas. Não existe nenhuma função de servidor expondo esses dados — a exposição é só por consulta direta.

## 3. Dados expostos hoje

- Listas: nome, origem e o vínculo lista↔contato.
- Campanhas: nome, texto, mídias, cadência, status e contadores.
- Destinatários: **telefone** e variáveis personalizadas (dado mais sensível).
- Modelos: conteúdo e identificadores da Meta.

Volume atual: listas, membros, campanhas e destinatários com 0 registros; 19 modelos da Meta.

## 4. Regra final a implementar

Nas seis tabelas — `contact_lists`, `contact_list_members`, `broadcast_campaigns`, `broadcast_recipients`, `message_templates`, `meta_templates`:

- ler, criar, alterar e apagar somente com `is_admin_or_manager(auth.uid())`;
- privilégios diretos de `anon` revogados;
- `service_role` intacto — processadores de campanha, WhatsApp, Shopify e demais fluxos de servidor seguem funcionando.

Na prática, hoje só paula@lakma.com.br terá esse acesso. Carla, Leticia, dermoconsultoras e os dois sdr ficam sem acesso direto.

## 5. Objetos que mudam

Uma única migration:

- remove as 6 regras amplas;
- cria 24 regras (4 comandos × 6 tabelas), todas para usuários autenticados, com `is_admin_or_manager(auth.uid())`;
- revoga privilégios diretos de `anon` nas 6 tabelas.

Nenhum arquivo de frontend, função de servidor, conta, papel, concessão ou conversa é alterado.

## 6. Impacto nas demais áreas

Sem impacto em: Chat ao Vivo (normal e restrito), encaminhamentos, responsável, histórico, pipeline, agendamentos, Shopify e WhatsApp.

## 7. Testes após a implementação

- Simular no banco cada papel (admin, sdr, dermo, expedicao, parcerias, autenticado sem papel, anônimo) e conferir permitido/bloqueado em cada comando das seis tabelas.
- Confirmar que o processamento de campanhas e o envio por WhatsApp continuam operando pelo servidor.
- Como admin: abrir Campanhas e Modelos, listar, criar e excluir.
- Como Paula Rodrigues (sdr): Pipeline, Chat, Contatos e Agendamentos funcionando normalmente.
- Como Carla: apenas o Chat ao Vivo restrito, respondendo e finalizando.
- Rodar a bateria de testes e o verificador de segurança novamente.
