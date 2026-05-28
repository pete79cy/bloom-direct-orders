# Free-Text Line Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable a sales rep on a phone call to capture a line for a plant
that is not in the catalogue (auto-creating a draft `plants` + `variants`
row server-side) without leaving the order flow.

**Architecture:** Extend the existing atomic `POST /api/direct-orders`
endpoint to accept a draft inline. Server creates the draft rows with
`status='draft'` inside the same transaction as the order header + lines.
PWA gains a `FreeTextLineSheet` component triggered from a contextual
"+ Νέο φυτό" link at the bottom of plant search results when results are
sparse. Drafts surface in subsequent search with a `ΠΡΟΧΕΙΡΟ` badge.

**Tech Stack:**
- **Server (bloom-crm):** Node 20 + Express, Postgres (pg). No server-side
  test infrastructure exists — verification is via `curl` against a local
  dev instance plus the PWA E2E coverage at the end of Phase 2.
- **PWA (bloom-direct-orders):** Vite 8, React 19, TypeScript, TanStack
  Query, Vitest + RTL + Playwright.

**Source spec:** `docs/superpowers/specs/2026-05-28-free-text-line-design.md`

**Deploy order:** Phase 1 (bloom-crm) **must be deployed first**. Phase 2
calls the new endpoints — deploying it before Phase 1 would cause runtime
errors. Both phases can be PR-merged in parallel; deploy bloom-crm to the
VPS (manual `git pull && pm2 restart` on `smartquotations.eu`) BEFORE the
PWA's GitHub Actions deploy.

**Phase 3 (out of scope):** desktop drafts inbox UI is acknowledged in the
spec §10 but is a separate future sprint in the bloom-crm desktop tool.
Admins use SQL until Phase 3 builds the UI. Not planned here.

---

## File Structure

### Phase 1 — bloom-crm (single file in scope)

```
bloom-crm/
└── server/
    └── index.mjs                    # All server changes go here:
                                     #   - line 6694: ALTER TABLE migrations
                                     #   - line 4116: POST /api/direct-orders
                                     #   - line 9639: GET /api/plants
                                     #   - line 10112: GET /api/variants
                                     #   - line 3879: GET /api/orders/:id
```

### Phase 2 — bloom-direct-orders (8 files modified, 1 created)

```
bloom-direct-orders/
└── src/
    ├── types/
    │   └── index.ts                 # Add `status` to Variant + Plant types
    │                                # Add `variant_status` + `plant_status` to OrderLineEnriched
    │                                # Add DirectOrderLinePayload draft union
    │
    ├── lib/
    │   ├── queries.ts               # usePlants/useVariants pass ?status=all
    │                                # useCreateDirectOrder invalidates plants + variants
    │   ├── draft-line.ts            # NEW: helpers for draft DraftLine shape
    │   └── draft-line.test.ts       # NEW: unit tests for draft helpers
    │
    ├── components/
    │   ├── FreeTextLineSheet.tsx    # NEW: configure-and-add sheet for free-text lines
    │   ├── FreeTextLineSheet.test.tsx # NEW: component tests
    │   └── VariantCard.tsx          # Add ΠΡΟΧΕΙΡΟ badge when variant.status==='draft'
    │
    ├── pages/
    │   ├── NewOrderWizard.tsx       # DraftLine type acquires draft field
    │                                # Step 3 search results show "+ Νέο φυτό" link
    │                                # LineRow renders draft lines specially
    │                                # onSave maps lines to {variant_id|draft} union
    │   └── OrderDetail.tsx          # ΠΡΟΧΕΙΡΟ badge for variant_status='draft' lines
    │
    └── e2e/
        └── free-text-line.spec.ts   # NEW: end-to-end test for the full flow
```

**Naming conventions used:**
- `DraftLine` = the in-memory wizard cart row (TypeScript type defined in `NewOrderWizard.tsx`). Already exists; we add a `draft?: {name,size}` field.
- `DraftPlant` / `DraftVariant` = the server-side `plants`/`variants` rows with `status='draft'`. Not exposed as a TypeScript type — they're regular `Plant` / `Variant` shapes with `status` field.
- "free-text line" = the user-facing concept (a phone-order line for a plant not in the catalogue).
- `FreeTextLineResult` = the payload type emitted by `FreeTextLineSheet.onAdd`.

---

# Phase 1 — bloom-crm server

## Task 1.1: Schema migration — add status columns

**Files:**
- Modify: `bloom-crm/server/index.mjs:6694-6705` (after the `order_lines` CREATE TABLE block) — actually the existing `plants` and `variants` `CREATE TABLE IF NOT EXISTS` blocks are at lines 6219 and 6231. We add idempotent `ALTER TABLE` statements after them.

**Background:** Existing schema is created via `CREATE TABLE IF NOT EXISTS` on boot. We add idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS` calls so the migration runs cleanly on existing databases without affecting fresh installs.

- [ ] **Step 1.1.1: Locate the bootstrap schema block**

Read `bloom-crm/server/index.mjs` lines 6219-6260 to confirm the exact CREATE TABLE syntax used for `plants` and `variants`. Note the column names so the migration matches the existing convention (TEXT not VARCHAR, etc.).

- [ ] **Step 1.1.2: Add migration block**

In `bloom-crm/server/index.mjs`, immediately after the last `await pool.query(\`CREATE TABLE IF NOT EXISTS variants … \`);` call (around line 6256), insert:

```js
  // Schema migration: status column for plants and variants.
  // Used by the free-text-line feature in bloom-direct-orders PWA.
  // status values: 'active' (default), 'draft', 'archived'.
  // See docs/superpowers/specs/2026-05-28-free-text-line-design.md
  await pool.query(`ALTER TABLE plants   ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`);
  await pool.query(`ALTER TABLE variants ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_plants_status   ON plants(status)   WHERE status <> 'active'`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_variants_status ON variants(status) WHERE status <> 'active'`);
```

- [ ] **Step 1.1.3: Restart the dev server and verify migration ran**

```bash
cd "C:\Users\pete_\Claude app\bloom-crm" && npm run start:api
```

In a separate shell, query Postgres directly to confirm the columns exist:

```bash
psql -h <DB_HOST> -U <DB_USER> -d <DB_NAME> -c "\d plants" | grep status
psql -h <DB_HOST> -U <DB_USER> -d <DB_NAME> -c "\d variants" | grep status
```

Expected output: `status | text | not null | 'active'::text` for both tables.

- [ ] **Step 1.1.4: Verify existing rows defaulted to active**

```bash
psql -c "SELECT status, COUNT(*) FROM plants GROUP BY status"
psql -c "SELECT status, COUNT(*) FROM variants GROUP BY status"
```

Expected: only `active` with the existing row counts. Zero `draft` or `archived`.

- [ ] **Step 1.1.5: Commit**

```bash
cd "C:\Users\pete_\Claude app\bloom-crm"
git add server/index.mjs
git commit -m "$(cat <<'EOF'
feat(schema): add status column to plants and variants (active/draft/archived)

Idempotent ALTER TABLE migrations run on server boot. All existing rows
default to 'active'. Partial indexes only cover non-active rows so the
hot path (active catalogue browsing) stays unaffected.

Used by the free-text-line feature in bloom-direct-orders PWA — see
docs/superpowers/specs/2026-05-28-free-text-line-design.md in that
repository.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 1.2: Extend POST /api/direct-orders to accept draft inline

**Files:**
- Modify: `bloom-crm/server/index.mjs:4116-4193` (the `app.post('/api/direct-orders', …)` handler)

**Background:** Current handler validates `l.variant_id` is truthy. We change validation to "exactly one of `variant_id` or `draft.name`", and when `draft` is present we INSERT plants + variants rows inside the same transaction, then use the new variant_id for the order_line.

- [ ] **Step 1.2.1: Update validation**

Replace the existing line-validation loop (lines 4124-4128 of `bloom-crm/server/index.mjs`):

Before:

```js
for (const l of lines) {
  if (!l.variant_id || typeof l.qty !== 'number' || l.qty <= 0 || typeof l.unit_price !== 'number') {
    return res.status(400).json({ error: 'Each line needs variant_id, qty>0, unit_price' });
  }
}
```

After:

```js
for (const l of lines) {
  const hasVariantId = !!(l.variant_id && String(l.variant_id).trim());
  const hasDraft = !!(l.draft && l.draft.name && String(l.draft.name).trim().length >= 2);
  if (hasVariantId === hasDraft) {
    // Either both or neither — invalid.
    return res.status(400).json({
      error: 'Each line needs exactly one of variant_id (existing) or draft.name (≥2 chars, new plant)',
    });
  }
  if (typeof l.qty !== 'number' || l.qty <= 0 || typeof l.unit_price !== 'number') {
    return res.status(400).json({ error: 'Each line needs qty>0 and unit_price' });
  }
}
```

- [ ] **Step 1.2.2: Insert draft plant+variant inside the transaction**

Replace the line-insert loop (lines 4158-4178 of `bloom-crm/server/index.mjs`):

Before:

