# Auditoria dos alertas restantes — equipe, etiquetas, etapas do funil e pacotes

Os dois alertas anteriores (listas de contatos e campanhas) já foram corrigidos e não aparecem mais. O verificador agora aponta seis alertas críticos novos, todos com a mesma raiz. Esta auditoria é somente de leitura; nada foi alterado.

## 1. Causa (verificada agora)

Seis tabelas têm uma regra de leitura com condição literal `true` para qualquer usuário autenticado:

| Tabela | Regra de leitura | Condição | Regra de escrita |
|---|---|---|---|
| team_members | Authenticated read team_members | true | somente admin |
| teams | Authenticated read teams | true | somente admin |
| team_functions | Authenticated read team_functions | true | somente admin |
| tag_definitions | Authenticated read tag_definitions | true | somente admin |
| pipeline_stages | Authenticated read pipeline_stages | true | somente admin |
| skill_packs | authenticated_read_skill_packs | true | somente servidor |

Escrever já é restrito a admin. O problema é apenas a **leitura aberta a qualquer conta logada** — incluindo Carla (parcerias), Leticia (expedicao) e as dermoconsultoras.

## 2. Dados expostos

- **team_members**: nome, **e-mail**, papel, situação, equipe, função e peso de rodízio de toda a equipe.
- **teams** e **team_functions**: estrutura interna de times e funções.
- **tag_definitions**: etiquetas internas de classificação de clientes.
- **pipeline_stages**: etapas do funil, inclusive os critérios de automação da Nina.
- **skill_packs**: catálogo de pacotes de habilidades e quais segredos cada um exige (sem valores de segredo).

## 3. Quem lê hoje

Todos os papéis: admin, os dois sdr, Carla, Leticia e as cinco dermoconsultoras — e qualquer conta nova. `anon` não tem acesso (a regra exige sessão).

## 4. Quem precisa ler de verdade

Verificado no código:

- **Pipeline, Contatos, Chat ao Vivo completo e Agendamentos** (admin e sdr) leem etapas do funil, etiquetas, membros da equipe, times e funções.
- **Cérebro** (somente admin) lê os pacotes de habilidades.
- As telas restritas de Carla, Leticia e das dermoconsultoras **não leem nenhuma dessas tabelas** — elas trabalham por funções de servidor que já revalidam sessão, papel e concessão. Restringir não afeta essas telas.
- Os fluxos de servidor (Nina, encaminhamentos, Shopify, WhatsApp, verificação de saúde, inicialização) usam a chave de servidor e ignoram essas regras.

## 5. Correção mínima proposta

- `team_members`, `teams`, `team_functions`, `tag_definitions`, `pipeline_stages`: leitura somente para `is_operational_staff(auth.uid())` (admin/gestão/sdr). Escrita segue só com admin, como hoje.
- `skill_packs`: leitura somente para `is_admin_or_manager(auth.uid())`, já que só o Cérebro usa e ele é área de admin.
- Nada de `anon` nessas tabelas.

Uma única migration: remove as 6 regras de leitura abertas e cria 6 regras de leitura com verificação de papel. Nenhuma regra de escrita, conta, papel, concessão, conversa ou arquivo de código é alterada.

## 6. Impacto

- Sem impacto para admin e para os dois sdr — continuam com Pipeline, Contatos, Chat, Agendamentos e responsáveis funcionando igual.
- Carla, Leticia e as dermoconsultoras deixam de conseguir ler a lista de e-mails da equipe e a estrutura interna pelo banco; as telas restritas delas continuam idênticas.
- Sem impacto em encaminhamentos, rodízio das dermoconsultoras, responsável, histórico, campanhas, Shopify e WhatsApp.

## 7. Alertas que ficam de fora deste plano

Continuam abertos, em nível de aviso, e podem ser tratados depois: arquivos das pastas de mídia (`whatsapp-media` e `brain-media`) acessíveis a qualquer conta logada, e algumas tabelas internas de fila com regra ampla. Diga se quer que eu inclua.

## 8. Testes após a implementação

- Conferir no banco, por papel, quem lê cada uma das seis tabelas.
- Como admin: Pipeline, Contatos, Equipe, Agendamentos, Cérebro e Configurações.
- Como sdr: Pipeline com etapas e etiquetas, Chat com responsável, Contatos e Agendamentos.
- Como Carla, Leticia e uma dermoconsultora: chat restrito abrindo, respondendo e finalizando normalmente.
- Bateria de testes e verificador de segurança novamente.
