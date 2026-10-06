# Templates: opt-out por botão (v2 de lançamento) + retomada da Letícia

Auditoria somente leitura. Nada foi alterado (código, banco, modelos, funções, mensagens).

## PARTE A — `lancamentos_plla_ghkcu_lakma_v2` com botão "Não quero receber"

**1. A tela de Templates suporta QUICK_REPLY?** Não. O formulário só tem nome, categoria, idioma, corpo, exemplos e rodapé. A função de submissão já repassa botões (`BUTTONS` → `{type, text}`), então QUICK_REPLY funcionaria no servidor, mas a tela não oferece o campo.

**2. Dá para criar sem mudar código?** Não pela tela. Mudança mínima: adicionar ao formulário uma lista opcional de botões de resposta rápida (até 3, texto até 25 caracteres) que gera `{type:"BUTTONS", buttons:[{type:"QUICK_REPLY", text}]}`. O original aprovado (ID 916638484659402) fica intacto; a v2 é um modelo novo, mesmo corpo, MARKETING, pt_BR.

**3. Estrutura exata do botão (submissão):**
```text
{ "type": "BUTTONS", "buttons": [ { "type": "QUICK_REPLY", "text": "Não quero receber" } ] }
```
No envio, incluir payload fixo e não visível ao cliente:
```text
{ "type":"button", "sub_type":"quick_reply", "index":"0",
  "parameters":[{ "type":"payload", "payload":"lakma_mkt_optout_v1" }] }
```
O envio atual de modelos só monta parâmetros de cabeçalho/corpo; precisa aceitar `template_variables.buttons` (ajuste aditivo, sem efeito em modelos atuais).

**4. Como a Meta devolve o clique:** mensagem recebida `type:"button"` com `button.text` ("Não quero receber"), `button.payload` ("lakma_mkt_optout_v1") e `context.id` = id WhatsApp da mensagem do modelo enviada.

**Achado importante:** hoje o recebimento **ignora** `type:"button"` e `type:"interactive"` (cai em "Tipo não suportado, ignorando"). Ou seja, cliques em botões atualmente não viram mensagem, não chegam à Nina nem ao Chat.

**5. Regra determinística de opt-out (todas obrigatórias):**
- `message.type === "button"`;
- `button.payload === "lakma_mkt_optout_v1"` (igualdade exata);
- `context.id` corresponde a uma mensagem nossa cujo `template_name` está numa lista fechada de modelos de marketing com esse botão (inicialmente só a v2).
Texto digitado "não quero receber" nunca dispara opt-out (chega como `type:"text"`). Sem regex, sem correspondência ampla.

**6. Alterações no recebimento:**
- Aceitar `type:"button"`: gravar mensagem do cliente com conteúdo = texto do botão e `metadata.button = {text, payload, context_id}`.
- Se a regra do item 5 bater: registrar opt-out e **não** acionar a Nina (resposta automática não é enviada); demais cliques de botão seguem o fluxo normal.
- O clique conta como mensagem real do cliente: reabre a janela de 24h normalmente (comportamento correto da Meta).

**7. `contact_consents`:** migration pequena adicionando `whatsapp_template_button` à lista de `source`. Inserção via função de banco só do servidor: `channel=whatsapp, purpose=marketing, status=opted_out, source=whatsapp_template_button, occurred_at=timestamp da Meta`, evidência = id da mensagem, contexto, nome do modelo. Idempotência: se o estado atual já é `opted_out`, não insere; o mesmo id de mensagem nunca gera dois registros. Histórico continua só de inserção. Nenhum contato marcado como `opted_in`.
Opt-out vale só para marketing: rastreio, atendimento e respostas humanas não consultam consentimento (continuam como hoje). Filtrar campanhas por consentimento fica para a etapa de Campanhas (fora deste escopo).

**8. Testes:** regra de reconhecimento (payload exato sim; texto igual digitado não; payload certo com contexto de outro modelo não; payload diferente não); idempotência (clique repetido = 1 registro); envio do modelo com parâmetro de botão; modelos sem botão saem idênticos ao atual.

## PARTE B — Letícia envia `retomada_atendimento_lakma`

