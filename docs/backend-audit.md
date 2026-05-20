# Backend audit — bloom-crm — 2026-05-20

Audit of `server/index.mjs` (10,744 lines, ~438 KB) on `pete79cy/bloom-crm@main` to determine which endpoints needed by `bloom-direct-orders` already exist.

Source read via `gh api repos/pete79cy/bloom-crm/contents/server/index.mjs` raw download (no local clone).

## Endpoint inventory

| Endpoint | Status | Line | Notes |
|---|---|---|---|
| GET /api/orders/:id | exists | 3878 | Returns `{ order, lines, customer, sourceQuote, deliveryNotes, deliverySummary, amendments, proformaInvoices }`. `lines` are joined with `variants` + `plants` and enriched with `description` and `size_summary`. 404 when not found. |
| PATCH /api/orders/:id | missing | — | No `app.patch('/api/orders/:id'` and no `app.put('/api/orders/:id'`. Only mutation routes for orders are `POST /api/orders/save` (full upsert of the `orders` row), `POST /api/orders/consolidate` (line 2257), `POST /api/orders/from-quote` (line 4049), `POST /api/orders/:orderId/delivery-notes` (line 4073), `POST /api/orders/:orderId/amendments` (line 4840), `POST /api/orders/:orderId/proformas` (line 5174). |
| GET /api/customer-prices | exists | 6978 | Query param: `customer_id` (required, 400 otherwise). Returns an array of `{ item_key, variant_id, quote_id, quote_number, common_name, scientific_name, display_name, size_summary, effective_unit_price, base_unit_price, discount_pct, currency, quoted_at }`. Source table: `customer_variant_prices` joined with `variants` + `plants`. Companion endpoints also present: `GET /api/customer-price-history` (7042), `POST /api/customer-prices` (7107), `POST /api/customer-prices/import/parse` (7213), `POST /api/customer-prices/import/apply` (7378). |
| POST /api/auth/login `rememberMe` | missing | 482 | Login route hardcodes `const tokenMaxAge = 86400; // 1 day, matching signJwt default`. Request body is destructured as `const { email, password } = req.body || {}` — no `rememberMe` consumed. `signJwt(payload, expiresInSeconds = 86400)` (line 294) accepts a custom expiry but the login handler never passes anything but the default. No `rememberMe` / `remember_me` references anywhere in the file. |
| POST /api/orders/save | exists | 4003 | Request shape: `{ order: { id, order_number, customer_id, source_quote_id?, status?, delivery_date?, delivery_address_id?, notes?, created_at?, updated_at? } }`. `id`, `order_number`, and `customer_id` are required (400 otherwise). `status` defaults to `'PENDING'`. Performs an `INSERT … ON CONFLICT (id) DO UPDATE` on the `orders` table — header row only, does **not** touch `order_lines`. Returns `{ ok: true }`. |

## CORS allowlist

Defined at lines 158-174:

```js
const ALLOWED_ORIGINS = [
  'https://smartquotations.eu',
  'https://www.smartquotations.eu',
  'https://pakkoutisnurseries.com',
  'https://www.pakkoutisnurseries.com',
];
if (process.env.NODE_ENV !== 'production') {
  ALLOWED_ORIGINS.push('http://localhost:5173', 'http://localhost:4173', 'http://localhost:3000');
}
app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('CORS: origin not allowed'));
  },
  credentials: true,
}));
```

Currently allows (production): `https://smartquotations.eu`, `https://www.smartquotations.eu`, `https://pakkoutisnurseries.com`, `https://www.pakkoutisnurseries.com`. Dev-only adds `http://localhost:5173`, `http://localhost:4173`, `http://localhost:3000`.

`credentials: true` is set, which is required for the `bloom-direct-orders` PWA to send the HttpOnly auth cookie cross-site.

Note: the auth cookie is `SameSite=Lax` (lines 387-410 in `buildAuthCookie`), despite the inline comment at line 522 claiming `SameSite=Strict`. `Lax` will block the cookie from being sent on cross-site XHR/fetch from `https://orders.smartquotations.eu` to `https://smartquotations.eu` — this needs to change to `SameSite=None; Secure` if the PWA is going to rely on cookie-based auth from a different subdomain. Alternative: have the PWA use the body `token` and send `Authorization: Bearer`.

## Tasks in the plan that are actually needed based on this audit

