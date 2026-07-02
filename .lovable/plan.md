# Corrigir status "offline" no `/cerebro` com instância respondendo

## Diagnóstico

O status é **derivado no frontend** a partir da idade do `last_heartbeat`:

- `src/hooks/useInstance.ts` → `HEARTBEAT_ONLINE_WINDOW_MS = 10 * 60 * 1000` (10 min).
- Se `now - last_heartbeat > 10min` ⇒ badge fica **offline**, mesmo com a coluna `status='online'` no banco.

Estado atual do banco (consulta agora):

```text
hostname:     srv1775861
ingress_url:  https://rather-swing-mrs-while.trycloudflare.com
status:       online     ← coluna do banco
last_heartbeat: 14 min atrás   ← ultrapassa a janela de 10 min ⇒ UI mostra "offline"
```

E o cron da VPS (`skills/nina/scripts/heartbeat.sh`) roda **a cada 5 min**. Ou seja: **basta 1 heartbeat perder o tick** (rede lenta, quick tunnel reconectando, systemd cronjob atrasado) para a idade passar de 10 min e o painel piscar "offline" — mesmo com a Nina respondendo, porque o `nina-orchestrator` dispara pro `ingress_url` diretamente e não olha a idade do heartbeat.

Nos logs recentes o `nina-orchestrator` inclusive registrou: *"OpenClaw instance resolvida por fallback single-tenant"* — a orquestração não valida frescor do heartbeat, então o envio funciona mesmo com a UI marcando offline.

**Causa raiz**: janela de "online" apertada demais para a frequência do cron. Secundariamente, o heartbeat da VPS às vezes atrasa/pula (a última execução foi ~14 min atrás, sendo que deveria ter tido 2 execuções nesse intervalo).

## Plano de ação

### 1. Aumentar a janela de tolerância no frontend (correção principal, imediata)

Passar `HEARTBEAT_ONLINE_WINDOW_MS` de **10 min → 15 min** em `src/hooks/useInstance.ts`. Isso dá margem de 3x o intervalo do cron (5 min), padrão comum pra monitoramento tolerar 1–2 ticks perdidos sem alarme falso.

Racional:
- Um tick perdido (5 min) continua dentro da janela.
- Dois ticks perdidos disparam o offline — aí é sintoma real (cron/tunnel travados).
- Não muda nada no backend; puramente cosmético/UX.

### 2. Cruzar `status` da coluna + idade do heartbeat (correção fina)

Ajustar `computeInstanceStatus()` para retornar **`offline` apenas quando `status='offline'` na coluna E o heartbeat estiver velho**. Se a coluna diz `online` e o heartbeat está velho mas ainda "recentíssimo" (< 20 min), mostrar um estado intermediário — mantemos como `online` para não gerar falso alarme. Se o reaper do banco marcar `status='offline'`, aí sim a UI segue.

Isso alinha a UI com a verdade do banco: quem "declara" offline é o `reap-orphan-runs` (backend), não uma comparação isolada no cliente.

### 3. (Opcional recomendado) Reduzir cron da VPS de 5 min → 2 min

Documentar no `install/setup-nina.sh` / `install/docs/named-tunnel.md` a recomendação de cron `*/2 * * * *` para o `heartbeat.sh`. Não altera edge functions nem código do painel; é config de sistema no host da Nina.

Nesta rodada **não altero o installer** — só deixo a recomendação registrada. Se quiser que eu já mexa no `setup-nina.sh`, me avise.

### 4. Investigação follow-up (fora do scope deste patch)

Depois de aplicar (1) e (2), se ainda cair para offline:
- SSH na VPS: `tail -n 50 ~/.nina-sdr/logs/heartbeat.log` e `systemctl list-timers | grep nina` — ver se o cron está de fato rodando a cada 5 min.
- Checar se o `cloudflared-nina` reiniciou (quick tunnels trocam URL; o `heartbeat.sh` re-detecta, mas se falhar o body vai sem `ingress_url`).

### Arquivos alterados nesta rodada

- `src/hooks/useInstance.ts` — janela para 15 min + lógica cruzada com `instance.status`.

Nenhum outro arquivo do backend, edge function ou schema é tocado.
