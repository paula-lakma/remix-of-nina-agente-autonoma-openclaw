# Architecture decisions

- Pedidos normalizados (`orders`/`order_items`) são derivados de `shopify_events` por gatilho à prova de falha + reconciliação diária; a operação (webhook, rastreio, Chat) nunca depende deles. Why: camada comercial isolada, sem risco à operação.