```js
for (let i = 0; i < lines.length; i += 1) {
  const l = lines[i];
  const lineNo = typeof l.line_no === 'number' ? l.line_no : i + 1;
  await client.query(
    `INSERT INTO order_lines (
       id, order_id, line_no, variant_id, description, qty, unit_price, discount_pct, vat_rate
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      `ol-${orderId}-${i + 1}`,
      orderId,
      lineNo,
      String(l.variant_id),
      String(l.description || ''),
      Number.parseInt(String(l.qty), 10) || 0,
      Number.parseFloat(String(l.unit_price)) || 0,
      Number.parseFloat(String(l.discount_pct ?? 0)) || 0,
      Number.parseFloat(String(l.vat_rate ?? 0)) || 0,
    ],
  );
}
```

After:

```js
for (let i = 0; i < lines.length; i += 1) {
  const l = lines[i];
  const lineNo = typeof l.line_no === 'number' ? l.line_no : i + 1;

  // Resolve the variant_id for this line: either use the supplied one,
  // or auto-create draft plant + variant rows for free-text lines.
  let resolvedVariantId;
  if (l.draft && l.draft.name) {
    const plantId = `p-${Date.now()}-${i}`;
    const variantId = `v-${Date.now()}-${i}`;
    const draftName = String(l.draft.name).trim();
    const draftSize = String(l.draft.size || '').trim();
    const today = todayIso();

    await client.query(
      `INSERT INTO plants (id, common_name, scientific_name, status, created_at, updated_at)
       VALUES ($1, $2, '', 'draft', $3, $3)`,
      [plantId, draftName, today],
    );
    await client.query(
      `INSERT INTO variants (id, plant_id, variant_code, size_summary, default_sell_price, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'draft', $6, $6)`,
      [
        variantId,
        plantId,
        `DRAFT-${plantId}`,
        draftSize,
        Number.parseFloat(String(l.unit_price)) || 0,
        today,
      ],
    );

    resolvedVariantId = variantId;
  } else {
    resolvedVariantId = String(l.variant_id);
  }

  await client.query(
    `INSERT INTO order_lines (
       id, order_id, line_no, variant_id, description, qty, unit_price, discount_pct, vat_rate
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      `ol-${orderId}-${i + 1}`,
      orderId,
      lineNo,
      resolvedVariantId,
      String(l.description || ''),
      Number.parseInt(String(l.qty), 10) || 0,
      Number.parseFloat(String(l.unit_price)) || 0,
      Number.parseFloat(String(l.discount_pct ?? 0)) || 0,
      Number.parseFloat(String(l.vat_rate ?? 0)) || 0,
    ],
  );
}
```

**Note:** If the existing `plants` table has additional NOT NULL columns beyond `id`, `common_name`, `scientific_name`, `status`, `created_at`, `updated_at` (e.g. `category`), the INSERT will fail. Check the schema at lines 6219-6230 of `bloom-crm/server/index.mjs` first — if extra columns exist, include them with empty/default values in the INSERT. Same check for the `variants` INSERT at lines 6231-6256.

- [ ] **Step 1.2.3: Verify schema compatibility**

```bash
psql -c "\d plants" | head -20
psql -c "\d variants" | head -25
```

For each NOT NULL column that doesn't have a DEFAULT, add it to the INSERT in Step 1.2.2 with an empty-string or numeric-zero placeholder.

- [ ] **Step 1.2.4: Restart server and verify with curl — happy path (existing variant)**

```bash
cd "C:\Users\pete_\Claude app\bloom-crm" && npm run start:api
```

In another shell (using a valid JWT from a prior login):

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<your-email>","password":"<your-password>"}' | jq -r .token)

curl -s -X POST http://localhost:4000/api/direct-orders \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "order": {"customer_id": "<a-real-customer-id>", "status": "PENDING"},
    "lines": [{"variant_id": "<a-real-variant-id>", "qty": 1, "unit_price": 1.0, "vat_rate": 19}]
  }'
```

Expected: `{"ok":true,"orderId":"o-...","orderNumber":"ORD-2026-NNN"}`.

- [ ] **Step 1.2.5: Verify with curl — draft path**

```bash
curl -s -X POST http://localhost:4000/api/direct-orders \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "order": {"customer_id": "<a-real-customer-id>", "status": "PENDING"},
    "lines": [
      {"draft": {"name": "Ficus benjamina", "size": "P 5L · H 80-100"}, "qty": 4, "unit_price": 8.50, "vat_rate": 19}
    ]
  }'
```

Expected: `{"ok":true,...}`. Then inspect:

```bash
psql -c "SELECT id, common_name, status FROM plants WHERE status='draft' ORDER BY created_at DESC LIMIT 1"
psql -c "SELECT id, plant_id, size_summary, default_sell_price, status FROM variants WHERE status='draft' ORDER BY created_at DESC LIMIT 1"
psql -c "SELECT order_id, variant_id, qty, unit_price FROM order_lines ORDER BY order_id DESC LIMIT 1"
```

Expected: one row in each, plant.common_name='Ficus benjamina', variant.size_summary='P 5L · H 80-100', order_line.variant_id matches the new variant.id, order_line.unit_price=8.50.

- [ ] **Step 1.2.6: Verify with curl — validation errors**

Test "neither variant_id nor draft":

```bash
curl -s -X POST http://localhost:4000/api/direct-orders \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"order":{"customer_id":"X"},"lines":[{"qty":1,"unit_price":1}]}'
```

Expected: `{"error":"Each line needs exactly one of variant_id (existing) or draft.name (≥2 chars, new plant)"}`.

Test "both variant_id and draft":

```bash
curl -s -X POST http://localhost:4000/api/direct-orders \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"order":{"customer_id":"X"},"lines":[{"variant_id":"v-1","draft":{"name":"Foo"},"qty":1,"unit_price":1}]}'
```

Expected: same 400 error.

Test "draft.name too short":

```bash
curl -s -X POST http://localhost:4000/api/direct-orders \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"order":{"customer_id":"X"},"lines":[{"draft":{"name":"F"},"qty":1,"unit_price":1}]}'
```

Expected: same 400 error.

- [ ] **Step 1.2.7: Verify rollback — failure mid-transaction**

Trigger a failure by supplying an invalid `customer_id` (foreign-key violation on the `orders` INSERT):

```bash
curl -s -X POST http://localhost:4000/api/direct-orders \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "order":{"customer_id":"nonexistent"},
    "lines":[{"draft":{"name":"RollbackTest"},"qty":1,"unit_price":1}]
  }'
```

Expected: 500 with `{"error":"server_error","detail":"..."}`. Then verify no draft was committed:

```bash
psql -c "SELECT COUNT(*) FROM plants WHERE common_name='RollbackTest'"
```

Expected: 0. (Transaction rolled back.)

- [ ] **Step 1.2.8: Commit**

```bash
cd "C:\Users\pete_\Claude app\bloom-crm"
git add server/index.mjs
git commit -m "$(cat <<'EOF'
feat(api): POST /api/direct-orders accepts inline draft for uncatalogued plants

Each line now accepts either {variant_id} (existing catalogue row) OR
{draft: {name, size?}} (auto-create a new plants + variants row with
status='draft' inline). Both kinds coexist in a single order. The
plant+variant inserts run inside the same transaction as the order
header + lines, so a mid-flight failure rolls everything back — no
orphan drafts.

Server generates p-<ts>-<i> / v-<ts>-<i> IDs, sets variant_code to
DRAFT-<plantId>, copies the line's unit_price into the variant's
default_sell_price, and stores the user-supplied size verbatim in
size_summary (the desktop admin parses it into structured columns
during the review/promote step in Phase 3).

Validation:
- Exactly one of variant_id or draft must be present (XOR).
- draft.name.trim().length >= 2.
- qty > 0, unit_price is a number (unchanged).

See docs/superpowers/specs/2026-05-28-free-text-line-design.md in
bloom-direct-orders.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 1.3: GET /api/plants accepts ?status= parameter

**Files:**
- Modify: `bloom-crm/server/index.mjs:9639-9647`

**Background:** Default behaviour stays unchanged (`status='active'` only) so the desktop catalogue browser is not affected. PWA opts in via `?status=all`.

- [ ] **Step 1.3.1: Update the GET /api/plants handler**

In `bloom-crm/server/index.mjs`, replace the `app.get('/api/plants', …)` body:

Before:

```js
app.get('/api/plants', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM plants ORDER BY scientific_name ASC, id ASC');
    return res.json(result.rows.map(sanitizePlantRecord));
  } catch (error) {
    console.error('GET /api/plants failed', error);
    return res.status(500).json({ error: 'Failed to load plants' });
  }
});
```

After:

```js
app.get('/api/plants', async (req, res) => {
  try {
    // ?status= controls which catalogue rows are returned:
    //   omitted | 'active' → only status='active' (default, preserves existing behaviour)
    //   'draft'            → only status='draft' (for the desktop drafts inbox)
    //   'all'              → all rows regardless of status (used by the PWA)
    const statusParam = String(req.query.status || 'active').toLowerCase();
    let where, params;
    if (statusParam === 'all') {
      where = '';
      params = [];
    } else if (statusParam === 'draft' || statusParam === 'active' || statusParam === 'archived') {
      where = 'WHERE status = $1';
      params = [statusParam];
    } else {
      return res.status(400).json({ error: 'status must be one of active|draft|archived|all' });
    }
    const result = await pool.query(
      `SELECT * FROM plants ${where} ORDER BY scientific_name ASC, id ASC`,
      params,
    );
    return res.json(result.rows.map(sanitizePlantRecord));
  } catch (error) {
    console.error('GET /api/plants failed', error);
    return res.status(500).json({ error: 'Failed to load plants' });
  }
});
```

- [ ] **Step 1.3.2: Verify default behaviour unchanged**

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/plants | jq '. | length'
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:4000/api/plants?status=active" | jq '. | length'
```

Both should return the same number — the count of active plants.

- [ ] **Step 1.3.3: Verify ?status=draft**

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:4000/api/plants?status=draft" | jq '. | length'
```

Should return the count of plants created via the curl test in Step 1.2.5 (at least 1).

- [ ] **Step 1.3.4: Verify ?status=all**

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:4000/api/plants?status=all" | jq '. | length'
```

Should equal active + draft + archived.

- [ ] **Step 1.3.5: Verify invalid value rejected**

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/plants?status=garbage"
```

Expected: `400`.

- [ ] **Step 1.3.6: Commit**

