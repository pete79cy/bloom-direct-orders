# Bloom Direct Orders — Architecture & Engineering Reference

Detailed technical documentation for the **Bloom Direct Orders** PWA at
`orders.smartquotations.eu`. Companion to `README.md` (which covers
getting-started and deployment) — this document explains *how it works*
and *why it is built the way it is*.

> **Audience:** engineers picking up the codebase, the sole maintainer
> returning after a break, and anyone changing the bloom-crm side of the
> contract.

---

## 1. What this product is

A **mobile-first Progressive Web App** used by Pakkoutis Nurseries sales
reps to capture **direct customer orders** in the field — i.e. orders
that do *not* originate from a quote in the bloom-crm desktop tool.

**Primary user:** a sales rep in a customer's garden centre, on an
iPhone, in Greek, often on patchy 4G.

**Primary outcome:** a row in `orders` + N rows in `order_lines` in the
shared Postgres database, created atomically, picked up immediately by
the desktop bloom-crm tool that handles fulfilment.

**Secondary outcomes:**
- Generate PDF delivery notes (3 variants) at the warehouse counter.
- Browse upcoming deliveries on a month calendar.
- Patch order status as it moves through preparation → delivery → invoicing.

**Explicit non-goals:**
- Quote authoring (handled in bloom-crm desktop).
- Invoicing (handled in bloom-crm desktop).
- Inventory / stock management.
- Desktop / large-screen layouts (the app is hard-capped to ~480 px).

---

## 2. System context

```
┌─────────────────────┐     HTTPS + JWT      ┌────────────────────────┐
│  iPhone Safari PWA  │  ──────────────────► │  bloom-crm Express API │
│  orders.smartq…/    │                       │  smartquotations.eu/   │
│  (this repo)        │  ◄──────────────────  │  api/*                 │
└─────────────────────┘     JSON              └──────────┬─────────────┘
                                                         │ pg
                                                         ▼
                                              ┌────────────────────────┐
                                              │  Postgres              │
                                              │  (shared with desktop) │
                                              └────────────────────────┘
                                                         ▲
                                                         │ pg
                                              ┌────────────────────────┐
                                              │ bloom-crm desktop      │
                                              │ (separate React app)   │
                                              └────────────────────────┘
```

Both frontends (this PWA + bloom-crm desktop) **share one database** and
**one API**. There is no separate backend for orders — every change
required on the server side is a change to `bloom-crm/server/index.mjs`.

DNS: `orders.smartquotations.eu` → same VPS as `smartquotations.eu`.
nginx serves static files for this PWA from `/var/www/direct-orders/`
and proxies the API on `smartquotations.eu/api/*` to the Express
process.

---

## 3. Stack

| Layer | Choice | Why |
|---|---|---|
| Build | Vite 8 | Fast HMR, first-class PWA plugin. |
| UI | React 19 + TypeScript | Same as bloom-crm desktop — shared idioms. |
| Routing | react-router-dom v6 | SPA routing with `<RequireAuth>` guard. |
| Server state | TanStack Query v5 | Cache, refetch, mutation invalidation. |
| Styling | Tailwind + raw CSS vars | Tailwind for utility, CSS vars for brand palette. |
| Toasts | sonner | Top-centre, rich-colour. |
| Icons | lucide-react | Stroke-icon system. |
| PDFs | jsPDF + jspdf-autotable | Client-side, NotoSans for Greek glyphs. |
| Errors | Sentry (browser) | Optional via `VITE_SENTRY_DSN`. |
| PWA | vite-plugin-pwa (Workbox) | Service worker, manifest, install prompt. |
| Tests | Vitest + RTL + Playwright | Unit + component + iPhone-13-viewport E2E. |

No global state manager (Redux / Zustand). Server state lives in
TanStack Query; UI state lives in the page component that owns it.

---

## 4. Repository layout