- **Task 11 (CORS): NEEDED** — must add `https://orders.smartquotations.eu` to `ALLOWED_ORIGINS` (production) and `http://localhost:5174` (dev). The PWA also needs the auth-cookie `SameSite` to change to `None; Secure` if cookie auth is the chosen approach, otherwise the PWA must use bearer-token auth instead. Flag this as part of Task 11 or split into a separate task.
- **Task 12 (rememberMe): NEEDED** — neither the request body nor the login handler currently understands a remember-me flag, and the token lifetime is hardcoded to 1 day. Need to accept `rememberMe: boolean` in the body, pick a longer `tokenMaxAge` (e.g., 30 days) when true, pass it to both `signJwt(..., tokenMaxAge)` and `buildAuthCookie(token, tokenMaxAge)`.
- **Task 13 (GET /api/orders/:id): NOT NEEDED** — endpoint already returns a rich payload including `order`, `lines` (with plant/variant joins and computed `description` + `size_summary`), `customer`, `sourceQuote`, `deliveryNotes`, `deliverySummary`, `amendments`, and `proformaInvoices`. Confirm the PWA can consume this shape; if it needs a slimmer payload, that's a frontend-side mapping concern, not a backend task.
- **Task 14 (PATCH /api/orders/:id): NEEDED** — there is no partial-update route for an order. `POST /api/orders/save` exists but it's a full upsert of the `orders` header row and requires `id`, `order_number`, `customer_id` to be present. If the PWA wants to (for example) update just `status` or `delivery_date` it has two options: (a) GET the order, mutate, POST /save with the full header; or (b) add a real `PATCH /api/orders/:id`. Decide which based on PWA UX — Task 14 should be kept on the plan but its scope can be narrowed if the PWA can live with the GET-then-save dance.
- **Task 15 (GET /api/customer-prices): NOT NEEDED** — endpoint exists and matches the expected shape (filter by `customer_id`, returns array with `variant_id`, `display_name`, `effective_unit_price`, `discount_pct`, `currency`, etc.).

## Raw findings

### `POST /api/auth/login` (lines 482-531)

```js
app.post('/api/auth/login', async (req, res) => {
  // …rate limit…
  const { email, password } = req.body || {};
  // …timing-safe email + bcrypt password verify…
  const tokenMaxAge = 86400; // 1 day, matching signJwt default
  const token = signJwt({ sub: 'u1', email: ADMIN_EMAIL_SERVER, role: 'ADMIN', name: 'Admin' }, tokenMaxAge);
  res.setHeader('Set-Cookie', buildAuthCookie(token, tokenMaxAge));
  return res.json({
    token,
    user: { id: 'u1', email: ADMIN_EMAIL_SERVER, name: 'Panayiotis Pakkoutis', role: 'ADMIN' },
  });
});
```

`signJwt` (line 294) does support a custom `expiresInSeconds`, so adding rememberMe is a small change to the login handler only.

### `GET /api/orders/:id` (lines 3878-3967)

Returns:

```js
res.json({ order, lines, customer, sourceQuote, deliveryNotes, deliverySummary, amendments, proformaInvoices });
```

Where `lines` includes `variant_id`, `unit_price`, `discount_pct`, `vat_rate`, `qty`, `line_no`, plus joined `plant_common_name`, `plant_scientific_name`, `form`, `grade`, `pot_volume_l`, `height_min_cm`, `height_max_cm`, `girth_min_cm`, `girth_max_cm`, `variant_note`, and computed `description` + `size_summary`.

### `POST /api/orders/save` (lines 4003-4047)

```js
const order = req.body?.order;
if (!order?.id || !order?.order_number || !order?.customer_id) {
  return res.status(400).json({ error: 'order.id, order.order_number and order.customer_id are required' });
}
// INSERT ... ON CONFLICT (id) DO UPDATE on the orders table only.
// Fields written: id, order_number, customer_id, source_quote_id, status,
//                 delivery_date, delivery_address_id, notes, created_at, updated_at
return res.json({ ok: true });
```

Header-only upsert — `order_lines` are not touched by this route. If the PWA needs to persist lines it will hit a separate flow (likely `POST /api/orders/consolidate` at line 2257 or the amendments route at 4840 — out of scope for this audit).

### `GET /api/customer-prices` (lines 6978-7040)

Required query: `customer_id`. Joins `customer_variant_prices` → `variants` → `plants`. Response item shape (one example field set per row):

```js
{
  item_key: `${row.variant_id}`,
  variant_id, quote_id, quote_number,
  common_name, scientific_name, display_name,
  size_summary,
  effective_unit_price, base_unit_price, discount_pct, currency,
  quoted_at,
}
```

### CORS (lines 157-174)

Listed in full above.

### All `app.patch` / `app.put` routes in the file

```
2816: app.patch('/api/quote-supplier-inquiries/:id', …)
3758: app.patch('/api/quotes/:id/audit-line/:lineId', …)
4121: app.put('/api/delivery-notes/:id', …)
4919: app.put('/api/amendments/:id', …)
5256: app.put('/api/proformas/:id', …)
6944: app.put('/api/customer-contacts/:id', …)
7565: app.put('/api/customers/:id', …)
7876: app.put('/api/suppliers/:id', …)
9360: app.patch('/api/v2/supplier-products/:id', …)
9882: app.put('/api/plants/:id', …)
10054: app.put('/api/variants/:id', …)
```

Confirms no PATCH/PUT for `/api/orders/:id`.