```bash
cd "C:\Users\pete_\Claude app\bloom-crm"
git add server/index.mjs
git commit -m "feat(api): GET /api/plants accepts ?status=active|draft|archived|all (default active)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.4: GET /api/variants accepts ?status= parameter

**Files:**
- Modify: `bloom-crm/server/index.mjs:10112-10120`

- [ ] **Step 1.4.1: Mirror the same change on /api/variants**

In `bloom-crm/server/index.mjs`, replace the `app.get('/api/variants', …)` body:

Before:

```js
app.get('/api/variants', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM variants ORDER BY created_at ASC, id ASC');
    return res.json(result.rows);
  } catch (error) {
    console.error('GET /api/variants failed', error);
    return res.status(500).json({ error: 'Failed to load variants' });
  }
});
```

After:

```js
app.get('/api/variants', async (req, res) => {
  try {
    const statusParam = String(req.query.status || 'active').toLowerCase();
    let where, params;
    if (statusParam === 'all') {
      where = '';
      params = [];
    } else if (statusParam === 'draft' || statusParam === 'active' || statusParam === 'archived') {
      where = 'WHERE status = $1';
      params = [statusParam];
    } else {
      return res.status(400).json({ error: 'status must be one of active|draft|archived|all' });
    }
    const result = await pool.query(
      `SELECT * FROM variants ${where} ORDER BY created_at ASC, id ASC`,
      params,
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('GET /api/variants failed', error);
    return res.status(500).json({ error: 'Failed to load variants' });
  }
});
```

- [ ] **Step 1.4.2: Verify with curl (same pattern as Task 1.3)**

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:4000/api/variants" | jq '. | length'
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:4000/api/variants?status=draft" | jq '. | length'
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:4000/api/variants?status=all" | jq '. | length'
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" "http://localhost:4000/api/variants?status=garbage"
```

Expected: same pattern as Task 1.3. Default and `?status=active` match. `?status=draft` returns the variants created from drafts. `?status=garbage` returns 400.

- [ ] **Step 1.4.3: Commit**

```bash
cd "C:\Users\pete_\Claude app\bloom-crm"
git add server/index.mjs
git commit -m "feat(api): GET /api/variants accepts ?status= mirror of /api/plants

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.5: GET /api/orders/:id enrichment with variant_status + plant_status

**Files:**
- Modify: `bloom-crm/server/index.mjs:3886-3905` (the `linesResult` query inside `app.get('/api/orders/:id', …)`)

**Background:** Two new columns join from `variants` and `plants` so the PWA can render the ΠΡΟΧΕΙΡΟ badge on draft lines in the order detail view.

- [ ] **Step 1.5.1: Add the two status columns to the SELECT**

In `bloom-crm/server/index.mjs`, replace the `linesResult` query (around line 3886):

Before:

```js
const linesResult = await pool.query(
  `SELECT
     ol.*,
     p.common_name AS plant_common_name,
     p.scientific_name AS plant_scientific_name,
     v.form,
     v.grade,
     v.pot_volume_l,
     v.height_min_cm,
     v.height_max_cm,
     v.girth_min_cm,
     v.girth_max_cm,
     v.note AS variant_note
   FROM order_lines ol
   LEFT JOIN variants v ON v.id = ol.variant_id
   LEFT JOIN plants p ON p.id = v.plant_id
   WHERE ol.order_id = $1
   ORDER BY ol.line_no ASC`,
  [id],
);
```

After:

```js
const linesResult = await pool.query(
  `SELECT
     ol.*,
     p.common_name AS plant_common_name,
     p.scientific_name AS plant_scientific_name,
     p.status AS plant_status,
     v.form,
     v.grade,
     v.pot_volume_l,
     v.height_min_cm,
     v.height_max_cm,
     v.girth_min_cm,
     v.girth_max_cm,
     v.note AS variant_note,
     v.status AS variant_status
   FROM order_lines ol
   LEFT JOIN variants v ON v.id = ol.variant_id
   LEFT JOIN plants p ON p.id = v.plant_id
   WHERE ol.order_id = $1
   ORDER BY ol.line_no ASC`,
  [id],
);
```

- [ ] **Step 1.5.2: Verify with curl — order containing a draft line**

Use the orderId returned from the draft creation in Step 1.2.5:

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/orders/<orderId> | jq '.lines[0] | {variant_id, variant_status, plant_status, plant_common_name, size_summary}'
```

Expected:

```json
{
  "variant_id": "v-...",
  "variant_status": "draft",
  "plant_status": "draft",
  "plant_common_name": "Ficus benjamina",
  "size_summary": "P 5L · H 80-100"
}
```

- [ ] **Step 1.5.3: Verify regular orders unaffected**

Pick any old order id and confirm `variant_status`/`plant_status` are present and equal `'active'`:

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/orders/<old-order-id> | jq '.lines[0].variant_status'
```

Expected: `"active"`.

- [ ] **Step 1.5.4: Commit**

```bash
cd "C:\Users\pete_\Claude app\bloom-crm"
git add server/index.mjs
git commit -m "feat(api): GET /api/orders/:id returns variant_status + plant_status

Enriches each line in the response with the joined variant.status and
plant.status columns so the PWA can render the ΠΡΟΧΕΙΡΟ badge on draft
lines in the order detail view. Non-draft lines see 'active' — no
breaking change to consumers that ignore the new fields.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.6: Push and deploy bloom-crm to VPS

**Files:** none modified — this is a deploy operation.

- [ ] **Step 1.6.1: Push all Phase 1 commits**

```bash
cd "C:\Users\pete_\Claude app\bloom-crm"
git log --oneline -6        # confirm the 5 commits from Tasks 1.1-1.5
git push origin main
```

- [ ] **Step 1.6.2: SSH to VPS and deploy**

```bash
ssh root@smartquotations.eu
cd /var/www/bloom-crm
git pull origin main
npm ci --production
pm2 restart bloom-crm  # or the equivalent process manager command
pm2 logs bloom-crm --lines 30
```

Watch the logs for:
- "ALTER TABLE plants ADD COLUMN" or equivalent migration log (idempotent — may log nothing on second run).
- No errors on startup.

- [ ] **Step 1.6.3: Verify production endpoints respond correctly**

From a local shell:

```bash
# Should return 401 (gated by global auth) — proves endpoint is live
curl -s -o /dev/null -w '%{http_code}\n' "https://smartquotations.eu/api/plants?status=all"
curl -s -o /dev/null -w '%{http_code}\n' "https://smartquotations.eu/api/variants?status=draft"
```

Expected: both `401`.

Phase 1 is now live. PWA changes can be merged at any time without affecting production.

---

# Phase 2 — bloom-direct-orders PWA

> All paths in Phase 2 are relative to `C:\Users\pete_\Claude app\bloom-direct-orders\`.

## Task 2.1: Type updates

**Files:**
- Modify: `src/types/index.ts`

**Background:** Add the new `status` field to `Variant` and `Plant`, and the new enriched fields to `OrderLineEnriched`. Also define the discriminated payload type for the submit API call.

- [ ] **Step 2.1.1: Read current type definitions**

```bash
cat "src/types/index.ts" | head -60
```

Locate the `Plant`, `Variant`, and `OrderLineEnriched` interfaces.

- [ ] **Step 2.1.2: Add status fields**

In `src/types/index.ts`, modify the `Plant` interface to add `status`:

```ts
export interface Plant {
  id: string;
  scientific_name: string;
  common_name: string | null;
  status?: 'active' | 'draft' | 'archived';  // ← new (optional for backward-compatibility with cached payloads)
}
```

Modify the `Variant` interface the same way:

```ts
export interface Variant {
  id: string;
  plant_id: string;
  variant_code: string;
  size_summary: string | null;
  default_sell_price: number | null;
  // existing optional structural fields …
  status?: 'active' | 'draft' | 'archived';  // ← new
}
```

Modify `OrderLineEnriched`:

```ts
export interface OrderLineEnriched extends OrderLine {
  plant_common_name: string | null;
  plant_scientific_name: string | null;
  size_summary: string | null;
  variant_status?: 'active' | 'draft' | 'archived' | null;  // ← new
  plant_status?: 'active' | 'draft' | 'archived' | null;    // ← new
}
```

- [ ] **Step 2.1.3: Run typecheck**

```bash
cd "C:\Users\pete_\Claude app\bloom-direct-orders"
npm run lint
```

Expected: zero errors (the additions are optional fields, no consumer needs updating yet).

- [ ] **Step 2.1.4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add status to Plant/Variant + variant_status/plant_status to OrderLineEnriched

Optional fields so existing code that doesn't use them remains valid. Wired
up in subsequent tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2.2: Update queries.ts (status=all + invalidations)

**Files:**
- Modify: `src/lib/queries.ts`

- [ ] **Step 2.2.1: Pass ?status=all on the catalogue queries**

In `src/lib/queries.ts`, find the `useVariants` and `usePlants` hooks (around lines 41-55). Replace:

Before:

```ts
export function useVariants() {
  return useQuery({
    queryKey: ['variants'],
    staleTime: TEN_MIN,
    queryFn: () => apiFetch<Variant[]>('/api/variants'),
  });
}

export function usePlants() {
  return useQuery({
    queryKey: ['plants'],
    staleTime: TEN_MIN,
    queryFn: () => apiFetch<Plant[]>('/api/plants'),
  });
}
```

After:

```ts
export function useVariants() {
  // status=all → include 'draft' rows so they surface in the PWA plant
  // search (rendered with a ΠΡΟΧΕΙΡΟ badge). Active-only would hide drafts
  // until the desktop admin promotes them — defeating in-session reuse.
  return useQuery({
    queryKey: ['variants'],
    staleTime: TEN_MIN,
    queryFn: () => apiFetch<Variant[]>('/api/variants?status=all'),
  });
}

export function usePlants() {
  // See useVariants comment.
  return useQuery({
    queryKey: ['plants'],
    staleTime: TEN_MIN,
    queryFn: () => apiFetch<Plant[]>('/api/plants?status=all'),
  });
}
```

- [ ] **Step 2.2.2: Invalidate plants/variants after a successful order create**

In `src/lib/queries.ts`, find `useCreateDirectOrder` (around lines 154-166). Replace:

Before:

```ts
export function useCreateDirectOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateDirectOrderPayload) =>
      apiFetch<CreateDirectOrderResponse>('/api/direct-orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
```

After:

```ts
export function useCreateDirectOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateDirectOrderPayload) =>
      apiFetch<CreateDirectOrderResponse>('/api/direct-orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      // If the order contained any draft lines, the catalogue has new
      // rows the user may want to reuse later in the same session. Even
      // for non-draft submissions the cost is negligible (10-min staleTime
      // means the queries usually return the cached payload anyway).
      qc.invalidateQueries({ queryKey: ['plants'] });
      qc.invalidateQueries({ queryKey: ['variants'] });
    },
  });
}
```

- [ ] **Step 2.2.3: Update the DirectOrderLinePayload type to accept the draft union**

In `src/lib/queries.ts`, find `DirectOrderLinePayload` (around line 126). Replace:

Before:

```ts
export interface DirectOrderLinePayload {
  variant_id: string;
  qty: number;
  unit_price: number;
  description?: string | null;
  discount_pct?: number | null;
  vat_rate?: number | null;
  line_no?: number;
}
```

After:

```ts
/** Common shape for every direct-order line. The line ALSO carries either
 *  a `variant_id` (existing catalogue row) or a `draft: {name, size?}`
 *  (a phone-call line for a plant not in the catalogue — the server
 *  creates plants+variants rows on the fly). Exactly one of the two
 *  must be present per line; the server enforces this with a 400 error.
 */
interface DirectOrderLineCommon {
  qty: number;
  unit_price: number;
  description?: string | null;
  discount_pct?: number | null;
  vat_rate?: number | null;
  line_no?: number;
}

