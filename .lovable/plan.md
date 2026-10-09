# Plano: `lancamentos_plla_ghkcu_lakma_v2` com botão "Não quero receber"

Auditoria somente leitura. Nada foi alterado, criado ou submetido.

## 1. Arquivos que precisariam mudar
- `src/pages/Templates.tsx`: formulário "Novo template" ganha botões de resposta rápida e uma opção "copiar corpo de um modelo aprovado".
- `supabase/functions/_shared/templateRules.ts`: nova regra pura `validateQuickReplyButtons`.
- `supabase/functions/submit-template/index.ts`: chamar essa validação antes de enviar à Meta.
- `src/__tests__/template-admin.test.ts`: novos testes.

Não mudam: `sync-template-status`, `whatsapp-sender`, `whatsapp-webhook`, `expedicao-chat`, banco, Campanhas.

## 2. Suporte atual
- **submit-template:** já aceita `BUTTONS`. Repassa cada botão como `{type, text}`, então QUICK_REPLY já chega à Meta no formato correto. Hoje também aceita URL, telefone, código e OTP, e não valida quantidade nem tamanho.
- **sync-template-status:** lê `components` da Meta e grava como vieram em `meta_templates.components` (json). Botões aprovados ficam salvos sem mudança.
- **Armazenamento local:** `meta_templates.components`, que já guarda o formato da Meta.
- **Tela:** não tem campo de botão, e os cartões não mostram corpo nem botões (só nome, categoria, status e ID).

## 3. Mudanças mínimas
- **Formulário:** seção "Botões de resposta rápida (opcional)", até 3 campos de texto. Só gera `{type:"BUTTONS", buttons:[{type:"QUICK_REPLY", text}]}` quando há botões. Sem botões, o envio sai idêntico ao atual.
- **Copiar corpo:** seletor "Usar corpo do modelo aprovado…", que lista só modelos APPROVED. Copia o texto do corpo direto do registro salvo, sem redigitar. O campo fica bloqueado para edição enquanto a cópia estiver ativa. Assim o corpo do `lancamentos_plla_ghkcu_lakma` vai igual, byte a byte (emojis e quebras de linha incluídos).
- **Validação (tela e servidor), só QUICK_REPLY nesta etapa:**
  - máximo 3 botões;
  - texto de 1 a 25 caracteres depois de remover espaços;
  - botão vazio recusado;
  - textos repetidos recusados;
  - qualquer outro tipo (URL, telefone, código, OTP) recusado no servidor com mensagem clara.
  - Modelos atuais não passam por essa regra: ela só roda quando o pedido traz `BUTTONS`.
- **Exibir no cartão (somente leitura):** pequena lista "Botões: Não quero receber", lida de `components`. Modelos sem botão continuam iguais.

## 4. sync-template-status precisa mudar?
Não. Ele já grava os botões que a Meta devolve.

## 5. A tela precisa mudar para exibir o botão?
Sim. Hoje nada de `components` é exibido; vai uma linha mínima no cartão (item 3).

## 6. A v2 já existe?
- **Localmente:** não. Só existe `lancamentos_plla_ghkcu_lakma` (APPROVED, pt_BR).
- **Na Meta:** sem registro local. A sincronização importa todo modelo que existe na Meta, então a ausência local indica que não existe lá, mas isso não foi consultado agora direto na Meta. Na Build, antes de submeter, rodo a sincronização em modo simulação (não grava nada) para confirmar. A submissão também já recusa nome duplicado na Meta sem renomear.

## 7. Riscos de regressão
- **Envio de modelos existentes:** nenhum risco. `whatsapp-sender` e `retomada_atendimento_lakma` não são tocados, e a validação só roda com botões.
- **Restringir botões a QUICK_REPLY no servidor:** nenhum dos 20 modelos locais usa URL ou telefone hoje (a ser reconfirmado na Build), então ninguém perde funcionalidade em uso.
- **Envio da v2 hoje:** enviar a v2 sem o parâmetro de botão funciona, mas o clique ainda não registra descadastro. Ela não deve ir para Campanhas até a etapa do opt-out.
- **Conta na Meta:** a forma de pagamento com erro (131042) não impede criar ou aprovar modelos, só a entrega das mensagens.

## 8. Testes
- Validação: 1 a 3 botões aceitos; 4 recusados; texto vazio ou com 26 caracteres recusado; "Não quero receber" (17) aceito; URL e telefone recusados; repetidos recusados.
- Sem botões, o pedido à Meta é idêntico ao atual (verificação do código montado).
- Corpo copiado é igual, caractere por caractere, ao do registro APPROVED.
- Cartão lê os botões de `components` e ignora modelos sem botão.
- Suíte completa e verificação de tipos.

## 9. Build mínimo recomendado
1. Regra de validação + uso no `submit-template` + testes. Publicar só `submit-template`.
2. Formulário (botões + copiar corpo) e linha de botões no cartão.
3. Sincronização em simulação para confirmar que a v2 não existe na Meta.
4. Submeter `lancamentos_plla_ghkcu_lakma_v2` (MARKETING, pt_BR, corpo copiado, botão "Não quero receber"). Parar e informar o status da Meta.
O original `lancamentos_plla_ghkcu_lakma` não é editado, excluído nem substituído.

## 10. Confirmação
Nada foi alterado: sem código, banco, modelo, submissão, mensagem ou função publicada.