```
bloom-direct-orders/
├── docs/
│   ├── backend-audit.md         ← snapshot of bloom-crm API at integration time
│   └── ARCHITECTURE.md          ← this file
├── e2e/                         ← Playwright specs (iPhone 13 viewport)
├── nginx/
│   └── orders.smartquotations.eu.conf
├── public/                      ← favicon, manifest icons, NotoSans TTFs
├── src/
│   ├── App.tsx                  ← <BrowserRouter> + <QueryClient>
│   ├── main.tsx                 ← <Sentry.ErrorBoundary> + render
│   ├── styles/globals.css       ← CSS variables + iOS primitives
│   ├── types/index.ts           ← shared TS types (one source of truth)
│   │
│   ├── lib/                     ← framework-free helpers
│   │   ├── api.ts               ← fetch wrapper + ApiError + 401 handler
│   │   ├── auth.ts              ← login / logout / token storage
│   │   ├── queries.ts           ← every useQuery / useMutation
│   │   ├── vat.ts               ← Cyprus VAT (5% / 19%) + breakdown
│   │   ├── format.ts            ← el-GR currency / date / iso helpers
│   │   ├── plant-display.ts     ← normalise messy variant data
│   │   ├── supplier-cost.ts     ← cheapest-cost map + margin %
│   │   ├── pdf-order.ts         ← order PDF (single mode)
│   │   └── pdf-delivery.ts      ← delivery PDFs (3 modes + combined)
│   │
│   ├── components/              ← reusable UI primitives + sheets
│   │   ├── RequireAuth.tsx      ← redirects to /login if no token
│   │   ├── BottomNav.tsx        ← persistent bottom tab bar
│   │   ├── MobileStepper.tsx    ← 4-step header for the wizard
│   │   ├── MobileSheet.tsx      ← half-height bottom sheet (body-lock)
│   │   ├── FullScreenSheet.tsx  ← full-viewport modal (no body-lock)
│   │   ├── AddLineSheet.tsx     ← configure-as-add line modal
│   │   ├── NewCustomerSheet.tsx ← in-wizard customer creation
│   │   ├── VariantCard.tsx      ← plant search result row
│   │   ├── PlantTile.tsx        ← placeholder tile w/ SKU label
│   │   ├── VatPicker.tsx        ← 5% / 19% dropdown
│   │   ├── QtyStepper.tsx       ← -/+ stepper with typeable middle
│   │   ├── PriceInput.tsx       ← € prefix, decimal keypad
│   │   ├── StatusBadge.tsx      ← pill badge for OrderStatus
│   │   ├── StatusTimeline.tsx   ← horizontal status progression
│   │   ├── PdfActionSheet.tsx   ← multi-select PDF mode picker
│   │   ├── PwaUpdateToast.tsx   ← prompts user to reload on SW update
│   │   └── LeafMark.tsx         ← brand mark
│   │
│   └── pages/
│       ├── Login.tsx
│       ├── Home.tsx
│       ├── OrdersList.tsx
│       ├── OrderDetail.tsx
│       ├── Calendar.tsx
│       └── NewOrderWizard.tsx   ← the central flow, 4 steps
│
├── vite.config.ts               ← Vite + VitePWA config
├── tailwind.config.ts
└── package.json
```

**Naming conventions:**
- Pages are PascalCase, one per route.
- Components are PascalCase and live in `src/components/` if reused by
  ≥2 pages, otherwise inline in the page file.
- Library modules are kebab-case in `src/lib/`, framework-free where
  possible (so they can be tested without RTL).
- Tests live next to the unit they cover: `vat.test.ts`, `vat.ts`.

---

## 5. Routes & navigation

| Path | Component | Auth | Purpose |
|---|---|---|---|
| `/login` | `Login` | public | Email + password + remember-me. |
| `/` | `Home` | ✅ | Greeting, stats card, new-order CTA, recent orders. |
| `/orders` | `OrdersList` | ✅ | Filterable + searchable list. |
| `/orders/new` | `NewOrderWizard` | ✅ | 4-step wizard (Πελάτης → Στοιχεία → Γραμμές → Έλεγχος). |
| `/orders/:id` | `OrderDetail` | ✅ | Lines, totals, status transitions. |
| `/calendar` | `Calendar` | ✅ | Month grid of upcoming deliveries. |

All authed routes are wrapped by `<RequireAuth>`, which:
1. Redirects to `/login` if `getToken() === null`.
2. Registers a global 401 handler via `setUnauthorizedHandler` so any
   API call that returns 401 will `logout()` and redirect.

A persistent `<BottomNav>` shows Home / Orders / Calendar tabs on every
authed page. The wizard hides it during the flow.

---

## 6. Data model (client view)

Types live in `src/types/index.ts` and mirror the columns this app
actually reads from the bloom-crm schema. They are not generated — they
are hand-curated to keep the client surface small.

