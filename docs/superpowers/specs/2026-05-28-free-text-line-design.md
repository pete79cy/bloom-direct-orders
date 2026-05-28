# Free-Text Line for Uncatalogued Plants — Design

> **Status:** Approved design, not yet implemented.
> **Author:** Sole maintainer (brainstormed with AI on 2026-05-28).
> **Next step:** `writing-plans` skill → implementation plan.

---

## 1. Summary

When a customer phones in an order for a plant **not yet in our catalogue**,
the sales rep is currently stuck — search returns no result, no fallback
exists, the rep cannot complete the order. This spec introduces a
"free-text line" path: the rep types a name + size + qty + price, the
PWA captures the order normally, and the back-end auto-creates a
`plants` + `variants` row with `status='draft'` that an admin reviews
and promotes (or merges / archives) later in the desktop bloom-crm tool.

**Key properties:**
- Zero blocking — phone order completes in the same flow.
- One submit transaction — draft creation and order placement are atomic.
- Stable IDs — promotion never rewrites `variant_id`, so existing
  `order_lines` rows keep working without migration.
- Searchable in the PWA — drafts surface in plant search with a clear
  `ΠΡΟΧΕΙΡΟ` badge so reps can reuse them within a session and don't
  duplicate.
- Out-of-band review — drafts are reviewed by an admin in desktop
  bloom-crm; Phase 1 + 2 (server + PWA) ship without any desktop UI,
  and the admin uses SQL until Phase 3 builds the inbox UI.

---

## 2. Motivation

From the senior UX audit:

> «Δεν υπάρχει κανένας μηχανισμός για να το χειριστείς αμέσως.»

A B2B plant business takes orders by phone several times a day. The
catalogue does not cover every species or variety customers ask for —
particularly fashionable cultivars, rare ornamentals, and "anything
that's flowering right now". Today the rep either:

1. Stops the call, finds an admin to add the plant to the catalogue, then
   resumes (real-world: never happens — customer hangs up).
2. Writes the order on paper, processes it later (real-world: lost
   half the time).
3. Adds a *close enough* plant from the catalogue (real-world:
   wrong invoice, customer confused at delivery).

All three are failure modes. The free-text line fixes this by letting
the rep capture **what the customer actually said** while still keeping
the data clean enough to invoice and fulfil.

---

## 3. User stories

**As a sales rep on a phone call**, when the customer says
*"τέσσερις φίκους μπεντζαμίν 80 πόντους"* and the catalogue search comes
up empty, I want to type the plant name + size + price + qty in 10
seconds and continue with the next line, so the call doesn't stall.

**As a sales rep on a follow-up call**, when the same customer (or a
different one) asks for the same uncatalogued plant later in the day,
I want the previous free-text entry to appear in search results so I
don't re-type or duplicate it.

**As the catalogue admin**, when I open bloom-crm desktop, I want to
see a list of pending drafts created by reps, review each one (correct
the name, add scientific binomial, structure the size into pot / height
/ girth columns), and promote it to a real catalogue row that future
reps see as a normal entry.

**As the admin reviewing a draft**, when I realise the draft is a
duplicate of an existing plant, I want to "merge" it — move any
`order_lines` references onto the canonical `variant_id` and archive
the draft — so the customer's invoice points to the right product.

**As an operations user**, when an order containing a draft line is
fulfilled, I want the delivery note / picking list to show the draft's
free-text name and size as-typed, so the warehouse knows what to pick.

---

## 4. Decisions made during brainstorming

