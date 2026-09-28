# Architecture decisions

- Pedidos normalizados (`orders`/`order_items`) são derivados de `shopify_events` por gatilho à prova de falha + reconciliação diária; a operação (webhook, rastreio, Chat) nunca depende deles. Why: camada comercial isolada, sem risco à operação.
- Métricas de Vendas (`/ecommerce`) vêm só das funções `ecom_*` sobre `orders`/`order_items` (agregação no banco; cliente = `ecom_customer_key`). Banco libera admin/manager/sdr; a interface decide quem vê pela área `ecommerce`. Why: definição única e liberar SDR sem migration.
