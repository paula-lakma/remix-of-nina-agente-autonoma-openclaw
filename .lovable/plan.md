# Auditoria dos 2 alertas críticos — listas de contatos e campanhas

Auditoria somente de leitura. Nada foi alterado: sem migration, sem mudança de papel, conta ou frontend.

## 1. Causa de cada alerta

Ambos os alertas têm a mesma causa: as tabelas foram criadas na migration inicial com uma única regra ampla `FOR ALL TO authenticated` cuja condição é apenas `auth.role() = 'authenticated'`. Ou seja, **qualquer pessoa logada** — inclusive Carla (parcerias), Leticia (expedicao) e as dermoconsultoras — pode ler, criar, alterar e apagar esses registros direto do banco.

Isso contrasta com `contacts`, que já foi corrigida: lá as regras usam `is_operational_staff(auth.uid())` (admin/gestor/sdr) mais um caso específico das dermoconsultoras.

## 2. Regras responsáveis (verificadas agora)

| Tabela | Regra | Comando | Condição |
|---|---|---|---|
| contact_lists | Authenticated access contact_lists | ALL | auth.role() = 'authenticated' |
| contact_list_members | Authenticated access contact_list_members | ALL | auth.role() = 'authenticated' |
| broadcast_campaigns | Authenticated access broadcast_campaigns | ALL | auth.role() = 'authenticated' |
| broadcast_recipients | Authenticated access broadcast_recipients | ALL | auth.role() = 'authenticated' |
| message_templates | Authenticated access message_templates | ALL | auth.role() = 'authenticated' |
| meta_templates | Authenticated access meta_templates | ALL | auth.role() = 'authenticated' |

As duas últimas não estão entre os alertas críticos (são aviso), mas têm exatamente o mesmo defeito e entram na mesma correção.

Além disso, o papel público `anon` ainda tem privilégios diretos concedidos nessas seis tabelas (herança da migration inicial). Hoje a regra exige sessão, então não há leitura anônima efetiva, mas o privilégio não deveria existir.

Não existe nenhuma função de servidor (RPC) que exponha listas ou campanhas — a exposição é apenas por consulta direta.

## 3. Dados expostos

- **Listas de contatos**: nome da lista, origem, e o vínculo lista↔contato (permitindo montar grupos de clientes).
- **Campanhas**: nome, texto da mensagem, mídias, cadência de disparo, status e contadores.
- **Destinatários de campanha**: **número de telefone** de cada destinatário e variáveis personalizadas — este é o dado sensível mais grave.
- **Modelos/HSM**: conteúdo dos modelos e identificadores da Meta.

Volume atual: listas, membros, campanhas e destinatários estão **vazios** (0 registros); há 19 modelos da Meta. O risco hoje é de exposição futura, assim que a funcionalidade de campanhas for usada.

## 4. Papéis afetados

Papéis existentes hoje: 1 admin, 2 sdr, 5 dermo, 1 expedicao, 1 parcerias. Não há nenhum `manager`.

Todos eles, mais qualquer conta nova autenticada, conseguem ler e escrever nas seis tabelas atualmente. Carla, Leticia e as dermoconsultoras não deveriam ter nenhum acesso.

## 5. Correção mínima proposta

Trocar as seis regras amplas por regras baseadas em papel, reaproveitando as funções que já existem — sem criar nada novo e sem tocar em frontend:

- **contact_lists, contact_list_members, broadcast_campaigns, broadcast_recipients**: acesso (ler/criar/alterar/apagar) somente para `is_operational_staff(auth.uid())` → admin, gestor e sdr. Mantém Paula Rodrigues funcionando normalmente.
- **message_templates, meta_templates**: leitura e escrita somente para `is_admin_or_manager(auth.uid())` → admin e gestor, que são justamente os papéis que enxergam a tela de Modelos no menu.
- **Revogar os privilégios diretos de `anon`** nessas seis tabelas.
- `service_role` permanece intacto — as funções de servidor (processador de campanhas, envio, Shopify, WhatsApp) ignoram essas regras e continuam funcionando sem alteração.

Efeito prático: Carla, Leticia e as dermoconsultoras deixam de enxergar listas, campanhas, destinatários e modelos, mesmo consultando o banco diretamente. Proteção no banco, não só no menu.

## 6. Objetos que mudam

Uma única migration:

- remove 6 regras amplas;
- cria 24 regras (4 comandos × 6 tabelas), todas para usuários autenticados, com as condições acima;
- revoga privilégios de `anon` nas 6 tabelas.

Nenhum arquivo de frontend, nenhuma função de servidor e nenhuma conta são alterados.

## 7. Impacto nas áreas existentes

Sem impacto em: Chat ao Vivo (normal e restrito), encaminhamentos, responsável, histórico, pipeline, agendamentos, Shopify e WhatsApp — nenhuma dessas áreas lê as seis tabelas pelo navegador.

Impacto esperado e desejado: as telas de Campanhas e Modelos passam a funcionar apenas para admin/gestor (Modelos) e admin/gestor/sdr (Campanhas), que já são os únicos papéis com esses itens no menu.

## 8. Testes após a implementação

- Simular no banco cada papel (admin, sdr, dermo, expedicao, parcerias, autenticado sem papel, anônimo) e confirmar permitido/bloqueado em cada comando das seis tabelas.
- Confirmar que o processador de campanhas e o envio por WhatsApp continuam operando (service_role).
- Abrir como admin as telas de Campanhas e Modelos: listar, criar e excluir.
- Entrar como Carla e confirmar que só o Chat ao Vivo restrito aparece e funciona.
- Conferir Chat ao Vivo, pipeline, contatos e agendamentos com um sdr.
- Rodar a bateria de testes e o verificador de segurança novamente.