| Decision | Choice | Alternatives rejected |
|---|---|---|
| **Lifecycle** | Auto-create plant + variant rows with `status='draft'` on order submit | (a) keep as free-text forever with sentinel `variant_id` — rejected: blocks future invoicing / catalogue analysis. (b) require rep to fill full plant form inline — rejected: kills phone-order speed. |
| **PWA input fields** | Two text fields (Όνομα, Μέγεθος) + standard qty / price / VAT | (a) one text field — rejected: too lossy for admin review. (c) full form — rejected: kills phone-order speed. |
| **Storage shape** | `status TEXT NOT NULL DEFAULT 'active'` on `plants` and `variants` | (a) `is_draft BOOLEAN` — rejected: less future-proof, no path for `archived`. (b) separate `plants_draft` / `variants_draft` tables — rejected: complicates `order_lines.variant_id` semantics. |
| **Visibility in PWA search** | Drafts visible to all reps with `ΠΡΟΧΕΙΡΟ` badge | (a) private to creator — rejected: defeats reuse-within-session. (b) hidden from search — rejected: causes duplicate drafts. |
| **Auto-deduplication** | None — admin merges manually | Automatic string-distance dedup rejected: typo / capitalisation / Greek-vs-Latin risk is too high. |
| **Atomicity** | Single transaction in `POST /api/direct-orders` creates draft rows + order rows together | Two-step (pre-create then submit) rejected: orphan drafts when rep abandons. |
| **Phased rollout** | Phase 1 (server) + Phase 2 (PWA) ship together. Phase 3 (desktop drafts inbox UI) is a future sprint; admins use SQL meanwhile. | Single big-bang rollout rejected: desktop UI is large enough to be its own work and would block phone-order workflow improvements. |

---

## 5. Data model

### 5.1 Schema migration

Apply on bloom-crm server boot (additive — safe for existing data):

```sql
ALTER TABLE plants
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE variants
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS idx_plants_status
  ON plants(status) WHERE status <> 'active';

CREATE INDEX IF NOT EXISTS idx_variants_status
  ON variants(status) WHERE status <> 'active';
```

Status values: `'active' | 'draft' | 'archived'`. All existing rows
default to `'active'`, so the catalogue's current behaviour is
unchanged.

### 5.2 Field mapping at draft creation

User types `name = "Ficus benjamina"`, `size = "P 5L · H 80-100"`,
`qty = 4`, `unit_price = 8.50`, `vat_rate = 19`. Server creates:

```
plants
  id              = `p-${Date.now()}-${i}`
  common_name     = "Ficus benjamina"       (verbatim from input)
  scientific_name = ''                       (admin fills later)
  status          = 'draft'

variants
  id                 = `v-${Date.now()}-${i}`
  plant_id           = (link to the plants.id above)
  variant_code       = `DRAFT-${plants.id}`
  size_summary       = "P 5L · H 80-100"     (verbatim from input)
  default_sell_price = 8.50                  (from line input)
  pot_volume_l       = NULL                  (admin parses later)
  height_min_cm      = NULL
  height_max_cm      = NULL
  girth_min_cm       = NULL
  girth_max_cm       = NULL
  status             = 'draft'

order_lines
  id          = `ol-${orderId}-${i + 1}`     (existing convention)
  variant_id  = (the new variants.id)        (real ID, NOT a sentinel)
  description = (per-line user note if any)
  qty         = 4
  unit_price  = 8.50
  vat_rate    = 19
```

The `i` counter is the line index in the submit payload — ensures
unique IDs when a single order creates multiple drafts.

---

## 6. UX flow (PWA)

### 6.1 Trigger surface — plant search results

The free-text entry surface is the existing `FullScreenSheet` plant
search in wizard Step 3. A new "Νέο φυτό εκτός καταλόγου" link appears
at the **bottom of the result list** when:

- `query.trim().length >= 2`, AND
- the filtered result list has **fewer than 5** entries.

(Hiding the link when many matches exist prevents misfires when the
rep is browsing rather than entering a missing plant.)

```
┌──────────────────────────────────────────┐
│  🔍 "ficus benjamina"                     │
├──────────────────────────────────────────┤
│  (no matches)                             │
├──────────────────────────────────────────┤
│  + Νέο φυτό εκτός καταλόγου              │
│    "ficus benjamina"             →        │
│    Το όνομα μπαίνει αυτόματα.            │
└──────────────────────────────────────────┘
```

Tap → opens a new `FreeTextLineSheet` component (lives next to
`AddLineSheet`).

### 6.2 The FreeTextLineSheet

A focused variant of `AddLineSheet`. Same layout language, fewer
fields (no cost reference, no customer-price chip, no margin %).

Fields:

| Field | Validation | Pre-fill |
|---|---|---|
| Όνομα φυτού | `trim().length >= 2` (commit disabled otherwise) | the search query |
| Μέγεθος / γλάστρα | optional, free text | empty |
| Τιμή πώλησης | `>= 0` | empty (0) |
| Ποσότητα | `> 0` | 1 |
| Σημείωση | optional, free text | empty |
| ΦΠΑ | `5 \| 19` | 19 (default) |

Live subtotal preview at the bottom (same component as
`AddLineSheet`). Commit button labelled `+ Προσθήκη στην παραγγελία`.

A header eyebrow `⚠ Θα μπει ως πρόχειρο` makes the draft nature
explicit before the rep commits.

### 6.3 Cart row rendering

In wizard Step 3, the draft line uses a variant of `LineRow`:

- `PlantTile` shows label `DRFT`.
- Eyebrow line `⚠ Πρόχειρο — εκτός καταλόγου` in `var(--clay)`.
- No supplier line.
- No cost column / margin %.
- Sell price input remains editable.
- Description note pill (the 💬 chip from task #40) renders normally if
  set.
- Trash button removes the draft from the draft cart (no server call
  yet — only a local state mutation).

### 6.4 Search reuse during session

After the rep commits a draft line, the PWA invalidates the
`['plants']` and `['variants']` TanStack Query keys. Next time the
search sheet opens, the refetch includes the freshly-created draft.

In `VariantCard` the draft is rendered with:
- A `ΠΡΟΧΕΙΡΟ` badge in `var(--clay)` where the supplier eyebrow
  normally sits.
- No cost line, no margin % chip.
- The `(+)` add button works as normal — tapping it opens the
  existing `AddLineSheet`, the rep can adjust price/qty/VAT/note,
  and the line is added with the existing (draft) variant_id (no
  new draft is created on reuse).

Drafts sort **after** active matches in the result list so they
don't drown out canonical entries.

### 6.5 Order detail rendering (post-submit)

`OrderDetail` line list checks `variant_status === 'draft'` (new
field on `OrderLineEnriched`) and renders:

- The standard plant name + size.
- A small `ΠΡΟΧΕΙΡΟ` badge in `var(--clay)` under the name.

The 💬 note pill works as already specified.

### 6.6 PDF rendering

Delivery notes / picking lists render drafts using `common_name` +
`size_summary` like any other line. **No `ΠΡΟΧΕΙΡΟ` marker in the
customer-facing PDF** — that's internal state. The warehouse picker
sees the same name the customer ordered.

Visual picking list: drafts have no photo metadata so they render the
existing `drawPhotoPlaceholder()` fallback. No special handling
needed.

---

## 7. Backend API contract

### 7.1 Extended `POST /api/direct-orders`

The `lines` array element shape becomes a union:

```ts
type DirectOrderLine =
  | { variant_id: string; qty: number; unit_price: number;
      vat_rate?: number; line_no?: number;
      description?: string | null; discount_pct?: number; }
  | { draft: { name: string; size?: string };
      qty: number; unit_price: number;
      vat_rate?: number; line_no?: number;
      description?: string | null; discount_pct?: number; };
```

Validation per line:
- Exactly one of `variant_id` or `draft` must be present.
- If `draft`: `draft.name.trim().length >= 2`.
- `qty > 0`, `unit_price >= 0` (same as today).

Server transaction:
- `BEGIN`.
- Insert `orders` row (unchanged).
- For each line in order:
  - If `draft` present, insert `plants` + `variants` rows with
    `status='draft'` (see §5.2).
  - Insert `order_lines` row using the resolved `variant_id`
    (existing or newly-created).
- `COMMIT`.

Atomicity: if any `INSERT` fails, the whole transaction rolls back and
no draft rows leak.

Response shape unchanged: `{ ok, orderId, orderNumber }`.

### 7.2 `GET /api/plants` and `GET /api/variants` accept `?status=`

New query parameter:

```
?status=active  (default — preserves existing behaviour)
?status=draft   (drafts only)
?status=all     (active + draft + archived)
```

The PWA's `usePlants()` and `useVariants()` call with `?status=all`
so drafts appear in the in-session search. Other callers (the desktop
catalogue browser) keep the default.

### 7.3 `GET /api/orders/:id` enrichment

The `linesResult.rows` query gains two columns:

```sql
SELECT
  ol.*,
  p.common_name AS plant_common_name,
  p.scientific_name AS plant_scientific_name,
  p.status AS plant_status,     -- new
  v.status AS variant_status,   -- new
  v.size_summary,
  ...
```

The PWA `OrderLineEnriched` type acquires:

```ts
variant_status: 'active' | 'draft' | 'archived' | null;
plant_status:   'active' | 'draft' | 'archived' | null;
```

### 7.4 Desktop drafts management (Phase 3 — future)

These endpoints power the desktop inbox UI but are not required for
Phase 1 + 2 to ship:

```
GET    /api/drafts
  → list of draft plants with their variants and a count of
    referencing order_lines, sorted by created_at DESC, paginated.

POST   /api/drafts/:plantId/promote
  Body: { common_name?, scientific_name?, variant_patches?: [...] }
  → applies admin edits, flips plant + all its variants to 'active'.

POST   /api/drafts/:plantId/merge
  Body: { target_variant_id }
  → for each variant of the draft plant, UPDATE order_lines
    SET variant_id = $target WHERE variant_id = $draftVariant.
    Archive the draft plant + variants.

POST   /api/drafts/:plantId/archive
  → flip to 'archived'. 409 if any non-CANCELLED order_lines reference
    any of the plant's variants.
```

### 7.5 Photos endpoint — no change

`GET /api/orders/:id/photos` LEFT-JOINs variants and plants. Draft
variants have no `local_photo_path` / `pakkoutis_photo_id` /
`external_photo_url`, so `resolvePhotoBase64()` returns `null` and the
variant is absent from the response map. The PWA renders
`drawPhotoPlaceholder()` (existing behaviour) — exactly what we want.

---

## 8. Promotion lifecycle (admin actions)

### 8.1 Three outcomes

| Action | Effect on `plants` | Effect on `variants` | Effect on `order_lines` |
|---|---|---|---|
| **Promote** | `status: draft → active`, optional admin edits (`scientific_name`, parsed size, …) | `status: draft → active` | unchanged — `variant_id` is stable |
| **Merge** | `status: draft → archived` | `status: draft → archived` | `UPDATE … SET variant_id = $target WHERE variant_id = $draft` |
| **Archive** | `status: draft → archived` | `status: draft → archived` | unchanged. **Blocked (409) if non-CANCELLED order_lines reference any variant of the draft.** |

### 8.2 Edge case behaviours

| Edge case | Behaviour |
|---|---|
| Two reps create drafts with identical names within minutes | Two separate `plants` rows. Admin merges later. **No automatic dedup.** |
| Rep types a draft, then abandons the order before tapping Save | Nothing persists — draft creation lives inside the order transaction. |
| Rep saves an order with a draft, then cancels the order | Draft stays (`status='draft'`). Admin can archive (the cancelled `order_lines` row does not block archive). |
| Admin runs raw `DELETE` against a draft plant | `order_lines.variant_id` becomes dangling. Defensive notes in the desktop docs forbid this — use `archive` instead. The PWA's LEFT JOIN gracefully renders the `description` text. |
| Rep duplicates an order via "Επανάληψη" with draft lines | Existing `variant_id` is reused. No new drafts. |
| Rep searches "ficus" right after creating that draft | `useVariants` has `staleTime: 10min`. After `useCreateDirectOrder` success the mutation handler invalidates `['plants']` + `['variants']` so the next search shows the new draft. |

---

## 9. Out of scope (YAGNI)

The following were considered and deliberately deferred:

- **Auto-merge similar drafts** — string-distance / fuzzy match. Risky
  (Latin vs Greek, typos). Admin handles via `merge` action.
- **Customer-specific prices for drafts** — `customer_variant_prices`
  is not populated for drafts. The line's `unit_price` is captured
  verbatim and persists; if the draft is later promoted, customer
  pricing infrastructure can be applied separately.
- **Supplier products for drafts** — `supplier_products` and
  `supplier_prices` are catalogue-side concerns. Drafts have no
  associated supplier row. (Adding supplier capture to the PWA is
  proposal 🟡 from the audit and may come later.)
- **Stock tracking** — orthogonal feature; bloom-crm does not track
  stock today.
- **Notifications to admin** — no notification infrastructure exists
  in the stack. Admin checks the drafts inbox manually.
- **Bulk operations** in the drafts inbox — review is one-by-one.
- **Audit log for draft lifecycle** — covered separately by the
  existing `order_amendments` log for line changes; draft promotion
  is metadata-only.
- **Per-user visibility** — all reps see all drafts. Sales team is small.
- **Status `pending`** — not differentiated from `draft`.

---

## 10. Rollout phases

### Phase 1 — bloom-crm server

Deployable independently — the existing PWA continues to work with
`status='active'` everywhere, and drafts are opt-in via the extended
`POST /api/direct-orders` payload.

Work items:
- Schema migration (idempotent `ALTER TABLE`).
- `POST /api/direct-orders` accepts `draft` shape on line items.
- `GET /api/plants` and `/api/variants` accept `?status=` parameter,
  default `'active'`.
- `GET /api/orders/:id` returns `variant_status` and `plant_status`
  on each enriched line.

Tests: extend existing API tests with draft-line variants.

### Phase 2 — bloom-direct-orders PWA

Depends on Phase 1 deployed.

Work items:
- `FreeTextLineSheet` component.
- "Νέο φυτό εκτός καταλόγου" link in the plant-search results list
  (conditional on query length and result count).
- `DraftLine` type acquires optional `draft: { name, size } | null`
  field; existing logic continues to treat `variant_id` as the line
  identity (so duplicates / removes work unchanged).
- `LineRow` in wizard Step 3 renders the draft variant with the
  `ΠΡΟΧΕΙΡΟ` eyebrow and `DRFT` tile.
- `VariantCard` renders drafts in the search results with the badge
  in place of the supplier eyebrow.
- `OrderDetail` line list renders the `ΠΡΟΧΕΙΡΟ` badge for
  `variant_status === 'draft'`.
- `useVariants` and `usePlants` call with `?status=all`.
- `useCreateDirectOrder` mutation handler invalidates `['plants']`
  and `['variants']` on success.
- Unit tests for the shape transformation; e2e test for the full
  free-text → save → reload flow.

### Phase 3 — bloom-crm desktop drafts inbox (separate future sprint)

Not required for Phases 1 + 2 to ship. Until built, the admin
reviews drafts via SQL:

```sql
SELECT p.id, p.common_name, v.size_summary, v.default_sell_price,
       p.created_at,
       COUNT(ol.id) AS order_line_count
FROM plants p
JOIN variants v ON v.plant_id = p.id
LEFT JOIN order_lines ol ON ol.variant_id = v.id
WHERE p.status = 'draft'
GROUP BY p.id, v.id
ORDER BY p.created_at DESC;
```

…and promotes by hand:

```sql
UPDATE plants   SET status = 'active', scientific_name = $1 WHERE id = $2;
UPDATE variants SET status = 'active', pot_volume_l = $1, height_min_cm = $2,
       height_max_cm = $3 WHERE id = $4;
```

Phase 3 builds:
- Drafts tab/filter in the existing catalogue browser.
- Review modal with promote / merge / archive actions and the
  endpoints described in §7.4.

---

## 11. Open questions

None at design time. All decisions are listed in §4.

Items that would normally be open but are explicitly closed:

- **Should `default_sell_price` on the draft variant be set to the
  line's `unit_price`?** Yes — closing this decision now, §5.2.
- **Should drafts appear in `useVariants` results by default?** Yes —
  PWA calls `?status=all`, desktop calls default `'active'`. §7.2.
- **What happens to existing PDF generators?** No change required —
  drafts have valid `common_name` + `size_summary` and join cleanly. §6.6.

---

*Generated 2026-05-28. Source brainstorming session in conversation
transcript. Next step: invoke `writing-plans` skill to produce an
implementation plan against this spec.*
