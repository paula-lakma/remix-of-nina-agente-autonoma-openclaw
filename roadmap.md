# Roadmap

## V1.1 (pendente)
- Permitir abrir diretamente uma conversa antiga pelo CRM mesmo quando ela não estiver carregada na lista atual do Chat.

## Vendas (Dashboard E-commerce)
- [x] V1 na Preview (admin/manager).
- Pendente (aguarda decisão): no celular (390px) o conteúdo de todas as páginas fica com largura zero ao lado do menu — problema já existente do layout geral, não corrigido nesta etapa.
- [x] Correção: atualizações de pagamento (pending -> paid) da Shopify deixam de ser descartadas.
- Pendente (aguarda aprovação): recuperar pedidos antigos que ficaram "pending" com pagamento perdido.
- [x] Recuperação dos pedidos pending — Etapa 0 (teste de acesso à Shopify) concluída.
- [x] Etapa 1 dry run concluída (19 elegíveis).
- [x] Etapa 2 piloto #2272 concluído.
- Pendente (aguarda aprovação): reconciliar os outros 18 elegíveis.

- [x] Auditoria read-only refund_audit dos 3 REFUNDED (#2009, #2036, #2107) — sem reconciliar
- [x] #2009, #2036, #2107 corrigidos para refunded (reembolso total auditado).
- [x] Vendas V2 Fase 1: estrutura order_refunds + colunas em orders (sem dados)
- Pendente (aguarda aprovação): Vendas V2 Fase 2 (captura de reembolsos futuros; decidir read_all_orders).
- [ ] Vendas V2 Fase 2 Passo 1: read_orders NÃO lê pedido de julho (#1781 voltou null) — aguarda nova análise do usuário
- [x] Vendas V2 Passo 6 Etapa A: estrutura (0015) + dry-run sem escrita.
- [ ] Passo 6 Etapa B (apply manual ≤5 pedidos) — aguarda aprovação.
- [ ] Passo 6 Etapa C (limpar teste da Shopify + worker a cada 15 min) — aguarda aprovação.
- [ ] Passo 6 Etapa D (reconciliação a cada 6h) — aguarda aprovação.
