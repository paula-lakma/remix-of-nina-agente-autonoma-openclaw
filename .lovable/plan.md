# Publicação da correção de classificação de atraso/rastreio

## Alterações aprovadas no diff

As seguintes modificações já estão validadas localmente (27 testes passando) e aguardam deploy/publicação:

1. **`supabase/functions/_shared/handoff.ts`**
   - Adiciona `TRACKING_HANDOFF_PROMPT` com regras explícitas de rastreio/entrega.
   - Insere 7 regras de fallback no `REASON_MATRIX` para `where_is_my_order`, `tracking_no_update`, `tracking_not_received`, `tracking_code_invalid`, `tracking_link_issue`, `shipped_no_info` e `carrier_question`, todas com destino `financeiro`.
   - Corrige regex de `procedimento_recente` para capturar "Fiz peeling".

2. **`supabase/functions/nina-reply/index.ts`**
   - Remove o default inseguro `{ reason: "sensitive_case", destination: "dermoconsultant" }` do fallback legado.

3. **`supabase/functions/nina-orchestrator/index.ts`**
   - Anexa `TRACKING_HANDOFF_PROMPT` ao prompt do sistema em todos os runs.

4. **`supabase/functions/brain-build/index.ts`**
   - Adiciona regras de rastreio/entrega e seção de encaminhamento ao `produtos.md` gerado.

5. **`src/__tests__/handoff-classification-matrix.test.ts`**
   - 20 casos sintéticos de regressão e fronteiras.

## Ações deste plano

1. Deploy das edge functions alteradas:
   - `nina-reply`
   - `nina-orchestrator`
   - `brain-build`

2. Publicar o frontend para refletir os testes e garantir consistência.

3. Após deploy, executar validação sintética local dos testes novamente e reportar sucesso.

## Garantias

- Nenhuma conversa existente será alterada.
- Nenhum WhatsApp real será enviado durante a publicação.
- O banco de dados não sofrerá migração; apenas as funções de edge serão reimplantadas.