**9. Arquivos:** `src/components/ExpedicaoChat.tsx`, `src/components/WindowClosedNotice.tsx`, `src/lib/whatsappWindow.ts`, `supabase/functions/expedicao-chat/index.ts`, nova função de banco `expedicao_send_resume_template`, `whatsapp-sender` (sem mudança: já envia modelos com variáveis de corpo).

**10. Fluxo:** botão → `expedicao-chat` ação `resume_template` → função de banco (com sessão da Letícia) valida e grava `messages` (`from_type=human`, `type=text`, conteúdo = corpo com nome aplicado, `metadata.template_name/template_language/template_variables`, `source=expedicao_resume`) + `send_queue` (`message_type=template`) + evento `expedicao_reply` com `kind=resume_template` → dispara o envio existente. Validações no banco: acesso de expedição à conversa, conversa ativa (acesso não finalizado), janela fechada pela regra oficial, modelo `APPROVED` em `meta_templates`. Nome e idioma fixos no servidor; a tela não escolhe modelo nem texto.

**11. Variável {{1}}:** `call_name` se válido; senão primeiro nome de `name`. Válido = 2–30 caracteres, só letras (com acento), espaço, hífen e apóstrofo; sem números ou emoji. Sem nome válido: botão desabilitado com aviso "Nome do cliente inválido para o modelo — peça a um gerente para corrigir o nome do contato" (a Letícia não edita contatos hoje). Servidor recalcula o nome; nunca usa valor vindo da tela nem inventa.

**12. Idempotência:** recusar se existir retomada na mesma conversa nos últimos 10 min com status ≠ `failed` (verificado com trava na conversa, como na resposta atual). Clique duplo: o botão trava durante o envio.

**13. Falha:** sem mensagem otimista; a mensagem só aparece quando gravada. Erros do servidor (janela aberta, modelo não aprovado, nome inválido, repetição em 10 min) mostrados em texto claro. Falha posterior da Meta aparece como "falhou" no histórico (motivo já guardado) e libera nova tentativa.

**14. Janela de 24h:** modelo não reabre a janela (a regra conta só mensagens do cliente; nada muda nela). Campo livre continua bloqueado após o envio; ao chegar resposta do cliente, libera sozinho. O gatilho do banco que barra texto livre deixa passar só mensagens com `template_name` — confirmar na Build que a nova função passa por ele sem exceções extras.

**15. Visual:** no aviso de janela fechada, botão "Enviar modelo de retomada" (só se janela fechada, conversa ativa e modelo aprovado). No histórico, etiqueta "Modelo de retomada enviado pela equipe". Janela aberta: tela exatamente como hoje.

**16. Backend:** nova função de banco (SECURITY DEFINER, só expedição com acesso), nova ação em `expedicao-chat`, `list`/`probe` passam a informar se a retomada está disponível e o nome calculado. Dermo, parcerias, Paula e Chat geral sem mudança.

**17. Testes:** regra do nome (válidos/inválidos); janela aberta recusa; modelo não aprovado recusa; repetição em 10 min recusa; após `failed` permite; mensagem gravada com metadados do modelo e fila `template`; janela continua fechada após o envio.

## 18. Build enxuto (ordem)
1. B primeiro (sem migration de consentimento, valor imediato): função de banco + ação + botão + testes; publicar só `expedicao-chat`.
2. A: botões no formulário de Templates; criar e submeter a v2 (aguarda aprovação da Meta).
3. A: migration de `source`; envio aceita parâmetro de botão; recebimento aceita `type:"button"` + opt-out; testes; publicar `whatsapp-webhook` e `whatsapp-sender`.
Pausa para aprovação entre etapas.

## 19. Riscos
- Aceitar `type:"button"` passa a entregar cliques de outros modelos à Nina (hoje descartados) — comportamento novo, porém desejável; limitar a texto do botão.
- Payload ausente se o envio não incluir o parâmetro de botão: a Meta devolve o texto como payload; por isso a regra exige payload exato + modelo do contexto.
- Nomes de contato ruins bloqueiam a retomada até correção.
- Opt-out ainda não filtra Campanhas até a etapa própria.

## 20. Confirmação
Nada foi alterado: sem modelo criado, sem mensagem, sem banco, sem função publicada, sem mudança de tela.
