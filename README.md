# Bloom Direct Orders

Mobile-first PWA for capturing direct customer orders at Pakkoutis Nurseries. Backed by the existing bloom-crm Postgres tables via the existing API.

Production: https://orders.smartquotations.eu

## Stack

- Vite + React + TypeScript
- Tailwind CSS + iOS-style primitives ported from bloom-crm
- React Router · TanStack Query · sonner
- vite-plugin-pwa (Workbox) · Sentry
- Vitest · React Testing Library · Playwright

## Quick start (local)

```sh
git clone <this-repo>
cd bloom-direct-orders
npm install
cp .env.example .env.local        # set VITE_API_BASE_URL (and optionally VITE_SENTRY_DSN)
npm run dev                       # http://localhost:5174
```

The PWA expects a bloom-crm API running on `VITE_API_BASE_URL`. For local development this is typically `http://localhost:4000` (start the bloom-crm side with `npm run start:api`).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server on port 5174 |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview built bundle locally |
| `npm run test` | Vitest watch mode |
| `npm run test:run` | Vitest single run |
| `npm run lint` | TypeScript check |
| `npm run e2e` | Playwright E2E (iPhone 13 viewport, requires running bloom-crm API + `TEST_EMAIL` / `TEST_PASSWORD` env vars) |

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | yes | bloom-crm API base URL |
| `VITE_SENTRY_DSN` | optional | Sentry DSN (omit to disable) |

## Backend prerequisites in bloom-crm

This PWA assumes the following changes have been applied to `bloom-crm/server/index.mjs` (separate commits in the bloom-crm repo, not yet pushed to remote):

- CORS allowlist includes `https://orders.smartquotations.eu` and `http://localhost:5174`.
- `POST /api/auth/login` accepts a `rememberMe` flag in the body; JWT expiry varies (1 day default, 60 days when `rememberMe: true`).
- `PATCH /api/orders/:id` exists and accepts `{ status?, notes?, delivery_date? }`.
- `POST /api/direct-orders` exists and accepts `{ order: { customer_id, delivery_date?, notes?, status? }, lines: [{ variant_id, qty, unit_price, description?, discount_pct?, vat_rate?, line_no? }] }`, generating `id` and `order_number` server-side and inserting `orders` + `order_lines` atomically.

See `docs/backend-audit.md` for the audit that drove these decisions.

## Deployment

Static files are served by nginx on the same VPS as bloom-crm.

### One-time setup on the VPS

```sh
sudo mkdir -p /var/www/direct-orders
sudo chown -R deploy:deploy /var/www/direct-orders
sudo cp nginx/orders.smartquotations.eu.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/orders.smartquotations.eu.conf /etc/nginx/sites-enabled/
sudo certbot --nginx -d orders.smartquotations.eu
sudo nginx -t && sudo systemctl reload nginx
```

DNS: add an A record `orders.smartquotations.eu` → VPS IP.

### Automated deploys

Push to `main` triggers `.github/workflows/deploy.yml` which builds and rsyncs `dist/` to `/var/www/direct-orders/` on the VPS.

Required GitHub secrets: `SSH_HOST`, `SSH_USER`, `SSH_KEY`, `SENTRY_DSN`.

## Icons

`public/manifest-icons/` currently contains 1×1 green placeholder PNGs. Before production launch, replace them with real Pakkoutis logo assets:
- `icon-192.png` (192×192)
- `icon-512.png` (512×512)
- `icon-maskable.png` (512×512, with safe zone)
- `apple-touch-icon.png` (180×180, in `public/`)

Generate them with [pwa-asset-generator](https://github.com/elegantapp/pwa-asset-generator) from a single square source logo.

## Architecture

Mobile-only PWA, 480px-max layout. Talks to bloom-crm Express API at `VITE_API_BASE_URL`. JWT auth via `Authorization: Bearer <token>` (cookie auth from a different subdomain is blocked by `SameSite=Lax` on the bloom-crm cookie; the body token is the supported path).

State management: TanStack Query for server state, local component state for UI. No global client store needed.

Pages:
- `/login` — email/password + "Να με θυμάσαι"
- `/` — Home with new-order CTA + recent orders
- `/orders` — list with status filter + search
- `/orders/new` — 4-step wizard (customer, details, lines, review)
- `/orders/:id` — detail + status transitions
- `/calendar` — month-grid view of deliveries