export type DirectOrderLinePayload =
  | (DirectOrderLineCommon & { variant_id: string; draft?: undefined })
  | (DirectOrderLineCommon & { variant_id?: undefined; draft: { name: string; size?: string } });
```

- [ ] **Step 2.2.4: Run typecheck and tests**

```bash
npm run lint
npm run test:run
```

Both must pass. The 63 existing tests are unaffected by these changes.

- [ ] **Step 2.2.5: Commit**

```bash
git add src/lib/queries.ts
git commit -m "feat(queries): plants/variants use ?status=all + invalidate on order create

usePlants and useVariants now pass ?status=all so draft rows surface in
the PWA plant search (rendered with a ΠΡΟΧΕΙΡΟ badge in a later task).

useCreateDirectOrder additionally invalidates ['plants'] and ['variants']
on success so a freshly-created draft is visible if the user re-opens the
search sheet in the same session.

DirectOrderLinePayload becomes a discriminated union — each line carries
either {variant_id} or {draft: {name, size?}} but not both. The server
validation enforces the XOR.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2.3: Draft-line helpers + tests

**Files:**
- Create: `src/lib/draft-line.ts`
- Create: `src/lib/draft-line.test.ts`

**Background:** Centralise the small "is this a draft" predicate and the local placeholder id-generation logic. Keeps `NewOrderWizard.tsx` (which is already 1000+ lines) focused on UI.

- [ ] **Step 2.3.1: Write the failing test**

Create `src/lib/draft-line.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  isDraftDraftLine,
  makeLocalDraftId,
  draftLineToPayload,
} from './draft-line';
import type { DraftLine } from './draft-line';

describe('isDraftDraftLine', () => {
  it('returns true when the line has a draft field', () => {
    const line: DraftLine = {
      variant_id: 'draft-123',
      qty: 1,
      unit_price: 5,
      price_source: 'override',
      vat_rate: 19,
      description: '',
      draft: { name: 'Ficus', size: 'P 5L' },
    };
    expect(isDraftDraftLine(line)).toBe(true);
  });

  it('returns false for a normal cart line', () => {
    const line: DraftLine = {
      variant_id: 'v-real-12345',
      qty: 1,
      unit_price: 5,
      price_source: 'override',
      vat_rate: 19,
      description: '',
    };
    expect(isDraftDraftLine(line)).toBe(false);
  });
});

describe('makeLocalDraftId', () => {
  it('produces deterministic-format ids prefixed with draft-', () => {
    const id1 = makeLocalDraftId(0);
    expect(id1).toMatch(/^draft-\d+-0$/);
  });

  it('disambiguates by index so two drafts in the same tick differ', () => {
    const id1 = makeLocalDraftId(0);
    const id2 = makeLocalDraftId(1);
    expect(id1).not.toEqual(id2);
  });
});

describe('draftLineToPayload', () => {
  it('emits {variant_id} for a normal line', () => {
    const line: DraftLine = {
      variant_id: 'v-12345',
      qty: 3,
      unit_price: 4.5,
      price_source: 'customer',
      vat_rate: 19,
      description: 'note',
    };
    expect(draftLineToPayload(line, 0)).toEqual({
      variant_id: 'v-12345',
      qty: 3,
      unit_price: 4.5,
      vat_rate: 19,
      line_no: 1,
      description: 'note',
    });
  });

  it('emits {draft: {name, size}} for a free-text line, drops the local variant_id', () => {
    const line: DraftLine = {
      variant_id: 'draft-9999-0',
      qty: 2,
      unit_price: 8.5,
      price_source: 'override',
      vat_rate: 5,
      description: '',
      draft: { name: 'Ficus benjamina', size: 'P 5L' },
    };
    expect(draftLineToPayload(line, 3)).toEqual({
      draft: { name: 'Ficus benjamina', size: 'P 5L' },
      qty: 2,
      unit_price: 8.5,
      vat_rate: 5,
      line_no: 4,
      description: null,
    });
  });

  it('preserves an empty size as empty string in the payload', () => {
    const line: DraftLine = {
      variant_id: 'draft-1-0',
      qty: 1,
      unit_price: 1,
      price_source: 'override',
      vat_rate: 19,
      description: '',
      draft: { name: 'A name', size: '' },
    };
    expect(draftLineToPayload(line, 0)).toMatchObject({
      draft: { name: 'A name', size: '' },
    });
  });
});
```

- [ ] **Step 2.3.2: Run test to verify it fails**

```bash
npm run test:run -- src/lib/draft-line.test.ts
```

Expected: FAIL with module resolution error (`Cannot find module './draft-line'`).

- [ ] **Step 2.3.3: Write the implementation**

Create `src/lib/draft-line.ts`:

```ts
/**
 * Helpers for the in-memory DraftLine that the New Order wizard carries.
 * A DraftLine is one row in the wizard's local cart. It either:
 *  - references an existing catalogue variant via variant_id, OR
 *  - carries a `draft: {name, size}` payload — a "free-text" line for a
 *    plant the rep was asked for over the phone that isn't catalogued yet.
 *
 * The XOR is enforced at submit time by draftLineToPayload(): exactly one
 * of (variant_id, draft) is sent to /api/direct-orders.
 *
 * Single source of truth so NewOrderWizard.tsx stays UI-focused.
 */

import type { VatRate } from './vat';

export type PriceSource = 'customer' | 'default' | 'override';

export interface DraftLineDraft {
  name: string;
  size: string;
}

export interface DraftLine {
  /** Identity for React keys + update/remove operations. For real
   *  catalogue lines this IS the variant_id. For free-text lines it's a
   *  local placeholder `draft-<ts>-<i>` — the server generates the real
   *  variant_id during the submit transaction. */
  variant_id: string;
  qty: number;
  unit_price: number;
  price_source: PriceSource;
  vat_rate: VatRate;
  /** Per-line note ("χωρίς γλάστρα", "ύψος 80cm+"). Maps to
   *  order_lines.description. Empty string when none. */
  description: string;
  /** Present only when this is a free-text line. */
  draft?: DraftLineDraft;
}

/** True when the line is a free-text line awaiting server-side draft
 *  creation (i.e. the variant_id is a local placeholder, not a real id). */
export function isDraftDraftLine(line: DraftLine): boolean {
  return !!line.draft;
}

/** Generate a unique local id for a new free-text line. The `i` argument
 *  disambiguates multiple drafts created in the same tick. */
export function makeLocalDraftId(i: number): string {
  return `draft-${Date.now()}-${i}`;
}

/** Map an in-memory DraftLine to the wire payload for POST
 *  /api/direct-orders. Free-text lines emit `draft: {name, size}` and OMIT
 *  variant_id; catalogue lines emit `variant_id` and OMIT draft. The server
 *  rejects any line that breaks the XOR. */
export function draftLineToPayload(line: DraftLine, index: number): {
  qty: number;
  unit_price: number;
  vat_rate: number;
  line_no: number;
  description: string | null;
  variant_id?: string;
  draft?: { name: string; size: string };
} {
  const base = {
    qty: line.qty,
    unit_price: line.unit_price,
    vat_rate: line.vat_rate,
    line_no: index + 1,
    description: line.description || null,
  };
  if (line.draft) {
    return {
      ...base,
      draft: { name: line.draft.name, size: line.draft.size },
    };
  }
  return {
    ...base,
    variant_id: line.variant_id,
  };
}
```

- [ ] **Step 2.3.4: Run tests to verify they pass**

```bash
npm run test:run -- src/lib/draft-line.test.ts
```

Expected: all three describe blocks pass.

- [ ] **Step 2.3.5: Run the full test suite to catch regressions**

```bash
npm run test:run
```

Expected: 63 + 5 = 68 tests pass (3 describe blocks × 1-3 it() each = 5 new test cases).

- [ ] **Step 2.3.6: Commit**

```bash
git add src/lib/draft-line.ts src/lib/draft-line.test.ts
git commit -m "feat(draft-line): helpers for the free-text-line DraftLine shape

Extracts DraftLine + DraftLineDraft type definitions, the local-placeholder
id generator, the is-this-a-draft predicate, and the submit-payload
shaper into a focused module. Keeps NewOrderWizard.tsx (1000+ lines)
from carrying more business logic.

isDraftDraftLine() and draftLineToPayload() are unit-tested; the latter
enforces the XOR at the wire (no caller can accidentally send both
variant_id and draft).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2.4: Migrate NewOrderWizard's DraftLine to use the new type

**Files:**
- Modify: `src/pages/NewOrderWizard.tsx`

**Background:** The existing `DraftLine` interface is declared inline in `NewOrderWizard.tsx`. We replace it with an import from `src/lib/draft-line.ts` and update the `onSave` payload to use `draftLineToPayload`. No behavioural change yet — just refactor.

- [ ] **Step 2.4.1: Replace the inline DraftLine interface with an import**

In `src/pages/NewOrderWizard.tsx`, find the existing block (around line 36-44):

```ts
type PriceSource = 'customer' | 'default' | 'override';

interface DraftLine {
  variant_id: string;
  qty: number;
  unit_price: number;
  price_source: PriceSource;
  vat_rate: VatRate;
  description: string;
}
```

Replace with:

```ts
import type { DraftLine, PriceSource } from '@/lib/draft-line';
import { draftLineToPayload, makeLocalDraftId } from '@/lib/draft-line';
```

Place these imports next to the other `@/lib/...` imports near the top of the file.

- [ ] **Step 2.4.2: Replace the submit payload mapping**

Find the `onSave` function (around line 1123) and replace the `lines` mapping. The lambda parameter `i` already exists as the second arg of `.map`. Replace:

Before:

```ts
lines: lines.map((l, i) => ({
  variant_id: l.variant_id,
  qty: l.qty,
  unit_price: l.unit_price,
  vat_rate: l.vat_rate,
  line_no: i + 1,
  description: l.description || null,
})),
```

After:

```ts
lines: lines.map((l, i) => draftLineToPayload(l, i)),
```

- [ ] **Step 2.4.3: Run lint and tests**

```bash
npm run lint
npm run test:run
```

Both pass. (No behavioural change — the refactor is wire-equivalent because the existing payload had `variant_id` for every line, and `draftLineToPayload` of a non-draft line produces exactly that shape.)

- [ ] **Step 2.4.4: Commit**

```bash
git add src/pages/NewOrderWizard.tsx
git commit -m "refactor(wizard): import DraftLine from @/lib/draft-line, use payload shaper