### Core entities

```ts
type OrderStatus =
  | 'PENDING' | 'PREPARING' | 'READY' | 'PARTIALLY_DELIVERED'
  | 'DELIVERED' | 'INVOICED' | 'CANCELLED';

interface Order {
  id: string;                  // 'o-<epoch>' (string, NOT uuid)
  order_number: string;        // 'ORD-YYYY-NNN' (server-generated)
  customer_id: string;
  status: OrderStatus;
  delivery_date: string | null;
  delivery_address_id: string | null;
  notes: string | null;
  source_quote_id: string | null;  // null for direct orders
  created_at: string;
  updated_at: string;
}

interface OrderLine {
  id: string;
  order_id: string;
  line_no: number;             // 1-based, NOT 0-based
  variant_id: string;
  description: string | null;  // NOTE: 'description', NOT 'notes'
  qty: number;
  unit_price: number;          // NOTE: 'unit_price', NOT 'unit_sell_price'
  discount_pct: number | null;
  vat_rate: number | null;     // 5 or 19; null means "use default"
}
```

### Schema gotchas (learned the hard way)

These mismatches caused real bugs during integration — keep them in mind
when extending the API contract:

| What you'd expect | What it actually is | Source |
|---|---|---|
| `id: uuid` | `id: 'o-<timestamp>'` strings | `lib/queries.ts`, `direct-orders` route |
| `unit_sell_price` | `unit_price` | `order_lines` table |
| `notes` (on a line) | `description` | `order_lines` table |
| `sort_order` | `line_no` | `order_lines` table |
| `reference`, `issue_date` columns | do not exist | `orders` table |
| Cents (int) for money | floats (`unit_price decimal`) | `order_lines.unit_price` |

### Enrichments

- `OrderDetail` (from `GET /api/orders/:id`) embeds the customer,
  lines joined with plant name + size summary, source quote, delivery
  notes, amendments, and proforma invoices.
- `CustomerPrice` (from `GET /api/customer-prices?customer_id=…`) is
  keyed only by customer; the client filters by `variant_id`.
- `OrderLineEnriched` is `OrderLine` + plant fields, used by the wizard
  review step and the order detail page.

---

## 7. API surface

Every server call goes through `apiFetch<T>()` in `src/lib/api.ts`,
which:
- Reads the JWT from `localStorage` (or `sessionStorage` if not "remember me").
- Sets `Authorization: Bearer <token>`.
- Sets `Content-Type: application/json` if there's a body.
- Passes `cache: 'no-store'` to **every** request (see §10 — caching).
- On 401, calls the registered unauthorized handler (logout + redirect).
- Wraps non-2xx responses in `ApiError` with `{ status, message, payload }`.

### Endpoints this PWA depends on

Read these as a **contract** — the bloom-crm side must keep them
shaped this way.

| Method | Path | Used by | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | `auth.login()` | Body: `{ email, password, rememberMe }`. Returns `{ token, user }`. JWT expiry is 1 day or 60 days based on `rememberMe`. |
| GET | `/api/orders` | `useOrders` | List for Home + OrdersList + Calendar. |
| GET | `/api/orders/:id` | `useOrder` | Returns `OrderDetail` (header + enriched lines + customer + …). |
| POST | `/api/direct-orders` | `useCreateDirectOrder` | Atomic create. Body: `{ order: {…}, lines: [{…}] }`. Server generates `id` + `order_number`. |
| PATCH | `/api/orders/:id` | `usePatchOrder` | Status / notes / delivery_date updates. |
| GET | `/api/orders/:id/photos` | PDF: visual picking list | Returns plant photos for the delivery PDF. |
| GET | `/api/customers` | `useCustomers` | Full list (≤ a few hundred). |
| POST | `/api/customers` | `useCreateCustomer` | In-wizard new customer. |
| GET | `/api/plants` | `usePlants` | Full catalog (cached 10 min). |
| GET | `/api/variants` | `useVariants` | Full catalog (cached 10 min). |
| GET | `/api/customer-prices?customer_id=X` | `useCustomerPrices` | Customer-specific prices; filtered client-side by variant. |
| GET | `/api/suppliers` | `useSuppliers` | For supplier-name display on variant cards. |
| GET | `/api/supplier-products` | `useSupplierProducts` | Links variant ↔ supplier. |
| GET | `/api/supplier-prices` | `useSupplierPrices` | Cheapest-cost map for margin %. |

