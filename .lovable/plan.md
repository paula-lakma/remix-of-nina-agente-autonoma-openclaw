
# Instalação do projeto "Viver de IA / Nina Agente Autônomo"

## 1. Aviso importante sobre stack

O ambiente Lovable atual roda **TanStack Start** (SSR em Cloudflare Worker). O projeto enviado é **Vite SPA puro com react-router-dom + Supabase auto-hospedado**. Você escolheu "Substituir tudo (Vite SPA puro)". Implicações:

- Funciona em `bun run dev` / `bun run build` normalmente — Vite 6 é suportado.
- O pipeline interno de SSR/Worker do template TanStack será removido (`src/server.ts`, `src/start.ts`, `src/router.tsx`, `src/routeTree.gen.ts`, `src/routes/`, `src/styles.css`).
- Publish/Preview do Lovable continuam funcionando para SPA estática, mas perdem SSR.
- Cloud "nativo" não será usado — o app conecta direto no Supabase original (`sghupuouyowhopnscvdp`) via `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` já presentes no `.env` do upload (são chaves publicáveis, ok ficar no repo).

## 2. Passos de instalação

1. **Limpar scaffold TanStack** — remover `src/server.ts`, `src/start.ts`, `src/router.tsx`, `src/routeTree.gen.ts`, `src/routes/`, `src/styles.css`, `src/lib/*` específicos do TanStack (error-capture, lovable-error-reporting, config.server, api/example.functions), `src/integrations/` placeholders.
2. **Copiar upload** (excluindo qualquer `.git`, `node_modules`, `bun.lock`, `package-lock.json`, `.env`) para `/dev-server`:
   - `src/`, `public/`, `supabase/`, `docs/`, `skills/`, `skill-packs/`, `openclaw-skills/`, `install/`
   - `index.html`, `tailwind.config.ts`, `postcss.config.js`, `vite.config.ts`, `tsconfig.json`, `package.json`, `CHAT_SYSTEM_SQL_SCRIPTS.sql`
3. **Reescrever `package.json`** preservando os scripts `dev/build/build:dev/preview`, mantendo todas as deps do upload, e adicionando `@types/canvas-confetti` se faltar.
4. **Reescrever `vite.config.ts`**: manter alias `@`, plugin react-swc + componentTagger; remover o `define` de `process.env.API_KEY` (Gemini será lida via `import.meta.env.VITE_GEMINI_API_KEY` ou via edge function — ver passo 5).
5. **Variáveis de ambiente**:
   - `.env` (commitável) já contém as chaves publicáveis do Supabase. Manter.
   - `GEMINI_API_KEY` será adicionada via tool `add_secret` para uso em edge functions (não exposta no bundle). Onde o código frontend usar `process.env.API_KEY`, refatorar para chamar a edge function `generate-prompt` / `nina-reply` que já existem no upload — não expor a chave no cliente.
6. **`bun install`** — gerar lockfile novo.
7. **Restart do dev server** e verificar preview.

## 3. Checklist de correção (a executar após instalar)

### A. Código vs stack (Vite SPA)
- [ ] Garantir que nenhum import aponte para `@tanstack/*` remanescente.
- [ ] Validar todos os imports relativos em `src/App.tsx`, `src/components/*`, `src/hooks/*`, `src/services/*`.
- [ ] Confirmar que `src/integrations/supabase/client.ts` usa `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY`.
- [ ] Procurar e refatorar todos os `process.env.API_KEY`/`process.env.GEMINI_API_KEY` no frontend — devem virar chamadas a edge function.
- [ ] Verificar que `tailwind.config.ts` + `src/index.css` contêm os tokens semânticos usados pelos componentes (`bg-background`, `text-foreground`, `border`, `primary`, `accent`, `card`, `popover`, `sidebar`, `destructive`).
- [ ] Conferir que todos os componentes `src/components/ui/*` referenciados existem (rodar `tsc --noEmit` via build).
- [ ] Garantir favicon `public/favicon.png`.

### B. Banco + segurança SQL
- [ ] Listar todas as 60+ migrations em ordem cronológica e validar que cada `CREATE TABLE public.*` é seguido de `GRANT` + `ENABLE RLS` + `CREATE POLICY`.
- [ ] Identificar tabelas sem RLS habilitada (vulnerabilidade crítica).
- [ ] Identificar policies que usem `auth.uid()` direto em tabelas de roles (anti-padrão — deve usar `has_role()` SECURITY DEFINER).
- [ ] Validar que `user_roles` existe e segue o padrão `app_role` enum + função `has_role`.
- [ ] Conferir que `CHAT_SYSTEM_SQL_SCRIPTS.sql` (37 KB) já está coberto pelas migrations ou precisa virar migration nova.
- [ ] Rodar `security--run_security_scan` ao final e revisar findings.

### C. Edge functions (~30 funções)
Para cada função em `supabase/functions/*`:
- [ ] Conferir `verify_jwt` em `supabase/config.toml` (públicas: `whatsapp-webhook`, `health-check`, `heartbeat`; demais: autenticadas).
- [ ] Listar secrets requeridos por função (`Deno.env.get(...)`): provavelmente `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `WHATSAPP_*`, `GITHUB_PAT`, `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Validar uso de `SUPABASE_SERVICE_ROLE_KEY` — só em funções autenticadas ou com verificação de assinatura.
- [ ] Webhooks (`whatsapp-webhook`, `simulate-webhook`) devem verificar assinatura HMAC antes de processar payload.
- [ ] Conferir CORS headers em `_shared/`.
- [ ] Marcar quais funções dependem de secrets ainda **não configurados** — usuário fornecerá depois.

### D. Completude funcional vs `docs/ONBOARDING-CLIENTE.md`
- [ ] Ler `docs/ONBOARDING-CLIENTE.md` e extrair lista de features esperadas.
- [ ] Mapear cada feature para componente/rota/edge function existente.
- [ ] Reportar gaps (features documentadas mas sem implementação correspondente).
- [ ] Validar rotas declaradas em `App.tsx` (dashboard, pipeline, chat, contatos, settings, team, scheduling, cerebro, auth).
- [ ] Verificar `OnboardingWizard` + `useOnboardingStatus` + tabelas de onboarding nas migrations.

## 4. Secrets a configurar nesta fase

- `GEMINI_API_KEY` — único confirmado agora. Após instalação chamarei `add_secret`.
- Demais (`ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, WhatsApp, GitHub PAT) ficam pendentes; o checklist listará quais funções ficam inoperantes sem elas.

## 5. Entregáveis ao fim

1. Projeto rodando em preview (tela de Auth ou Dashboard, conforme sessão).
2. Relatório markdown no chat com:
   - ✅ itens concluídos do checklist
   - ⚠️ itens com correção aplicada (com diff resumido)
   - ❌ itens bloqueados (faltam secrets/decisões do usuário)
3. Lista priorizada de próximos passos (secrets pendentes, migrations a aplicar no Cloud se quiser migrar depois, features incompletas).

## 6. O que NÃO faço neste plano

- Não migro para Lovable Cloud nem altero o projeto Supabase de destino — continua `sghupuouyowhopnscvdp`.
- Não aplico migrations no Supabase remoto (só valido o SQL localmente).
- Não faço deploy de edge functions (sem CLI Supabase autenticado neste sandbox).
- Não removo arquivos de documentação (`skills/`, `skill-packs/`, `openclaw-skills/`, `install/`) — preservados como referência.
