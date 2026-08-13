# Diagnóstico: o painel "Testar o cérebro" mantém contexto?

## A) Stateless

O sandbox é **stateless**. Cada clique em "Testar" gera:

- `runId = test-<uuid>` novo (`nina-test/index.ts`, linha 69)
- `testConversationId = crypto.randomUUID()` novo (linha 70), explicitamente "cosmético; não cria conversa real"
- uma linha nova em `nina_test_results` (chave = `run_id`)

Não há `session_id`/`thread_id` persistido entre execuções, nem leitura de execuções anteriores. Nada liga o teste 2 ao teste 1.

## B) O que ele envia ao OpenClaw

O `agentMessage` do `nina-test` contém apenas:

1. System Prompt do painel (`test_system_prompt` ou `system_prompt_override`);
2. a **mensagem atual** digitada;
3. a instrução de responder via `nina_reply.sh` com `conversation_id` + `run_id`.

Não envia histórico, não envia `client_memory`, não envia bloco de agendamento. Endpoint: `POST {ingress_url}/hooks/agent`, `deliver:false`, `metadata.mode = "test"`.

Ressalva: o payload usa `name: "nina_whatsapp"` (mesma sessão nomeada da produção). Qualquer resquício de contexto que apareça vem da sessão do OpenClaw na VPS, não do app — é acidental e não confiável, e é o oposto do isolamento que o app assume.

## C) O teste "Me manda o link" é válido?

**Não.** Do ponto de vista do app, a segunda chamada é uma conversa nova sem nenhuma mensagem anterior. "Me manda o link" chega sozinho, sem referente. A resposta "Qual produto você gostaria do link?" é o comportamento **correto** para o input recebido — não é falha de memória nem de prompt.

## D) Diferença para produção (WhatsApp / Chat ao Vivo)

Produção (`nina-orchestrator`) monta o `agentMessage` com:

- as **últimas 20 mensagens** da conversa (`messages` filtradas por `conversation_id`, formatadas como `Lead: ... / Nina: ...`);
- `contact.client_memory` (bloco "Memória do cliente");
- `conversation_id` real e persistente, `contact_id`, data de hoje em BRT e o bloco de agendamento.

Ou seja: produção é **stateful por conversa**; o sandbox é one-shot.

## E) Forma correta de testar contexto real

1. Usar o WhatsApp real (ou o Chat ao Vivo do painel) com o mesmo contato, mandando as duas mensagens em sequência — é o único caminho que grava em `messages` e alimenta o histórico das últimas 20.
2. No sandbox, testar apenas comportamento de turno único: escrever a mensagem autocontida ("Quero o link do Sabonete Glicólico").

Se você quiser que o sandbox também avalie memória, seria preciso mudança de código (manter `conversation_id` fixo por sessão do painel e enviar o histórico dos testes anteriores) — fora do escopo deste diagnóstico.

Nenhum arquivo foi alterado.