### Backend prerequisites in bloom-crm

The bloom-crm Express server must include:

1. **CORS allowlist** containing both:
   - `https://orders.smartquotations.eu` (production)
   - `http://localhost:5174` (dev — note the port)
2. **`rememberMe` support** in `POST /api/auth/login`.
3. **`PATCH /api/orders/:id`** accepting `{ status?, notes?, delivery_date? }`.
4. **`POST /api/direct-orders`** as described above (atomic insert with
   server-generated id + `ORD-YYYY-NNN` number via `nextOrderNumber`).
5. **`GET /api/orders/:id/photos`** (mirror of the existing quotes/photos
   endpoint) for the visual picking-list PDF.

See `docs/backend-audit.md` for the audit that drove these decisions.

---

## 8. Authentication & session

### Why JWT (not cookies)

The bloom-crm desktop tool uses an HTTP-only session cookie set on
`smartquotations.eu`. That cookie has `SameSite=Lax`, so it is **not**
sent from `orders.smartquotations.eu` (a different subdomain making a
cross-site request). The supported auth path here is therefore:

1. `POST /api/auth/login` returns a JWT in the JSON body.
2. The PWA stores it in `localStorage` (or `sessionStorage`).
3. Every subsequent request sets `Authorization: Bearer <token>`.

### Remember-me storage

- `rememberMe: true` → `localStorage` (survives across sessions, expires when
  the JWT expires — 60 days server-side).
- `rememberMe: false` → `sessionStorage` (cleared when the tab closes,
  JWT lives ~1 day server-side).

`auth.login()` writes to one storage and clears the other, so flipping
the toggle never leaves a stale token behind.

### Logout

`logout()` clears both storages. `RequireAuth` registers an unauthorized
handler so a 401 anywhere (token expired, revoked, etc.) automatically
logs the user out and redirects to `/login`.

---

## 9. State management

### Server state — TanStack Query

All server data flows through hooks in `src/lib/queries.ts`. The
`QueryClient` is configured globally with:

```ts
{ staleTime: 30_000, retry: 1,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true }
```

`refetchOnWindowFocus` is **critical**. The most common workflow is: a
sales rep is mid-wizard, the desktop team creates a new plant in
bloom-crm, the rep tabs back to the PWA. Without focus refetch, the
catalog stays stuck on whatever was cached when the wizard opened.

Per-query `staleTime` overrides:
- `customers`, `plants`, `variants`, `customer-prices`, suppliers/products/prices: **10 min** (they change rarely).
- Everything else: 30 s (the global default).

### Mutations

Each mutation invalidates the queries it affects:
- `useCreateDirectOrder` → invalidates `['orders']`.
- `useCreateCustomer` → optimistically prepends + invalidates `['customers']`.
- `usePatchOrder` → invalidates `['orders']` + `['order', id]`.

### UI state

Lives in the page that owns it. The wizard owns the entire draft order
(`customer`, `deliveryDate`, `notes`, `lines[]`) in component state —
there is no Redux store for "the draft order".

This is deliberate: an order is created in a single flow on a single
device. There is no need to persist it across reloads (and persisting
would risk shipping stale customer prices that re-fetch on re-open).

---

## 10. Caching strategy (three layers, each with a purpose)

| Layer | Tool | What it caches | Lifetime |
|---|---|---|---|
| Browser HTTP cache | (bypassed) | nothing — we set `cache: 'no-store'` | n/a |
| Client-side cache | TanStack Query | every API response by query key | 30 s default / 10 min for slow-changing data |
| Service Worker | Workbox precache | static assets (`/assets/*.js`, `/assets/*.css`, fonts) | until SW updates |

**Why HTTP cache is bypassed:** the bloom-crm API does not consistently
set `Cache-Control: no-store` on JSON endpoints. Browsers apply
heuristic freshness when no header is present, so a fresh
`refetchOnWindowFocus` call from TanStack Query would still hit a stale
browser cache. Forcing `cache: 'no-store'` on every API call closes
this hole without server changes.

**SW runtime caching for `/api/*`** is `NetworkOnly` — we never want the
SW to serve a stale POST/PATCH response.

