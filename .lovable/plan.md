# João Felipe: por que a Nina disse "a Barbara está aqui para te ajudar"

## Auditoria read-only (feita agora)

Mensagens reais da conversa `a7b8eddb-…a5a1` (UTC):

```text
14:48:35  cliente  "Quero falar com uma dermoconsultora..."
14:48:54  nina     "Vou te encaminhar para uma dermoconsultora..."   (deterministic_handoff)
14:51:04  human    "Olá, João! Sou a Barbara, dermoconsultora da Lakma..."   (from_type = human)
14:54:30  cliente  "Oi, ainda preciso de ajuda."
14:55:03  nina     "Oi, Joao! A Barbara está aqui para te ajudar..."  (source: openclaw)
```

Estado do banco imediatamente antes da resposta da Nina (consultado agora, inalterado desde então):
`status=nina`, `ai_paused=false`, `attendance_finished=false`, `attendance_finished_at=null`,
`human_takeover_required=false`, `requires_dermoconsultant=false`, `handoff_type=null`,
`handoff_reason=null`, `human_status=null`, `assigned_user_id=null`.

Ou seja: **o trigger de reabertura limpou tudo corretamente**. O banco não é a causa.

`contacts.client_memory` também não cita Barbara em nenhum campo — nenhuma memória residual
de responsável anterior. Não há campo "último agente" enviado ao modelo.

## Causa raiz exata

No `nina-orchestrator` (linhas 500-505), o histórico enviado ao cérebro é montado assim:

```ts
role: msg.from_type === 'user' ? 'user' : 'assistant'
```

e depois rotulado como `Lead:` ou `Nina:`. A mensagem da Barbara tem `from_type = 'human'`,
logo entrou no prompt como se **a própria Nina** tivesse escrito
"Sou a Barbara, dermoconsultora da Lakma". Para o modelo, a Nina havia acabado de se
apresentar como Barbara e o atendimento humano parecia em andamento.

Ponto exato onde o contexto incorreto entrou: montagem de `conversationHistory`
(`supabase/functions/nina-orchestrator/index.ts:500-505`) e o bloco
"## Conversa recente" do `agentMessage` (linha ~637). Não há nenhuma instrução no prompt
que distinga atendimento humano ATIVO de atendimento humano ENCERRADO.

A Nina, portanto, apenas inferiu pelo histórico mal rotulado — não recebeu nenhum dado
estruturado apontando Barbara como responsável.

## Correção mínima proposta

Somente no `nina-orchestrator`, na montagem do contexto (nada de banco, nada de trigger):

1. **Rotular corretamente cada autor no histórico**: mensagens com `from_type = 'human'`
   passam a aparecer como `Atendente humano (atendimento encerrado):` em vez de `Nina:`.
   Mensagens `nina`/`ai` continuam `Nina:`; `user` continua `Lead:`.
2. **Bloco de estado do atendimento** no prompt, curto e determinístico, calculado a
   partir do estado real da conversa no momento da chamada:
   - se `assigned_user_id` está vazio e a conversa está com a Nina →
     "O atendimento humano anterior foi ENCERRADO. Você (Nina) é a única responsável agora.
     Nunca diga que um profissional anterior está atendendo, nem prometa chamá-lo de volta,
     a menos que um novo encaminhamento aconteça. Use o histórico apenas para entender o assunto.";
   - se houver responsável humano atribuído, nenhum texto novo (fluxo atual intocado).
3. Nenhuma mudança em: Finalizar atendimento, trigger de reabertura, handoff da Leticia,
   handoff/balanceamento das dermoconsultoras, prioridade da Laura, classificação logística,
   RLS, WhatsApp, Shopify, chat-media, mensagens ou histórico. Nada é apagado.

## Arquivos afetados

- `supabase/functions/nina-orchestrator/index.ts` — rotulagem do histórico + bloco de estado.
- `src/__tests__/` — novo teste unitário do formatador de histórico/estado.

Publicar somente `nina-orchestrator`.

## Plano de teste

1. Teste unitário: histórico com `user` + `nina` + `human` produz os três rótulos corretos;
   conversa sem responsável gera o bloco "atendimento humano encerrado"; conversa atribuída
   não gera o bloco.
2. Suíte completa (128 testes atuais) sem regressão.
3. Teste real repetindo o fluxo do João: handoff → dermo responde → Finalizar →
   nova mensagem do cliente. Esperado: Nina responde sem citar a profissional anterior
   como responsável (ex.: "Oi, João! Claro, pode me falar como posso te ajudar.").
4. Regressão: com uma dermo ainda atribuída (sem finalizar), o comportamento atual não muda.

## Fora do escopo

João Felipe não é normalizado nem atribuído, nenhuma mensagem é enviada, nenhuma migration
é criada e nenhum outro fluxo é tocado.