Drops the inline DraftLine + PriceSource declarations. Submit payload now
flows through draftLineToPayload so the same code-path will serve free-text
lines in the next task.

No behavioural change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2.5: FreeTextLineSheet component + test

**Files:**
- Create: `src/components/FreeTextLineSheet.tsx`
- Create: `src/components/FreeTextLineSheet.test.tsx`

**Background:** A focused variant of `AddLineSheet` with fields for plant name + size in addition to qty/price/VAT/note. No cost reference and no margin display (the plant isn't catalogued, so we have no supplier cost).

- [ ] **Step 2.5.1: Write the failing component test**

Create `src/components/FreeTextLineSheet.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FreeTextLineSheet from './FreeTextLineSheet';

describe('FreeTextLineSheet', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <FreeTextLineSheet open={false} initialName="" onClose={() => {}} onAdd={() => {}} />,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('pre-fills the name input from initialName', () => {
    render(
      <FreeTextLineSheet
        open={true}
        initialName="Ficus benjamina"
        onClose={() => {}}
        onAdd={() => {}}
      />,
    );
    const nameInput = screen.getByLabelText(/Όνομα φυτού/i) as HTMLInputElement;
    expect(nameInput.value).toBe('Ficus benjamina');
  });

  it('disables commit when name has fewer than 2 chars', () => {
    render(
      <FreeTextLineSheet
        open={true}
        initialName="F"
        onClose={() => {}}
        onAdd={() => {}}
      />,
    );
    const commit = screen.getByRole('button', { name: /Προσθήκη στην παραγγελία/i });
    expect(commit).toBeDisabled();
  });

  it('calls onAdd with name+size+qty+unit_price+vat_rate+description on commit', () => {
    const onAdd = vi.fn();
    render(
      <FreeTextLineSheet
        open={true}
        initialName="Ficus benjamina"
        onClose={() => {}}
        onAdd={onAdd}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Μέγεθος/i), { target: { value: 'P 5L' } });
    fireEvent.change(screen.getByLabelText(/Τιμή πώλησης/i), { target: { value: '8.50' } });
    // QtyStepper starts at 1; click + twice
    fireEvent.click(screen.getByLabelText(/Αύξηση/i));
    fireEvent.click(screen.getByLabelText(/Αύξηση/i));
    fireEvent.click(screen.getByRole('button', { name: /Προσθήκη στην παραγγελία/i }));
    expect(onAdd).toHaveBeenCalledWith({
      name: 'Ficus benjamina',
      size: 'P 5L',
      qty: 3,
      unit_price: 8.50,
      vat_rate: 19,
      description: '',
    });
  });

  it('trims whitespace from name and size', () => {
    const onAdd = vi.fn();
    render(
      <FreeTextLineSheet open={true} initialName="  Hello  " onClose={() => {}} onAdd={onAdd} />,
    );
    fireEvent.change(screen.getByLabelText(/Μέγεθος/i), { target: { value: '  P 5L  ' } });
    fireEvent.change(screen.getByLabelText(/Τιμή πώλησης/i), { target: { value: '1.00' } });
    fireEvent.click(screen.getByRole('button', { name: /Προσθήκη στην παραγγελία/i }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Hello', size: 'P 5L' }),
    );
  });

  it('calls onClose when the close button is tapped', () => {
    const onClose = vi.fn();
    render(
      <FreeTextLineSheet open={true} initialName="Foo" onClose={onClose} onAdd={() => {}} />,
    );
    fireEvent.click(screen.getByLabelText(/Κλείσιμο/i));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2.5.2: Run the test to confirm failure**

```bash
npm run test:run -- src/components/FreeTextLineSheet.test.tsx
```

Expected: module-not-found error.

- [ ] **Step 2.5.3: Implement the component**

Create `src/components/FreeTextLineSheet.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Plus, X, AlertTriangle } from 'lucide-react';
import FullScreenSheet from './FullScreenSheet';
import PriceInput from './PriceInput';
import QtyStepper from './QtyStepper';
import VatPicker from './VatPicker';
import { fmtEUR } from '@/lib/format';
import { DEFAULT_VAT_RATE, VAT_LABEL, type VatRate } from '@/lib/vat';

export interface FreeTextLineResult {
  name: string;
  size: string;
  qty: number;
  unit_price: number;
  vat_rate: VatRate;
  description: string;
}

interface Props {
  open: boolean;
  /** Pre-fill for the name field — usually the search query that
   *  produced "no matches" so the rep doesn't retype. */
  initialName: string;
  onClose: () => void;
  onAdd: (result: FreeTextLineResult) => void;
}

/**
 * Full-screen sheet for adding a free-text (non-catalogued) line.
 *
 * Mirrors the layout of AddLineSheet but drops the cost / margin
 * surfaces (no supplier exists yet) and adds two text fields above
 * the price/qty/VAT controls: plant name and size.
 *
 * On commit, emits a FreeTextLineResult to the wizard; the wizard
 * appends a draft DraftLine and the server creates the actual
 * plants+variants rows when the order is submitted.
 */
export default function FreeTextLineSheet({
  open,
  initialName,
  onClose,
  onAdd,
}: Props) {
  const [name, setName] = useState(initialName);
  const [size, setSize] = useState('');
  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [vatRate, setVatRate] = useState<VatRate>(DEFAULT_VAT_RATE);
  const [description, setDescription] = useState('');

  // Reset state every time the sheet opens, pre-filling name with the
  // search query that brought the rep here.
  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setSize('');
    setQty(1);
    setUnitPrice(0);
    setVatRate(DEFAULT_VAT_RATE);
    setDescription('');
  }, [open, initialName]);

  const trimmedName = name.trim();
  const trimmedSize = size.trim();
  const canCommit = trimmedName.length >= 2 && qty > 0 && unitPrice >= 0;

  const net = qty * unitPrice;
  const vatAmount = net * (vatRate / 100);
  const gross = net + vatAmount;

  function commit() {
    if (!canCommit) return;
    onAdd({
      name: trimmedName,
      size: trimmedSize,
      qty,
      unit_price: unitPrice,
      vat_rate: vatRate,
      description: description.trim(),
    });
  }

  return (
    <FullScreenSheet open={open} onClose={onClose}>
      {/* Header */}
      <div
        className="pt-safe"
        style={{
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          borderBottom: '1px solid rgba(63,75,70,0.06)',
        }}
      >
        <button
          type="button"
          aria-label="Κλείσιμο"
          onClick={onClose}
          className="ios-tap"
          style={{
            width: 36, height: 36, borderRadius: 999,
            background: 'rgba(63,75,70,0.06)',
            color: 'var(--ink-700)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <X size={16} strokeWidth={1.8} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="text-eyebrow" style={{ fontSize: 9, marginBottom: 1 }}>
            Εκτός καταλόγου
          </div>
          <h3
            className="font-display"
            style={{
              fontStyle: 'italic',
              fontSize: 19,
              color: 'var(--sage-800)',
              lineHeight: 1.1,
            }}
          >
            Νέο φυτό
          </h3>
        </div>
      </div>

      {/* Warning eyebrow */}
      <div
        style={{
          padding: '10px 20px',
          background: 'rgba(214,161,78,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: 'var(--honey)',
        }}
      >
        <AlertTriangle size={13} strokeWidth={1.8} />
        Θα μπει ως πρόχειρο — ο διαχειριστής θα το ελέγξει αργότερα.
      </div>

      {/* Form */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 24px' }}>
        {/* Name */}
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="ftls-name"
            className="text-eyebrow"
            style={{ fontSize: 9, display: 'block', marginBottom: 6 }}
          >
            Όνομα φυτού
          </label>
          <input
            id="ftls-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="π.χ. Ficus benjamina"
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.85)',
              border: '1px solid rgba(63,75,70,0.10)',
              borderRadius: 12,
              fontSize: 15,
              color: 'var(--ink-900)',
              outline: 'none',
            }}
          />
        </div>

        {/* Size */}
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="ftls-size"
            className="text-eyebrow"
            style={{ fontSize: 9, display: 'block', marginBottom: 6 }}
          >
            Μέγεθος / γλάστρα
          </label>
          <input
            id="ftls-size"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder="π.χ. P 5L · H 80-100"
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.85)',
              border: '1px solid rgba(63,75,70,0.10)',
              borderRadius: 12,
              fontSize: 14,
              color: 'var(--ink-900)',
              outline: 'none',
            }}
          />
        </div>

        {/* Sell price */}
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="ftls-price"
            className="text-eyebrow"
            style={{ fontSize: 9, display: 'block', marginBottom: 6 }}
          >
            Τιμή πώλησης
          </label>
          <PriceInput id="ftls-price" value={unitPrice} onChange={setUnitPrice} />
        </div>

        {/* Qty */}
        <div style={{ marginBottom: 16 }}>
          <div className="text-eyebrow" style={{ fontSize: 9, marginBottom: 6 }}>
            Ποσότητα
          </div>
          <QtyStepper value={qty} min={1} onChange={setQty} />
        </div>

        {/* Per-line note */}
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="ftls-desc"
            className="text-eyebrow"
            style={{
              fontSize: 9,
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 6,
            }}
          >
            <span>Σημείωση</span>
            <span style={{ color: 'var(--ink-300)', letterSpacing: 0, textTransform: 'none', fontSize: 10 }}>
              προαιρετικό
            </span>
          </label>
          <textarea
            id="ftls-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="π.χ. χωρίς γλάστρα, ύψος 80cm+"
            rows={2}
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.85)',
              border: '1px solid rgba(63,75,70,0.10)',
              borderRadius: 12,
              fontSize: 14,
              color: 'var(--ink-900)',
              outline: 'none',
              resize: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.4,
            }}
          />
        </div>

        {/* VAT */}
        <div style={{ marginBottom: 20 }}>
          <div className="text-eyebrow" style={{ fontSize: 9, marginBottom: 6 }}>
            ΦΠΑ
          </div>
          <VatPicker value={vatRate} onChange={setVatRate} />
        </div>

        {/* Subtotal preview */}
        <div
          style={{
            background: 'var(--cream-200)',
            borderRadius: 14,
            padding: 14,
          }}
        >
          <div className="text-eyebrow" style={{ fontSize: 9, marginBottom: 10 }}>
            Σύνολο γραμμής
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span className="font-mono-meta" style={{ fontSize: 12, color: 'var(--ink-500)' }}>
              {qty} × {fmtEUR(unitPrice)}
            </span>
            <span className="font-mono-meta" style={{ fontSize: 13, color: 'var(--ink-700)' }}>
              {fmtEUR(net)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>{VAT_LABEL[vatRate]}</span>
            <span className="font-mono-meta" style={{ fontSize: 13, color: 'var(--ink-700)' }}>
              {fmtEUR(vatAmount)}
            </span>
          </div>
          <div className="hairline" style={{ margin: '4px 0 8px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--sage-800)' }}>Σύνολο</span>
            <span className="font-mono-meta" style={{ fontSize: 18, fontWeight: 500, color: 'var(--sage-800)' }}>
              {fmtEUR(gross)}
            </span>
          </div>
        </div>
      </div>

      {/* Commit bar */}
      <div
        className="pb-safe"
        style={{
          padding: '14px 20px 16px',
          background: '#fff',
          borderTop: '1px solid rgba(63,75,70,0.10)',
        }}
      >
        <button
          type="button"
          disabled={!canCommit}
          onClick={commit}
          className="btn-primary ios-tap"
        >
          <Plus size={18} color="var(--cream-50)" strokeWidth={2} />
          Προσθήκη στην παραγγελία
        </button>
      </div>
    </FullScreenSheet>
  );
}
```

- [ ] **Step 2.5.4: Run the test to verify all pass**

```bash
npm run test:run -- src/components/FreeTextLineSheet.test.tsx
```

Expected: all 6 cases green. If `QtyStepper`'s "+" button does not use `aria-label="Αύξηση"`, check `src/components/QtyStepper.tsx` for the actual label and update the test's `getByLabelText` accordingly.

- [ ] **Step 2.5.5: Verify the wider suite still passes**

```bash
npm run test:run
```

Expected: 68 + 6 = 74 tests pass.

- [ ] **Step 2.5.6: Commit**

```bash
git add src/components/FreeTextLineSheet.tsx src/components/FreeTextLineSheet.test.tsx
git commit -m "feat(ftls): FreeTextLineSheet component for adding uncatalogued plants