**SW `skipWaiting` + `clientsClaim`** are both enabled. Without them
the new SW would wait for every tab to close before activating — iOS
Safari standalone PWAs are sticky, and updates would never reach users.
The trade-off is that a new SW can take over mid-session; the
`PwaUpdateToast` component prompts the user to reload before that
becomes a problem.

---

## 11. UI patterns

### Mobile primitive: two kinds of sheet

| | `MobileSheet` | `FullScreenSheet` |
|---|---|---|
| Coverage | half-height (≈ 90 vh) | full viewport |
| zIndex | 1200 | 1300 |
| Body lock | yes (`overflow: hidden`) | **no** |
| Use case | quick action, picker, status change | anything with keyboard (search, forms) |

**Why no body-lock on `FullScreenSheet`:** the full-screen variant has
opaque background and pointer-event swallowing, so body scroll behind
it can't be seen or triggered. The body-lock was a source of state
leaks: `onClose` is an inline arrow in callers, so the lock effect
re-ran every parent render; under certain interleavings the captured
"previous overflow" could itself be `'hidden'`, and cleanup would
restore body to `'hidden'` permanently. See commit `0301d43` for the
full root-cause analysis. This was the v4 fix for the Step 3 scroll
freeze.

`NewOrderWizard` also clears `document.body.style.overflow` on mount /
unmount as defence-in-depth.

### Keyboard / viewport

iOS Safari's on-screen keyboard pushes the layout in confusing ways.
Anywhere we need an input that the user will type into:

- **Plant search** uses `FullScreenSheet` — the keyboard sits naturally
  under the modal because the modal is full-viewport.
- **Numeric inputs** (qty, price) use `inputMode="decimal"` /
  `inputMode="numeric"` to get the numeric keypad instead of the full
  alphabetic keyboard.
- **`pt-safe`** utility class respects iOS safe-area inset on every
  page header.

### Visual language

CSS variables in `src/styles/globals.css` define the brand palette
(`--sage-700`, `--cream-100`, `--ink-900`, `--ink-500`, etc.). Tailwind
handles spacing / flex / sizing; raw CSS handles colour + shadow.

Three typefaces:
- **Fraunces** (italic) — display headings ("Καλώς ήρθες, *Παναγιώτη*")
- **JetBrains Mono** — folio numbers, counters, monetary metadata
- System sans — body copy

---

## 12. Plant-data normalisation (`plant-display.ts`)

bloom-crm's variant data is messy. The helpers in this module are the
single defence:

- `prettyScientificName` — converts machine codes like
  `"LANTANA-MONTEVIDENSIS"` into `"Lantana montevidensis"`, leaves
  correctly-cased input alone.
- `cleanSizeSummary` — strips `"null"` tokens that leak from server
  template literals (`"PnullL · H2-5"` → `"H2-5"`).
