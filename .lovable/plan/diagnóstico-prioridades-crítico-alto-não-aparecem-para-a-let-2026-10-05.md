# Diagnóstico: prioridades CRÍTICO/ALTO não aparecem para a Letícia

## Resultado (somente leitura, 05/10/2026)

**Causa confirmada: a versão publicada do site ainda é antiga.** A mudança de tela existe no projeto, mas nunca foi publicada.

1. **Conta da Letícia:** usuário `7faca642-f4f2-4db6-adc3-ccda47b49999`, equipe `22222222-0000-4000-a000-000000000004`, papel `expedicao`. Com esse papel, o Chat abre a tela restrita dela (`ChatRouteSwitch` → `ExpedicaoChat` / `RestrictedHandoffChat`). É a tela certa.
2. **Site publicado:** baixei o arquivo principal do site publicado (project-perfection-guide.lovable.app). Ele **não contém**:
   - nenhum texto da prioridade ("Críticos", "Possível medida judicial", `priority_level`);
   - o aviso "Janela de 24 horas encerrada" (Etapa 3);
   - a lista "Exceções Letícia" (Passo B);
   - o novo formato de horário do Chat.
   Ou seja: várias mudanças de tela, desde o horário do Chat, estão só no projeto e na pré-visualização, sem publicação.
3. **Servidor:** a parte do servidor (cálculo de prioridade na função da Letícia, bloqueio da janela) é publicada na hora e já está no ar. A tela antiga apenas ignora esses dados.

## O que não foi possível conferir

- Não chamei a função da lista com o login da Letícia, porque não tenho a sessão dela. Por isso, não confirmei a resposta real com os campos de prioridade. As contagens anteriores (26 ALTO, 7 NORMAL) vieram da mesma regra rodada sobre os dados atuais, não da resposta da função.

## Correção proposta (após aprovação)

1. Você clica em **Publicar → Atualizar** (só a pessoa dona do projeto pode publicar a tela; nenhuma mudança de código é necessária).
2. Depois disso, confiro no site publicado que os textos novos estão no arquivo.
3. A Letícia recarrega a página (Ctrl+Shift+R) e deve ver a etiqueta ALTO nas conversas que estão no topo da lista.

Atenção: publicar leva junto todas as mudanças de tela pendentes acima (horário do Chat, Exceções Letícia, aviso da janela de 24 horas, prioridades). Todas já foram aprovadas por você em passos anteriores.