Full-screen sheet that mirrors AddLineSheet's layout but adds Όνομα +
Μέγεθος text fields and drops the cost / margin surfaces (no supplier
exists for a free-text plant). On commit emits a FreeTextLineResult that
the wizard turns into a draft DraftLine.

The warning eyebrow at the top ('Θα μπει ως πρόχειρο') makes the draft
nature explicit before the rep commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2.6: Wire FreeTextLineSheet into NewOrderWizard

**Files:**
- Modify: `src/pages/NewOrderWizard.tsx`

**Background:** Add state for the sheet's open/close, an "+ Νέο φυτό εκτός καταλόγου" link at the bottom of the search results when results are sparse, and a commit handler that appends a draft DraftLine to the cart.

- [ ] **Step 2.6.1: Add the import**

In `src/pages/NewOrderWizard.tsx`, near the other component imports, add:

```ts
import FreeTextLineSheet, { type FreeTextLineResult } from '@/components/FreeTextLineSheet';
```

- [ ] **Step 2.6.2: Add open/close state for the FTLS**

Locate the area where `configuringVariant` state is declared (search for `setConfiguringVariant`). Immediately after that line, add:

```ts
// Free-text line sheet — opens when the rep taps "+ Νέο φυτό" at the bottom
// of plant search results. Closed by default. The wizard appends a draft
// DraftLine on commit; the server creates the actual plants+variants rows
// during the order submit transaction.
const [freeTextOpen, setFreeTextOpen] = useState(false);
```

- [ ] **Step 2.6.3: Add the commit handler**

In the same scope (next to `commitConfiguredLine`), add:

```ts
/** Append a draft DraftLine to the cart and close the FTLS. */
function commitFreeTextLine(result: FreeTextLineResult) {
  const next: DraftLine = {
    variant_id: makeLocalDraftId(lines.length),
    qty: result.qty,
    unit_price: result.unit_price,
    price_source: 'override',
    vat_rate: result.vat_rate,
    description: result.description,
    draft: { name: result.name, size: result.size },
  };
  onChange([...lines, next]);
  setFreeTextOpen(false);
  // Close the underlying search sheet too — the rep just added their
  // off-catalogue line, they're done with the search modal for this round.
  setSheetOpen(false);
}
```

- [ ] **Step 2.6.4: Add the "+ Νέο φυτό" link in the search results body**

Find the rendering of plant search results in the wizard step 3 search sheet. The results live in a list (often a `<ul>` or a `<div>` rendered from `filteredVariants.map(...)`). At the END of the result list, conditionally render:

```tsx
{query.trim().length >= 2 && filteredVariants.length < 5 && (
  <button
    type="button"
    onClick={() => setFreeTextOpen(true)}
    className="ios-tap"
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 4,
      width: '100%',
      padding: '14px 16px',
      marginTop: 12,
      background: 'rgba(214,161,78,0.06)',
      border: '1px dashed rgba(214,161,78,0.35)',
      borderRadius: 14,
      textAlign: 'left',
      color: 'var(--ink-700)',
    }}
  >
    <div
      className="text-eyebrow"
      style={{ fontSize: 9, color: 'var(--honey)' }}
    >
      Εκτός καταλόγου
    </div>
    <div style={{ fontSize: 14, fontWeight: 500 }}>
      + Νέο φυτό: «{query.trim()}»
    </div>
    <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>
      Το όνομα μπαίνει αυτόματα.
    </div>
  </button>
)}
```

**Note:** locate the actual variant `query` state and `filteredVariants` array names from the surrounding code — they may be `searchQuery` / `searchResults` or similar. Use the existing names.

- [ ] **Step 2.6.5: Render the FreeTextLineSheet at the end of the JSX**

Below the existing `AddLineSheet` mount (search for `onAdd={commitConfiguredLine}`):

```tsx
<FreeTextLineSheet
  open={freeTextOpen}
  initialName={query.trim()}
  onClose={() => setFreeTextOpen(false)}
  onAdd={commitFreeTextLine}
/>
```

Again, use the local search-query state variable's actual name.

- [ ] **Step 2.6.6: Run lint and the test suite**

```bash
npm run lint
npm run test:run
```

Both must pass. Existing tests are unaffected.

- [ ] **Step 2.6.7: Manual smoke-test in the dev server**

```bash
npm run dev
```

- Log in, start a new order, go to Step 3.
- Open the plant search sheet.
- Type 2+ characters that produce 0 results (e.g. a deliberate gibberish).
- Confirm the "+ Νέο φυτό" link appears with the query echoed.
- Tap it. Confirm the FreeTextLineSheet opens with the query pre-filled in the Όνομα field.
- Fill in size, price, qty, tap Προσθήκη.
- Confirm a new line appears in the cart with the typed name as plant name.

**Do not save the order yet — the rendering on the cart card hasn't been styled for drafts. That comes in Task 2.7.** The line should still appear (possibly with a placeholder name like "Φυτό" if `pickPlantName` doesn't find a match), confirming the draft state landed in the cart.

- [ ] **Step 2.6.8: Commit**

```bash
git add src/pages/NewOrderWizard.tsx
git commit -m "feat(wizard): wire FreeTextLineSheet + '+ Νέο φυτό' link into Step 3

The link surfaces under the plant search results only when the query is
≥2 chars AND fewer than 5 results match — avoids accidentally adding a
free-text line when the rep is just browsing matches.

Tap → opens FreeTextLineSheet with the search query pre-filled as the
plant name. Commit appends a draft DraftLine (variant_id is a local
placeholder; the server-side variant_id is generated during submit).

Cart line rendering for drafts is handled in the next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2.7: LineRow rendering for draft lines in the cart

**Files:**
- Modify: `src/pages/NewOrderWizard.tsx` (the `LineRow` function around line 839)

**Background:** When a `DraftLine.draft` is present we have no `plant` / `variant` lookup. Render from `line.draft.name` and `line.draft.size` directly, add the ΠΡΟΧΕΙΡΟ eyebrow, and suppress the cost / margin / supplier rows that would otherwise show "—" everywhere.

- [ ] **Step 2.7.1: Update LineRow rendering**

In `src/pages/NewOrderWizard.tsx`, find the `function LineRow(...)` declaration (around line 839). Locate the start of the JSX return.

Add at the top of the function body, before the existing `pickPlantName` call:

```ts
const isDraft = !!line.draft;
const draftName = line.draft?.name ?? '';
const draftSize = line.draft?.size ?? '';
```

Replace the `displayPrimary` computation:

Before:

```ts
const displayPrimary = primary === 'Φυτό'
  ? fallbackVariantLabel(variant?.variant_code)
  : primary;
```

After:

```ts
const displayPrimary = isDraft
  ? draftName
  : (primary === 'Φυτό' ? fallbackVariantLabel(variant?.variant_code) : primary);
```

Replace the `size` computation:

Before:

```ts
const size = variant ? sizeDetailsString({
  pot_volume_l: variant.pot_volume_l,
  // ...
}) : null;
```

After:

```ts
const size = isDraft
  ? (draftSize || null)
  : (variant ? sizeDetailsString({
      pot_volume_l: variant.pot_volume_l,
      height_min_cm: variant.height_min_cm,
      height_max_cm: variant.height_max_cm,
      girth_min_cm: variant.girth_min_cm,
      girth_max_cm: variant.girth_max_cm,
    }) : null);
```

Replace the `tileLabel` computation:

Before:

```ts
const tileLabel = (plant?.scientific_name?.split(/\s+/)[0] ?? variant?.variant_code.split('__')[0] ?? 'PLNT')
  .slice(0, 4)
  .toUpperCase();
```

After:

```ts
const tileLabel = isDraft
  ? 'DRFT'
  : (plant?.scientific_name?.split(/\s+/)[0] ?? variant?.variant_code.split('__')[0] ?? 'PLNT')
      .slice(0, 4)
      .toUpperCase();
