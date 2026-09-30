# NOVA STORE

Arabic RTL storefront for the existing NOVA store, with a warm editorial design, responsive catalog, favorites, stock-aware checkout, customer accounts and order management.

## Run

Node.js 18 or newer:

```sh
npm ci
npm test
npm start
```

The server listens on `0.0.0.0:$PORT` (default 3000). Both `node server.js` and the existing `node server-db.js` Render start command use the same application.

## Render configuration

- `DATABASE_URL`: existing PostgreSQL connection string. Set this for durable production storage. Prefer Render's internal same-region connection URL.
- `PGSSL=true`: enable verified TLS when connecting over an external connection; the default internal Render connection does not need this flag.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`: existing owner credentials.
- `CUSTOMER_SESSION_SECRET`: a strong, stable random value. Without it, sessions reset at each process restart.
- `DATA_DIR`: local storage directory for development or a mounted persistent disk. Local storage supports one process only. Render's ordinary filesystem is ephemeral; do not rely on it for production orders.
- Existing optional `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UPLOAD_PRESET`, `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` integrations remain supported.

No new paid resources are required by this change. Before production deployment, confirm the service's actual workspace, start command, environment variable names, database connection and recoverable database backup. Do not print secret values.

## Persistence and compatibility

The application preserves the existing `nova_state` JSONB row, including store names, products, customers, credentials and historical orders. It does not recreate or truncate existing data. PostgreSQL reads fetch current state; mutations use a row lock and commit before the HTTP success response. Connection failures return an error instead of accepting unpersisted orders. Notifications run after the commit. Local development writes use serialized operations and atomic file replacement; corrupt data is never silently replaced with demo products.

The existing single-document model remains appropriate for a small catalog but serializes all writes. A high-traffic deployment should move orders/products into separate indexed tables through a separately reviewed migration, rather than assuming horizontal scaling solves this bottleneck.

## Checkout and inventory

- The browser refreshes product availability and server-calculated prices before confirmation.
- Checkout rejects fractional quantities, unavailable quantities, deleted products and changed totals.
- A persistent request key makes retried order submissions idempotent.
- Cancellation restores stock once. Archiving only hides an order and never adjusts inventory.
- Products can be hidden/restored; historical product references are retained.
- Completed orders, archived orders and customer accounts remain in the existing database.
- Password changes invalidate other customer sessions. Guest checkout remains supported.

Old already-open checkout pages must be refreshed after this release because order submissions now include a request key and reviewed total.

## Validation

`npm test` covers pricing, merged duplicate cart lines, overselling, idempotency, concurrency, rollback, corruption handling, session revocation, HTTP routes, embedded JavaScript syntax, hostile product-name escaping, tracking privacy, admin cancellation/archive semantics, product restoration and rejected invalid data. The PostgreSQL transaction test uses an injected client to exercise commit/failure ordering; a live database check is still required at deployment.

Before publishing, review desktop and mobile layouts in a reachable preview, then check `/health`, `/api/catalog`, search, favorites, product gallery, cart quantities and checkout validation. Test purchases should only be submitted against isolated test data. The local execution environment could not be reached by the cloud browser, so visual verification remains a deployment gate.
