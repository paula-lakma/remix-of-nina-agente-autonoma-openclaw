# Carla não recebe o e-mail de redefinição de senha — auditoria read-only

Nada foi alterado: nenhuma senha, conta, e-mail, papel, permissão ou configuração de envio.

## 1. Conta da Carla — íntegra

- Usuário: `carla@lakma.com.br`, id `b2e23817-2e1c-4547-9e27-fc668660f8cb`
- Criada em 07/08/2026 15:08, e-mail confirmado no mesmo instante
- Último login em 07/08/2026 15:09; não está banida nem excluída
- Provedor: e-mail/senha (um único, correto)
- Papel `sdr`; equipe: "Carla", ativa, vinculada ao mesmo usuário; perfil com o mesmo e-mail
- Nenhuma conta duplicada ou variação de e-mail

## 2. A tentativa chega ao sistema e o link é gerado

A tela de login chama a recuperação padrão de senha com retorno para `/reset-password`
do mesmo domínio em que a pessoa está, e mostra erro quando há erro (não esconde falha).

O registro da conta mostra **recuperação gerada hoje, 21/09 às 16:05 (horário de SP)** —
exatamente a tentativa dela. Ou seja: o pedido chega, é aceito e o link é criado.
O problema está **depois disso, na entrega do e-mail**.

## 3. Por que não chega

O projeto **não tem nenhum domínio de envio de e-mail configurado**. Sem isso, os
e-mails de autenticação saem pelo remetente compartilhado padrão, que tem limite baixo
por hora e reputação compartilhada — provedores corporativos como o de `lakma.com.br`
costumam descartar ou reter essas mensagens em filtro, sem retorno visível.

Não há registros de entrega/bounce disponíveis para inspeção neste ambiente, então não
é possível provar "caixa X rejeitou"; o que está confirmado é: geração ok, envio pelo
remetente padrão, ausência de domínio verificado.

## 4. Comparação com Talia, Barbara e Laura

As três **nunca usaram recuperação de senha** (nenhuma recuperação registrada nas contas
delas). Foram provisionadas com senha definida pelo administrador e entraram direto.
Portanto elas não comprovam que a entrega de e-mail funciona — não existe hoje nenhum
caso de e-mail de recuperação comprovadamente recebido.

Diferença real: caixa corporativa própria (`@lakma.com.br`) versus `@outlook.com`, e
Carla é a única que depende do e-mail chegar.

## 5. Causa raiz

Falta de domínio de envio verificado. A recuperação é gerada, mas a mensagem sai por um
remetente genérico e não chega à caixa corporativa da Carla.

## 6. Correção mínima recomendada (a decidir)

**Imediato (desbloqueia a Carla hoje):** o administrador define uma senha provisória para
ela e ela troca depois de entrar. Não mexe em conta, e-mail, papel nem permissões.

**Definitivo:** configurar um domínio de envio próprio para os e-mails do sistema, para
que recuperação de senha e demais avisos passem a chegar de forma confiável. Exige
alguns registros no DNS do domínio.

Também é possível verificar antes se a mensagem caiu em spam/quarentena da caixa dela —
é o teste mais barato e pode confirmar o diagnóstico sem nenhuma alteração.

## 7. Preservado

Nada alterado. Contas, e-mails, papéis, vínculos de equipe, RLS, permissões,
classificação Paula/Carla/Leticia, dermoconsultoras, rodízio, WhatsApp, Shopify e
histórico permanecem exatamente como estão.