```

- [ ] **Step 2.7.2: Add the ΠΡΟΧΕΙΡΟ eyebrow under the plant name**

In `LineRow`'s JSX, find the existing supplier eyebrow rendering — it conditionally renders when `supplier` is truthy. Replace the entire supplier-eyebrow block with:

Before (excerpt — the actual lines render `supplier && (...)`):

```tsx
{supplier && (
  <p className="text-eyebrow" style={{ /* ... */ color: 'var(--ink-300)', /* ... */ }}>
    {supplier}
  </p>
)}
```

After:

```tsx
{isDraft ? (
  <p
    className="text-eyebrow"
    style={{
      fontSize: 9,
      marginTop: 5,
      color: 'var(--clay)',
      letterSpacing: '0.15em',
      display: 'flex',
      alignItems: 'center',
      gap: 4,
    }}
  >
    <span aria-hidden="true">⚠</span> ΠΡΟΧΕΙΡΟ — ΕΚΤΟΣ ΚΑΤΑΛΟΓΟΥ
  </p>
) : supplier ? (
  <p
    className="text-eyebrow"
    style={{
      fontSize: 9,
      marginTop: 5,
      color: 'var(--ink-300)',
      letterSpacing: '0.15em',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }}
  >
    {supplier}
  </p>
) : null}
```

- [ ] **Step 2.7.3: Suppress the cost column for drafts**

Find the `{/* Cost column */}` block inside the Price area grid. Wrap it in a conditional. Replace:

Before:

```tsx
{/* Cost column */}
<div>
  <div className="text-eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>
    Κόστος
  </div>
  {cost != null ? (
    /* render cost */
  ) : (
    /* render — placeholder */
  )}
</div>
```

After:

```tsx
{!isDraft && (
  <div>
    <div className="text-eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>
      Κόστος
    </div>
    {cost != null ? (
      /* render cost — keep existing block exactly */
    ) : (
      /* render — placeholder — keep existing block exactly */
    )}
  </div>
)}
```

Then change the parent grid template to be single-column for drafts. Find the Price area grid wrapper:

Before:

```tsx
<div style={{
  display: 'grid',
  gridTemplateColumns: '1fr 1.2fr',
  gap: 12,
  /* ... */
}}>
```

After:

```tsx
<div style={{
  display: 'grid',
  gridTemplateColumns: isDraft ? '1fr' : '1fr 1.2fr',
  gap: 12,
  marginTop: 4,
  paddingTop: 12,
  borderTop: '1px dashed rgba(63,75,70,0.10)',
}}>
```

- [ ] **Step 2.7.4: Suppress the margin % chip for drafts**

In the sell-price column, the margin % chip is rendered after the `PriceInput`. Wrap it:

Before:

```tsx
{cost != null && unitPrice > 0 && (() => {
  const margin = /* ... */;
  /* ... */
})()}
```

After:

```tsx
{!isDraft && cost != null && unitPrice > 0 && (() => {
  const margin = /* ... */;
  /* ... */
})()}
```

- [ ] **Step 2.7.5: Run lint and tests**

```bash
npm run lint
npm run test:run
```

Both must pass.

- [ ] **Step 2.7.6: Smoke-test in dev**

```bash
npm run dev
```

- Create a new order, go to Step 3.
- Add a free-text line via the flow exercised in Task 2.6.
- Confirm the cart card shows:
  - `DRFT` placeholder tile.
  - The typed plant name as the title.
  - "⚠ ΠΡΟΧΕΙΡΟ — ΕΚΤΟΣ ΚΑΤΑΛΟΓΟΥ" eyebrow in clay colour.
  - The typed size in the mono-uppercase line.
  - No supplier eyebrow.
  - No cost column.
  - No margin % chip.
  - The sell-price input and Trash button still work.

- [ ] **Step 2.7.7: Commit**

```bash
git add src/pages/NewOrderWizard.tsx
git commit -m "feat(wizard): LineRow renders draft lines with DRFT tile + ΠΡΟΧΕΙΡΟ eyebrow

For a DraftLine with .draft present, the row renders from line.draft.name +
line.draft.size instead of doing a plant/variant catalogue lookup. The
supplier eyebrow is replaced with a clay-coloured ⚠ ΠΡΟΧΕΙΡΟ — ΕΚΤΟΣ
ΚΑΤΑΛΟΓΟΥ marker so the rep sees at-a-glance which lines are off-
catalogue. Cost column and margin % are hidden (no supplier cost to
compare against). The sell-price input remains editable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2.8: VariantCard ΠΡΟΧΕΙΡΟ badge for catalogue drafts

**Files:**
- Modify: `src/components/VariantCard.tsx`

