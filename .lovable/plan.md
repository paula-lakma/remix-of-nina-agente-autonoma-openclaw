# Acesso MASTER + correção dos alertas de listas, campanhas e modelos

Plano final, ainda não implementado. Auditoria concluída somente com leitura.

## 0. Confirmação de identidade (verificado agora no banco)

Contas com papel hoje:

| Papel | Conta |
|---|---|
| admin | paula@lakma.com.br (Paula Simionato Tondato) — **única conta MASTER** |
| sdr | comerciallakma0@gmail.com (Paula Rodrigues) · joaofelipemolero@outlook.com |
| parcerias | carla@lakma.com.br (Carla) |
| expedicao | financeiro@lakma.com.br (Leticia) |
| dermo | mylenalakma, barbaralakma, lauralakma, talialakma, atendimento3 |

Não existe nenhuma conta `manager`. Confirmado: **Paula Rodrigues permanece apenas `sdr`** e não terá MASTER.

## 1. Causa dos alertas

As seis tabelas foram criadas com uma única regra ampla `FOR ALL TO authenticated` cuja condição é apenas `auth.role() = 'authenticated'`. Qualquer pessoa logada — inclusive Carla, Leticia e as dermoconsultoras — pode ler, criar, alterar e apagar esses registros direto do banco. Ocultar o menu não protege nada.

## 2. Regras responsáveis (verificadas)

| Tabela | Regra | Comando | Condição |
|---|---|---|---|
| contact_lists | Authenticated access contact_lists | ALL | auth.role() = 'authenticated' |
| contact_list_members | Authenticated access contact_list_members | ALL | auth.role() = 'authenticated' |
| broadcast_campaigns | Authenticated access broadcast_campaigns | ALL | auth.role() = 'authenticated' |
| broadcast_recipients | Authenticated access broadcast_recipients | ALL | auth.role() = 'authenticated' |
| message_templates | Authenticated access message_templates | ALL | auth.role() = 'authenticated' |
| meta_templates | Authenticated access meta_templates | ALL | auth.role() = 'authenticated' |

`anon` ainda tem privilégios diretos concedidos nas seis tabelas. Não existe nenhuma função de servidor expondo listas, campanhas ou modelos — a exposição é apenas por consulta direta.

## 3. Dados expostos

- Listas: nome, origem e o vínculo lista↔contato.
- Campanhas: nome, texto, mídias, cadência, status e contadores.
- Destinatários: **telefone** de cada destinatário e variáveis personalizadas (dado mais sensível).
- Modelos: conteúdo e identificadores da Meta.

Volume atual: listas, membros, campanhas e destinatários com 0 registros; 19 modelos da Meta.

## 4. Regra final aprovada

**MASTER (modelos/templates)** — `message_templates` e `meta_templates`: ler, criar, alterar e apagar somente com `is_admin_or_manager(auth.uid())`. Sem SELECT para sdr.

**Campanhas e listas** — `contact_lists`, `contact_list_members`, `broadcast_campaigns`, `broadcast_recipients`: acesso somente com `is_operational_staff(auth.uid())` (admin/manager/sdr).

**anon**: privilégios diretos revogados nas seis tabelas. **service_role**: intacto.

### Nenhuma funcionalidade de sdr quebra

Verificado: a tela de Campanhas lê modelos aprovados da Meta para montar a mensagem. Porém as áreas "Campanhas" e "Templates" só aparecem para admin e manager — o papel `sdr` tem acesso apenas a Pipeline, Chat ao Vivo, Contatos e Agendamentos. Portanto nenhum sdr usa hoje Campanhas nem Modelos, e negar SELECT de modelos a sdr não quebra nada. Não é preciso ampliar permissão nem criar alternativa.

## 5. Objetos que mudam

Uma única migration:

- remove as 6 regras amplas;
- cria 24 regras (4 comandos × 6 tabelas), todas para usuários autenticados: 16 com `is_operational_staff`, 8 com `is_admin_or_manager`;
- revoga privilégios diretos de `anon` nas 6 tabelas.

Nenhum arquivo de frontend, nenhuma função de servidor, nenhuma conta, papel, concessão ou conversa é alterado.

## 6. Impacto nas áreas existentes

Sem impacto em: Chat ao Vivo (normal e restrito), encaminhamentos, responsável, histórico, pipeline, agendamentos, Shopify e WhatsApp — nenhuma dessas áreas lê as seis tabelas pelo navegador; o processamento de campanhas e o envio rodam pelo servidor, que não é afetado.

Mudança desejada: Carla, Leticia e as dermoconsultoras deixam de enxergar listas, campanhas, destinatários e modelos mesmo consultando o banco diretamente; Paula Rodrigues segue com Pipeline, Chat, Contatos e Agendamentos exatamente como hoje.

## 7. Testes após a implementação

- Simular no banco cada papel (admin, sdr, dermo, expedicao, parcerias, autenticado sem papel, anônimo) e conferir permitido/bloqueado em cada comando das seis tabelas.
- Confirmar que o processamento de campanhas e o envio por WhatsApp continuam operando pelo servidor.
- Como admin: abrir Campanhas e Modelos, listar, criar e excluir.
- Como Paula Rodrigues (sdr): Pipeline, Chat, Contatos e Agendamentos funcionando; sem acesso a modelos.
- Como Carla: apenas o Chat ao Vivo restrito, respondendo e finalizando.
- Rodar a bateria de testes e o verificador de segurança novamente.