- `sizeDetailsString` — builds a structured size from columns
  (`pot_volume_l`, `height_min_cm`, etc.), skipping pieces where
  min/max are both 1 (bloom-crm's "unknown" sentinel).
- `pickPlantName` — two-line name resolution. Greek `common_name` is
  always primary if it exists; scientific Latin is the secondary line.
  This is the user-facing decision that drove the whole "Greek first"
  redesign.

---

## 13. Supplier cost & margin (`supplier-cost.ts`)

`buildCostMap(products, prices)` returns `Map<variant_id, cost>` where
`cost` is the cheapest currently-valid supplier price (i.e.
`valid_to === null` or in the future). `marginPct(sell, cost)` returns
the margin as a percentage.

These are surfaced in the wizard line cards: the user sees the cost
next to the sell-price input, plus a margin % chip, so they can judge
profitability while pricing the line.

---

## 14. VAT (`vat.ts`)

Cyprus has two rates:
- **5 %** (reduced — edible plants, herbs)
- **19 %** (standard — ornamentals; **default for new lines**)

`vatBreakdown(lines)` groups lines by rate and returns one
`{ rate, net, amount }` row per rate present in the order, sorted 5 %
before 19 %. If the whole order uses one rate, only one row is
returned — keeping the totals block visually clean.

This single function is used by:
- Wizard Step 4 review block
- `OrderDetail` totals block
- All four PDF generators (`pdf-order.ts` + 3 modes in `pdf-delivery.ts`)

If you need a third rate (0 %, export), add it to `VatRate` and the
existing call sites will pick it up — no other changes needed.

---

## 15. PDF generation

Client-side, using jsPDF + jspdf-autotable.

### Why client-side

- No round-trip; PDF is generated in <500 ms even for 50-line orders.
- No server cost.
- The data needed is already in memory (the user is on the order detail
  page).

### Greek glyph support

jsPDF's bundled fonts have no Greek glyphs. `public/fonts/` ships
`NotoSans-Regular.ttf` + `NotoSans-Bold.ttf`; the PDF generators
register them via `doc.addFont(…)` before any draw call. Without this,
Greek text renders as boxes.

### Modes

| Module | Purpose | Triggered from |
|---|---|---|
| `pdf-order.ts` | Customer-facing order PDF (sell prices, totals, VAT) | `OrderDetail` "PDF παραγγελίας" |
| `pdf-delivery.ts` (delivery note) | Warehouse-internal delivery note | `OrderDetail` `PdfActionSheet` |
| `pdf-delivery.ts` (priced) | Delivery note with prices | same |
| `pdf-delivery.ts` (visual) | Picking list with plant photos | same (needs `/api/orders/:id/photos`) |
| `pdf-delivery.ts` (combined) | All three concatenated into one PDF | same |

The `PdfActionSheet` is a multi-select; if the user picks ≥ 2 modes, a
combined PDF is produced in a single download.

---

## 16. PWA / Service Worker

`vite-plugin-pwa` generates `sw.js` at build time via Workbox.

```ts
VitePWA({
  registerType: 'prompt',
  manifest: { name: 'Bloom Orders', short_name: 'Orders', … },
  workbox: {
    skipWaiting: true,     // ⬅ activate new SW immediately
    clientsClaim: true,    // ⬅ take over already-open pages
    navigateFallback: '/index.html',
    runtimeCaching: [
      { urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
        handler: 'NetworkOnly' },
    ],
  },
})
```

- `registerType: 'prompt'` means the SW is registered automatically, but
  the user is **asked** before activating a new version. The prompt is
  delivered by `PwaUpdateToast`, which uses sonner to show a "νέα
  έκδοση" toast with a Refresh button.
- `skipWaiting` + `clientsClaim` were the fix for "iOS PWA never sees
  bug fixes" — without them, updates are stuck behind closed tabs.

### Updating icons

`public/manifest-icons/` ships placeholder PNGs. Replace before any
production launch with real Pakkoutis assets — see README §Icons.

---

## 17. Build & deploy pipeline

### Build

```
npm run build
  ├─ tsc --noEmit         (lint: TypeScript with no emit)
  └─ vite build           (outputs to dist/)
```

`dist/` contains:
- `index.html` (hashed asset references)
- `assets/index-<hash>.js`, `assets/index-<hash>.css`, code-split chunks
- `sw.js`, `workbox-<hash>.js`
- `manifest.webmanifest`
- copied `public/` assets (icons, fonts)

### Continuous deploy

`.github/workflows/deploy.yml` runs on every push to `main`:

1. Checkout + Node 20 + `npm ci`
2. `npm run build` with `VITE_API_BASE_URL=https://smartquotations.eu`
   and `VITE_SENTRY_DSN` from secrets.
3. `rsync -avzr --delete dist/ → SSH_USER@SSH_HOST:/var/www/direct-orders/`

Required GitHub secrets: `SSH_HOST`, `SSH_USER`, `SSH_KEY`, `SENTRY_DSN`.

> **Known cosmetic issue:** the rsync action sometimes reports
> `link_stat "/github/workspace/***@" failed: No such file or directory`
> (a spurious "extra source path" parse) and marks the job as failed,
> *despite successfully uploading every file*. Verify the live site
> serves the new bundle hash before treating a red Actions run as a
> deploy failure.

### nginx

`nginx/orders.smartquotations.eu.conf`:
- 80 → 301 https
- 443 → TLS via Let's Encrypt
- `root /var/www/direct-orders;`
- `/assets/` → immutable 1-year cache (safe — assets are hashed)
- `/` → SPA fallback (`try_files $uri /index.html`)
- gzip for text MIME types

---

## 18. Testing

| Layer | Tool | Files | Run |
|---|---|---|---|
| Unit (pure functions) | Vitest | `lib/*.test.ts` | `npm test` |
| Component | Vitest + RTL + jsdom | `components/*.test.tsx` | `npm test` |
| E2E | Playwright (iPhone 13 viewport) | `e2e/*.spec.ts` | `npm run e2e` |

Total: 63 unit/component tests, 8 test files.

E2E specs require:
- bloom-crm API running on `VITE_API_BASE_URL`
- `TEST_EMAIL` and `TEST_PASSWORD` env vars matching a real user.

`tsc --noEmit` (aliased to `npm run lint`) is the type-check gate. The
codebase has no ESLint dependency on rules with auto-fix — TS strict
mode does the heavy lifting.

---

## 19. Known gotchas & operational notes

### Service Worker can hide your fix

If the user is on an old SW, they see old code regardless of what's
deployed. Symptoms: a bug you thought you fixed is still reported. To
disambiguate during debugging, temporarily inject a visible build
marker (e.g. `v4` in the header) so the user can confirm which build
they have. Remove the marker once the fix is verified. Permanent
disambiguation: rely on `PwaUpdateToast` + `skipWaiting`.

### Body-lock leaks ⇒ "the page doesn't scroll"

If you add a new sheet that uses
`document.body.style.overflow = 'hidden'`, **make sure cleanup runs
exactly once** and **never captures `'hidden'` as the previous value**.
The safest pattern is the one in `FullScreenSheet`: don't body-lock at
all if the modal is full-viewport. If you must body-lock a half-height
sheet, do it imperatively in the open/close handlers, not in an
effect whose deps include props that change every render.

### Stale catalog after creating in desktop

If a sales rep creates a new plant in bloom-crm desktop mid-flow, the
PWA needs to refetch. The three lines of defence:
1. `refetchOnWindowFocus: true` (global QueryClient).
2. `cache: 'no-store'` on `apiFetch` (bypass browser cache).
3. `invalidateQueries(['plants', 'variants'])` in the plant-search
   sheet's `useEffect(open ? […] : null)`.

### Schema column names

If you add a field to `OrderLine`, double-check the column name in the
DB. The team has been bitten by `unit_sell_price` vs `unit_price`,
`notes` vs `description`, `sort_order` vs `line_no` more than once.

### Date handling

All date strings on the wire are ISO date (YYYY-MM-DD), no time. Use
`isoToday()` / `addDays()` from `lib/format.ts` instead of `new Date()`
where you can — they avoid timezone drift bugs.

### Greek strings everywhere

UI copy is Greek. Search the codebase for `'el-GR'` to see where locale
formatters live. Sentry's fallback error message is also in Greek.

---

## 20. Glossary

| Term | Meaning |
|---|---|
| **Direct order** | Order placed directly by a customer, not arising from a quote. |
| **Variant** | A specific sellable form of a plant (e.g. Lantana montevidensis in a 5 L pot). |
| **bloom-crm** | The desktop tool / API server for the same business. |
| **PnnL** | Pot size in litres. `P5L` = 5-litre pot. |
| **H20-50 CM** | Height range, 20–50 cm. |
| **G8-10 CM** | Girth range, 8–10 cm (trees). |
| **Παραγγελία** | "Order". |
| **Πελάτης** | "Customer". |
| **Δελτίο αποστολής** | "Delivery note". |
| **ΦΠΑ** | VAT. |
| **ORD-YYYY-NNN** | Order number format. `nextOrderNumber` in bloom-crm. |

---

## 21. Pointers for common changes

| I want to… | Touch… |
|---|---|
| Add a new VAT rate | `lib/vat.ts` (`VatRate` union + `VAT_RATES` + `VAT_LABEL`) |
| Add a column to the line cards | `pages/NewOrderWizard.tsx` (Step 3) + `types/index.ts` |
| Add a new PDF mode | `lib/pdf-delivery.ts` + `components/PdfActionSheet.tsx` |
| Add a new endpoint | `lib/queries.ts` (new `useQuery` / `useMutation`) + `types/index.ts` |
| Change order-status colours | `components/StatusBadge.tsx` + CSS vars in `styles/globals.css` |
| Add a new bottom-nav tab | `components/BottomNav.tsx` + new page + route in `App.tsx` |
| Force a SW refresh | bump anything in `vite.config.ts` PWA manifest → new SW hash → toast appears |

---

*Last updated: 2026-05-28. Companion to `README.md`. Source of truth
for the API contract: `docs/backend-audit.md` and
`bloom-crm/server/index.mjs`.*