**Background:** After a draft is committed, the catalogue queries refetch (Task 2.2's invalidation) and the new draft variant appears in plant search results alongside actives. Render it with a ΠΡΟΧΕΙΡΟ badge in place of the supplier eyebrow so reps can identify drafts at a glance. The `(+)` action button still works normally — tapping it opens AddLineSheet and the line is added with the existing draft variant_id (no new draft created).

- [ ] **Step 2.8.1: Receive variant.status in the existing component**

The `VariantCard` already accepts a `variant: Variant` prop, and after Task 2.1 `Variant` has an optional `status` field. No prop change needed.

- [ ] **Step 2.8.2: Replace the supplier eyebrow rendering**

In `src/components/VariantCard.tsx`, find the supplier eyebrow block (around lines 116-131). Replace:

Before:

```tsx
{/* Supplier — eyebrow style, only when known */}
{supplier && (
  <p
    className="text-eyebrow"
    style={{
      fontSize: 9,
      marginTop: 4,
      color: 'var(--ink-300)',
      letterSpacing: '0.15em',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }}
  >
    {supplier}
  </p>
)}
```

After:

```tsx
{/* Eyebrow — ΠΡΟΧΕΙΡΟ badge for drafts wins over supplier display so the
    rep sees the draft status at a glance even on busy result rows. */}
{variant.status === 'draft' ? (
  <p
    className="text-eyebrow"
    style={{
      fontSize: 9,
      marginTop: 4,
      color: 'var(--clay)',
      letterSpacing: '0.15em',
      display: 'flex',
      alignItems: 'center',
      gap: 4,
    }}
  >
    <span aria-hidden="true">⚠</span> ΠΡΟΧΕΙΡΟ
  </p>
) : supplier ? (
  <p
    className="text-eyebrow"
    style={{
      fontSize: 9,
      marginTop: 4,
      color: 'var(--ink-300)',
      letterSpacing: '0.15em',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }}
  >
    {supplier}
  </p>
) : null}
```

- [ ] **Step 2.8.3: Suppress the cost line for draft variants**

Find the cost-rendering block (around lines 189-201):

Before:

```tsx
{cost != null && (
  <span
    className="font-mono-meta"
    style={{
      fontSize: 10,
      color: 'var(--ink-300)',
      letterSpacing: 0,
    }}
    title="Χαμηλότερο κόστος προμηθευτή"
  >
    {fmtEUR(cost)} cost
  </span>
)}
```

After:

```tsx
{variant.status !== 'draft' && cost != null && (
  <span
    className="font-mono-meta"
    style={{
      fontSize: 10,
      color: 'var(--ink-300)',
      letterSpacing: 0,
    }}
    title="Χαμηλότερο κόστος προμηθευτή"
  >
    {fmtEUR(cost)} cost
  </span>
)}
```

- [ ] **Step 2.8.4: Sort drafts after actives in the search result list**

In `src/pages/NewOrderWizard.tsx`, find the place where `filteredVariants` (or equivalent) is computed. Add a tiebreaker step so drafts come last. The exact location depends on the surrounding code — search for the array sort or use the existing search-filter `useMemo`.

Add (or merge into the existing sort):

```ts
const sortedFilteredVariants = useMemo(() => {
  return [...filteredVariants].sort((a, b) => {
    const aDraft = a.status === 'draft' ? 1 : 0;
    const bDraft = b.status === 'draft' ? 1 : 0;
    if (aDraft !== bDraft) return aDraft - bDraft;
    // existing tiebreaker (e.g. by name) — preserve it
    return 0;
  });
}, [filteredVariants]);
```

Use `sortedFilteredVariants` instead of `filteredVariants` in the render. If a sort already exists, fold the draft check into it as the first tiebreaker.

- [ ] **Step 2.8.5: Run lint and tests**

```bash
npm run lint
npm run test:run
```

Both pass.

- [ ] **Step 2.8.6: Smoke-test in dev**

- Create a free-text line (Task 2.6 flow). Save the order (skip if save isn't ready — open a second order or use the same flow with different data; the goal is to leave a draft variant in the DB).
- Start a new wizard. Search for the same plant name.
- Confirm the draft variant appears in the results with the ⚠ ΠΡΟΧΕΙΡΟ eyebrow and no supplier / cost lines.
- Tap (+) → AddLineSheet opens normally. Commit → a normal DraftLine is appended (no `draft` field set, `variant_id` is the real draft variant id).
- Confirm the cart shows the line — with the same DRFT styling (Task 2.7's LineRow draft path needs to also detect the case where the catalogue variant has status=draft).

**Bug-check:** Task 2.7's `isDraft` flag is currently `!!line.draft` — which doesn't fire for catalogue-reused drafts. Re-open `LineRow` and update:

```ts
const isDraft = !!line.draft || variant?.status === 'draft';
```

`variant` here is the existing prop already in scope.

Re-run the smoke test. The reused draft variant should now render with the ΠΡΟΧΕΙΡΟ eyebrow + DRFT tile.

- [ ] **Step 2.8.7: Commit**

```bash
git add src/components/VariantCard.tsx src/pages/NewOrderWizard.tsx
git commit -m "feat(search): ΠΡΟΧΕΙΡΟ badge in VariantCard + sort drafts after actives

Plant search rows for variants with status=draft now render a clay-coloured
⚠ ΠΡΟΧΕΙΡΟ eyebrow in place of the supplier name (which they don't have),
and the cost line is suppressed. Drafts sort to the bottom of the result
list so they don't drown out canonical entries when the search matches
both.

LineRow's isDraft predicate is widened to also fire when the reused
catalogue variant has status=draft, so the cart styling stays consistent
whether the draft was just typed or reused from a previous order.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2.9: OrderDetail ΠΡΟΧΕΙΡΟ badge for variant_status='draft'

**Files:**
- Modify: `src/pages/OrderDetail.tsx`

**Background:** After submit, the rep lands on the order detail page. Each line in the response now carries `variant_status` (from Task 1.5). Render a small ΠΡΟΧΕΙΡΟ marker beside the plant name when the variant is still a draft so the rep can confirm the line was captured as such.

- [ ] **Step 2.9.1: Render the badge under the plant name**

In `src/pages/OrderDetail.tsx`, find the `lines.map((l, i) => { ... })` block (around line 247). Inside the `<div>` that holds the plant name + size + price line, add a ΠΡΟΧΕΙΡΟ marker:

Find the existing plant-name `<p>` element:

```tsx
<p
  className="font-display"
  style={{ fontStyle: 'italic', fontSize: 14, fontWeight: 500 }}
>
  {name}
</p>
```

Immediately after it, add:

```tsx
{l.variant_status === 'draft' && (
  <p
    className="text-eyebrow"
    style={{
      fontSize: 9,
      marginTop: 2,
      color: 'var(--clay)',
      letterSpacing: '0.15em',
      display: 'flex',
      alignItems: 'center',
      gap: 4,
    }}
  >
    <span aria-hidden="true">⚠</span> ΠΡΟΧΕΙΡΟ
  </p>
)}
```

- [ ] **Step 2.9.2: Run lint and tests**

```bash
npm run lint
npm run test:run
```

Both pass.

- [ ] **Step 2.9.3: Smoke-test against a draft order**

- Create an order containing at least one free-text line.
- Land on the order detail page after save.
- Confirm the draft line shows the ⚠ ΠΡΟΧΕΙΡΟ eyebrow under the plant name.
- Confirm catalogue (non-draft) lines do NOT show the badge.

- [ ] **Step 2.9.4: Commit**

```bash
git add src/pages/OrderDetail.tsx
git commit -m "feat(order-detail): render ΠΡΟΧΕΙΡΟ badge on lines with variant_status='draft'

The badge appears beneath the plant name in the order detail line list so
the rep can confirm post-submit which lines landed as drafts. Catalogue
lines are unaffected.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2.10: End-to-end test for the full flow

**Files:**
- Create: `e2e/free-text-line.spec.ts`

**Background:** Playwright e2e covering the full path: log in → wizard → free-text line → save → land on order detail → ΠΡΟΧΕΙΡΟ badge visible. Requires the local bloom-crm dev API running with Phase 1 changes deployed.

- [ ] **Step 2.10.1: Write the e2e spec**

Create `e2e/free-text-line.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_EMAIL ?? 'pete@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'password123';

/**
 * Free-text line flow: a rep creates an order containing a plant that
 * isn't catalogued (auto-creates draft plants+variants server-side).
 *
 * Requires the same setup as create-order.spec.ts plus Phase 1 of the
 * free-text-line feature deployed on the bloom-crm API.
 *
 * Run with: TEST_EMAIL=you@x.com TEST_PASSWORD=... npx playwright test
 */
test('user can create an order with a free-text line', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(TEST_EMAIL);
  await page.getByLabel('Κωδικός').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Σύνδεση' }).click();
  await expect(page).toHaveURL('/');

  await page.getByRole('link', { name: /Νέα Παραγγελία/ }).click();
  await expect(page).toHaveURL('/orders/new');

  // Step 1: pick the first customer.
  await page.locator('ul li button').first().click();
  // Step 2: continue with defaults.
  await page.getByRole('button', { name: 'Συνέχεια' }).click();
  // Step 3: open the plant search sheet.
  await page.getByRole('button', { name: /Προσθήκη γραμμής/ }).click();
  // Type a query that produces 0 catalogue matches.
  const uniqueQuery = `E2E_FreeText_${Date.now()}`;
  await page.getByPlaceholder(/Αναζήτηση/i).fill(uniqueQuery);

  // Wait for the "+ Νέο φυτό" link to render and tap it.
  const newLink = page.getByRole('button', { name: new RegExp(`Νέο φυτό.*${uniqueQuery}`) });
  await expect(newLink).toBeVisible();
  await newLink.click();

  // FreeTextLineSheet — confirm pre-fill, fill size + price.
  await expect(page.getByLabel(/Όνομα φυτού/i)).toHaveValue(uniqueQuery);
  await page.getByLabel(/Μέγεθος/i).fill('P 5L');
  await page.getByLabel(/Τιμή πώλησης/i).fill('8.50');
  await page.getByRole('button', { name: /Προσθήκη στην παραγγελία/i }).click();

  // Back in Step 3 — confirm the cart shows the new line with the draft styling.
  await expect(page.getByText('⚠ ΠΡΟΧΕΙΡΟ — ΕΚΤΟΣ ΚΑΤΑΛΟΓΟΥ')).toBeVisible();
  await expect(page.getByText(uniqueQuery)).toBeVisible();

  await page.getByRole('button', { name: 'Συνέχεια' }).click();

  // Step 4 (review) — submit.
  await page.getByRole('button', { name: /Αποθήκευση/i }).click();

  // Land on the order detail — confirm ΠΡΟΧΕΙΡΟ marker is shown.
  await expect(page).toHaveURL(/\/orders\/o-/);
  await expect(page.getByText(/ΠΡΟΧΕΙΡΟ/).first()).toBeVisible();
  await expect(page.getByText(uniqueQuery)).toBeVisible();
});
```

- [ ] **Step 2.10.2: Run the e2e test against a local stack**

In separate shells:

```bash
# Shell 1 — bloom-crm API on port 4000 with Phase 1 deployed
cd "C:\Users\pete_\Claude app\bloom-crm" && npm run start:api
```

```bash
# Shell 2 — bloom-direct-orders dev on port 5174
cd "C:\Users\pete_\Claude app\bloom-direct-orders" && npm run dev
```

```bash
# Shell 3 — run the e2e test
cd "C:\Users\pete_\Claude app\bloom-direct-orders"
TEST_EMAIL="<your-email>" TEST_PASSWORD="<your-password>" npm run e2e -- free-text-line.spec.ts
```

Expected: test passes.

- [ ] **Step 2.10.3: Commit**

```bash
git add e2e/free-text-line.spec.ts
git commit -m "test(e2e): full free-text-line flow — wizard → submit → order detail badge

Mirrors create-order.spec.ts but exercises the off-catalogue path: type a
non-matching query, tap the '+ Νέο φυτό' link, fill the sheet, save the
order, confirm the ΠΡΟΧΕΙΡΟ badge renders on the detail view.

Requires Phase 1 deployed (server schema migration + extended
/api/direct-orders + variant_status enrichment).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2.11: Final validation + deploy

**Files:** none — verification + deploy.

- [ ] **Step 2.11.1: Run the full quality gate**

```bash
cd "C:\Users\pete_\Claude app\bloom-direct-orders"
npm run lint
npm run test:run
npm run build
```

All three must complete green.

- [ ] **Step 2.11.2: Push to main**

```bash
git log --oneline -10                  # confirm all Phase 2 commits are present
git push origin main
```

GitHub Actions builds and rsyncs to the VPS (the "Deploy" job may report "failure" due to the spurious rsync `***@` parse error — verify the live bundle hash changes via the next step).

- [ ] **Step 2.11.3: Verify the deployed bundle includes the new strings**

```bash
sleep 90
LIVE=$(curl -s https://orders.smartquotations.eu/ | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1)
curl -s "https://orders.smartquotations.eu/assets/$LIVE" | grep -oE "ΠΡΟΧΕΙΡΟ|Νέο φυτό" | sort -u
```

Expected:

```
Νέο φυτό
ΠΡΟΧΕΙΡΟ
```

- [ ] **Step 2.11.4: Smoke-test in production**

Open `orders.smartquotations.eu` on a real phone. Force-close the PWA if cached. Start a new order, exercise the full flow from Task 2.10 against the real backend, confirm everything works.

- [ ] **Step 2.11.5: Final commit (optional — only if any fix-ups landed)**

If steps 2.11.1-2.11.4 surface small issues, fix them, run the gate again, push.

---

## Phase 3 — acknowledged, not planned here

Per the spec §10, the desktop bloom-crm drafts inbox UI is a separate future
sprint. Until it ships the admin reviews drafts via SQL using the queries
in the spec's §10 Phase 3 SQL snippets:

```sql
SELECT p.id, p.common_name, v.size_summary, v.default_sell_price,
       p.created_at, COUNT(ol.id) AS order_line_count
FROM plants p
JOIN variants v ON v.plant_id = p.id
LEFT JOIN order_lines ol ON ol.variant_id = v.id
WHERE p.status = 'draft'
GROUP BY p.id, v.id
ORDER BY p.created_at DESC;
```

Promotion is done by hand:

```sql
UPDATE plants
   SET status = 'active', scientific_name = $1
 WHERE id = $2;

UPDATE variants
   SET status = 'active',
       pot_volume_l = $1, height_min_cm = $2, height_max_cm = $3
 WHERE id = $4;
```

Phase 3's plan should be written when the desktop sprint kicks off.

---

## Self-Review Notes

Performed by the plan author after writing the document:

**Spec coverage check:**
- §5.1 schema migration → Task 1.1
- §5.2 field mapping → Task 1.2
- §6.1 trigger surface (link conditions) → Task 2.6 step 2.6.4
- §6.2 FreeTextLineSheet field set + validation → Task 2.5
- §6.3 cart row rendering → Task 2.7
- §6.4 search reuse + sort + invalidation → Tasks 2.2, 2.8
- §6.5 order detail ΠΡΟΧΕΙΡΟ badge → Task 2.9
- §6.6 PDF behaviour (no special handling) → covered: nothing to do
- §7.1 extended POST /api/direct-orders → Task 1.2
- §7.2 GET /api/plants and /api/variants ?status= → Tasks 1.3, 1.4
- §7.3 GET /api/orders/:id enrichment → Task 1.5
- §7.4 desktop drafts endpoints (Phase 3) → acknowledged not planned
- §7.5 photos endpoint (no change) → covered: nothing to do
- §8 promotion lifecycle (admin) → Phase 3 acknowledged
- §10 phased rollout → reflected in Phase 1 / Phase 2 structure

No gaps.

**Placeholder scan:** no `TBD`, `TODO`, or vague "appropriate" / "as needed"
language. Every step has explicit code or commands.

**Type consistency:** `DraftLine`, `DraftLineDraft`, `PriceSource`,
`FreeTextLineResult`, `DirectOrderLinePayload` referenced consistently
across tasks. The `isDraft` predicate is widened in Task 2.8 step 2.8.6
to also cover catalogue-reused drafts — flagged inline as a bug-check.

**Scope:** Phases 1 + 2 are a focused single-feature implementation.
Phase 3 is explicitly out-of-scope and acknowledged. No decomposition
needed.

---

*Generated 2026-05-28 from `docs/superpowers/specs/2026-05-28-free-text-line-design.md`.*
*Next step (per writing-plans skill): execute via subagent-driven-development or executing-plans.*
