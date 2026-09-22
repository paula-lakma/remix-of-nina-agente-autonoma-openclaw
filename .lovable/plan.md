# Auditoria (somente leitura): acesso da conta de rastreio

Nada foi alterado.

## 1. Papel real da conta
- `expedicaolakma@outlook.com`, id `4de47db6-519f-4442-9754-c6b5d01db2c1`, conta liberada.
- `user_roles`: somente `rastreio`. Sem `sdr`, `expedicao`, `dermo`, `parcerias` ou qualquer papel residual. Sem membro de equipe.
- A regra de leitura permite que o próprio usuário leia o seu papel, então o site consegue identificar `rastreio`.

## 2. `rastreio` no frontend atual
Sim. Código atual: permissões `rastreio: ['tracking']`, página inicial `/tracking`, menu mostra só "Envio de rastreio", guarda de rota redireciona tudo para `/tracking`.

## 3. Fallback para o Chat
Com o código atual, **não** cai no fallback. O que aparece no seu print (só "Chat ao Vivo" + "Aguardando dermoconsultora") é exatamente o que aconteceria com uma **versão anterior** do site, que não conhecia `rastreio`: papel desconhecido -> acesso mínimo -> `/chat`. O acesso mínimo abre a tela de chat completa (sem dados, bloqueada pelo banco), e é dela o texto "Aguardando dermoconsultora".

## 4. Último deploy
O site publicado em project-perfection-guide.lovable.app, baixado agora, **contém** a implementação: `rastreio:["tracking"]`, `rastreio:"/tracking"`, `rastreio` na prioridade de papéis e a tela de histórico mínimo. Código, pré-visualização e produção estão alinhados neste momento.

## 5. Rota que deveria abrir
`/tracking` (Envio de rastreio). Pela lógica atual: início -> `/tracking`; `/tracking` liberado; `/chat` e `/pipeline` -> redirecionam para `/tracking`.

## 6. Causa raiz (mais provável)
A sessão do print carregou uma versão antiga do site, de antes de o deploy com `rastreio` terminar (a aba ficou aberta ou o login foi feito logo depois de publicar). O código e os dados de hoje não geram esse comportamento. Não há como confirmar pelo servidor qual versão aquele navegador carregou.

## 7. Correção mínima
- Sem alteração de código ou dados: sair, fechar a aba, abrir o site de novo com atualização forçada (Ctrl+Shift+R) e entrar. Deve abrir direto em Envio de rastreio.
- Proteção opcional, se aprovada: fazer o acesso mínimo mostrar só um aviso "Acesso ainda não configurado" em vez da tela completa do chat. Assim, uma versão desatualizada nunca mostra a tela do chat para um papel novo. Alteração só na tela que escolhe qual chat mostrar; chats restritos, Leticia, Carla, dermoconsultoras e banco ficam iguais.

Aguardando sua validação e aprovação antes de qualquer mudança.
