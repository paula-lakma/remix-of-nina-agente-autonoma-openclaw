# Diagnóstico do 504 no "Testar o cérebro"

## A) Causa exata

O OpenClaw **respondeu com sucesso** nas duas tentativas — só demorou mais do que o teto de espera do `nina-test`.

Registros reais em `nina_test_results` (respostas gravadas pela `nina-reply`, status `sent`):

| run | tempo até a resposta | tamanho da resposta |
|---|---|---|
| `test-b395e368…` (12:18:58) | **68,7 s** | 943 chars |
| `test-9699895f…` (12:20:42) | **46,8 s** | 978 chars |
| runs anteriores (12/08 e antes) | 16–25 s | 96–253 chars |

O `nina-test` desiste em 35 s e devolve 504, enquanto a resposta chega em 47–69 s. Ou seja: **falso timeout** — o teste aborta antes, mas o cérebro conclui e grava a resposta depois.

O que mudou: o payload passou a carregar o System Prompt do painel (`nina_settings`, **19.588 caracteres ≈ 19,6 KB**) além dos arquivos da VPS. Mais contexto de entrada + resposta ~4x maior (≈960 vs ≈200 chars) elevaram o tempo de inferência de ~17 s para 47–69 s. O tempo dobrou/triplicou e passou do teto.

## B) Timeout atual

`supabase/functions/nina-test/index.ts`:
- `HOOKS_DISPATCH_TIMEOUT_MS = 12_000` — AbortController do `fetch` para o ACK do `/hooks/agent` (só o enfileiramento; **não** foi esse que estourou).
- `POLL_TIMEOUT_MS = 35_000` — teto de espera pela resposta, com `POLL_INTERVAL_MS = 1_500`. **É este que dispara o 504.**
- No payload vai `timeoutSeconds: 120` (limite do lado do OpenClaw) — ou seja, o app espera 35 s por um run que ele mesmo autorizou a levar até 120 s.

## C) A requisição chegou ao OpenClaw?

Sim, chegou e foi processada integralmente. Provas: o `fetch` do ACK retornou OK (senão o retorno seria 502 `dispatch_failed`, não 504), e a `nina-reply` logou `resultado de teste registrado (run_id=test-…, status=sent)` para os dois runs, com conteúdo gravado. Não há erro de rede, de auth (`hooks_token`) nem de ingress. Nenhum erro correspondente nos logs das funções — o único sintoma é a demora.

Endpoint exato: `POST {instances.ingress_url}/hooks/agent`, com `Authorization: Bearer <hooks_token>`, `deliver:false`, `wakeMode:"now"`, `thinking:"low"`, `metadata.mode = "test"`.

## D) Duplicação / excesso de prompt

Sim, há duplicação de contexto:

1. O `nina-test` injeta o System Prompt do painel (~19,6 KB) dentro da mensagem, sob o cabeçalho "Instruções de sistema (precedência máxima)".
2. A mesma persona/instruções já existem na VPS como arquivos de skill (`skills/nina/SKILL.md`, `identity/identity.md`, `prompts/conversa.md`, `produtos.md`), carregados automaticamente pelo OpenClaw a cada run.

Resultado: o modelo lê a mesma orientação duas vezes por chamada — mais tokens de entrada, mais tempo de resposta. Observação: o `nina-test` lê `test_system_prompt` com precedência, mas ele está vazio; a linha usada é a global (`user_id` nulo) com `system_prompt_override` de 19.588 chars.

Importante: **a produção também injeta o prompt** no `agentMessage` (`nina-orchestrator`), então a duplicação não é exclusiva do teste.

## E) Diferença teste x produção

O conteúdo agora é equivalente, mas o **modelo de espera é oposto**:

```text
Produção  : orchestrator -> /hooks/agent (fire-and-forget, só espera o ACK 12s)
            -> nina-reply -> send_queue -> WhatsApp   [demora de 60s é invisível]
Teste     : nina-test -> /hooks/agent (ACK 12s)
            -> POLL síncrono de 35s por nina_test_results  [aborta e devolve 504]
```

A produção nunca espera o run terminar; só o sandbox tem teto de 35 s. Por isso o WhatsApp responde normalmente enquanto o botão "Testar" falha.

## F) Correção mínima recomendada

Uma única linha: alinhar o teto de espera do teste ao limite que ele próprio concede ao agente — subir `POLL_TIMEOUT_MS` de `35_000` para `120_000` em `supabase/functions/nina-test/index.ts` (mesmo valor de `timeoutSeconds: 120`), ajustando o texto "pode levar até ~35s" no `TestBlock.tsx`.

Nada mais precisa mudar: prompt, brain-build, produtos, protocolos, WhatsApp, pipeline e handoff estão fora do caminho da falha.

Opcional, num segundo momento (não necessário para destravar): reduzir a duplicação prompt-do-painel vs arquivos da VPS, que é a origem do aumento de latência de ~17 s para ~50 s.

Nenhum arquivo foi alterado neste diagnóstico.
