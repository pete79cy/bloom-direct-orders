# Customer "Order Ready" Notification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the operator notify a customer that their order is READY, via a one-tap-assisted Viber/WhatsApp/SMS deep-link from the PWA, with the last notification tracked and shown on both PWA and desktop.

**Architecture:** Client-side deep-link — the server only *records* the notification; the messaging app on the operator's phone does the actual send. Two new columns on `orders` hold the last notification. PWA gets two pure helper libs (phone normalisation, message/URL building), a bottom sheet, and an OrderDetail trigger + badge. bloom-crm gets a migration, a phone field in the order payload, a record endpoint, and a read-only desktop badge.

**Tech Stack:** Node/Express + Postgres (bloom-crm), Vite + React + TypeScript + TanStack Query + Vitest (bloom-direct-orders).

**Spec:** `bloom-direct-orders/docs/superpowers/specs/2026-06-24-customer-ready-notification-design.md`

**Two repos:**
- bloom-crm at `C:\Users\pete_\Claude app\bloom-crm`
- bloom-direct-orders at `C:\Users\pete_\Claude app\bloom-direct-orders`

---

## File Structure

**bloom-crm (server):**
- Modify `server/index.mjs` — migration (2 columns on `orders`), `GET /api/orders/:id` (attach primary-contact phone to `customer`), new `POST /api/orders/:id/notify`, bump `APP_VERSION`.
- Modify `src/pages/OrderDetail.tsx` — read-only "notified" badge near status.

**bloom-direct-orders (PWA):**
- Create `src/lib/phone.ts` + `src/lib/phone.test.ts` — Cyprus phone normalisation.
- Create `src/lib/notify-message.ts` + `src/lib/notify-message.test.ts` — message template + channel URL builder.
- Modify `src/types/index.ts` — add notification fields to `Order`/`OrderDetail`.
- Modify `src/lib/queries.ts` — `useNotifyCustomer()` mutation.
- Create `src/components/NotifyCustomerSheet.tsx` — the send sheet.
- Modify `src/pages/OrderDetail.tsx` — button + auto-prompt + badge.
- Modify `src/main.tsx` — bump `SW_RESET_VERSION`.

---

## Task 1: Migration — add notification columns to `orders` (bloom-crm)

**Files:**
- Modify: `server/index.mjs` (migration section, near the `order_amendments` table creation ~L7510)

- [ ] **Step 1: Add the two columns**

Find the line that creates the `order_amendments` table:
```
    CREATE TABLE IF NOT EXISTS order_amendments (
```
Immediately BEFORE that `CREATE TABLE IF NOT EXISTS order_amendments` block, add:

```javascript
  // Customer "order ready" notification tracking (last notification only).
  // timestamptz (not DATE) so the badge can show time-of-day, unlike the
  // orders.created_at / updated_at DATE columns.
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_notified_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_notified_channel TEXT`);

```

- [ ] **Step 2: Syntax-check the server file**

Run: `cd "C:\Users\pete_\Claude app\bloom-crm" && node --check server/index.mjs`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
cd "C:\Users\pete_\Claude app\bloom-crm"
git add server/index.mjs
git commit -m "feat(orders): add customer_notified_at/channel columns"
```

---

## Task 2: Attach primary-contact phone to order detail payload (bloom-crm)

The PWA `Customer.phone` field exists but the order payload's `customer` comes from `SELECT * FROM customers`, which has no phone column (phone lives in `customer_contacts`). Attach it.

**Files:**
- Modify: `server/index.mjs` — `GET /api/orders/:id` handler (~L4282)

- [ ] **Step 1: Fetch + attach the primary contact phone**

Find this block in `GET /api/orders/:id`:
```javascript
    const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1', [order.customer_id]);
    const customer = customerResult.rows[0] || null;
```

Replace it with:
```javascript
    const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1', [order.customer_id]);
    const customer = customerResult.rows[0] || null;

    // Attach the customer's phone for the PWA "notify customer" feature.
    // Phone lives on customer_contacts, not customers — prefer the primary
    // contact, fall back to any contact that has a phone.
    if (customer) {
      const contactResult = await pool.query(
        `SELECT phone FROM customer_contacts
          WHERE customer_id = $1 AND phone <> ''
          ORDER BY is_primary DESC
          LIMIT 1`,
        [order.customer_id],
      );
      customer.phone = contactResult.rows[0]?.phone || '';
    }
```

- [ ] **Step 2: Syntax-check**

Run: `cd "C:\Users\pete_\Claude app\bloom-crm" && node --check server/index.mjs`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
cd "C:\Users\pete_\Claude app\bloom-crm"
git add server/index.mjs
git commit -m "feat(orders): attach primary-contact phone to order detail payload"
```

---

## Task 3: `POST /api/orders/:id/notify` endpoint (bloom-crm)

**Files:**
- Modify: `server/index.mjs` — add after the `PATCH /api/orders/:id` handler (ends ~L4372, the handler that returns `res.json(rows[0])` / `res.status(500).json({ error: 'server_error' })`)

- [ ] **Step 1: Add the endpoint**

Immediately AFTER the closing `});` of `app.patch('/api/orders/:id', ...)` (the one ending with `res.status(500).json({ error: 'server_error' });`), insert:

```javascript
// POST /api/orders/:id/notify — record that the customer was notified the
// order is ready. The PWA opens Viber/WhatsApp/SMS on the operator's device;
// this only persists the last notification (timestamp + channel) for the
// "✓ Ειδοποιήθηκε" badge on PWA + desktop. Auth: global /api requireAuth gate.
const VALID_NOTIFY_CHANNELS = ['VIBER', 'WHATSAPP', 'SMS'];
app.post('/api/orders/:id/notify', async (req, res) => {
  try {
    const channel = String(req.body?.channel || '').toUpperCase();
    if (!VALID_NOTIFY_CHANNELS.includes(channel)) {
      return res.status(400).json({ error: 'channel must be one of: VIBER, WHATSAPP, SMS' });
    }
    const { rows } = await pool.query(
      `UPDATE orders
          SET customer_notified_at = NOW(),
              customer_notified_channel = $1,
              updated_at = NOW()
        WHERE id = $2
      RETURNING *`,
      [channel, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('POST /api/orders/:id/notify failed:', err);
    return res.status(500).json({ error: 'server_error' });
  }
});
```

- [ ] **Step 2: Syntax-check**

Run: `cd "C:\Users\pete_\Claude app\bloom-crm" && node --check server/index.mjs`
Expected: exit 0.

- [ ] **Step 3: Confirm the route auto-classifies as ADMIN (fail-closed self-test)**

The server has a startup self-test (`assertEveryApiRouteIsClassified`) that fails if a route isn't classified. `POST /api/orders/:id/notify` is NOT in any PUBLIC_* list, so it defaults to ADMIN (requireAuth) — which is correct. No registry change needed. Just confirm there's no new public entry to add.

Run: `cd "C:\Users\pete_\Claude app\bloom-crm" && grep -n "orders/:id/notify\|'/notify'" server/index.mjs`
Expected: only the new handler line — no PUBLIC_* registration.

- [ ] **Step 4: Commit**

```bash
cd "C:\Users\pete_\Claude app\bloom-crm"
git add server/index.mjs
git commit -m "feat(api): POST /api/orders/:id/notify records customer notification"
```

---

## Task 4: PWA — `phone.ts` Cyprus normalisation (TDD)

**Files:**
- Create: `src/lib/phone.ts`
- Test: `src/lib/phone.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/phone.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { normalizeCyprusPhone } from './phone';

describe('normalizeCyprusPhone', () => {
  it('prepends +357 to a bare 8-digit mobile (starts 9)', () => {
    expect(normalizeCyprusPhone('99123456')).toBe('+35799123456');
  });

  it('prepends +357 to a bare 8-digit landline (starts 2)', () => {
    expect(normalizeCyprusPhone('22123456')).toBe('+35722123456');
  });

  it('keeps an already +357 number, stripping spaces', () => {
    expect(normalizeCyprusPhone('+357 99 123456')).toBe('+35799123456');
  });

  it('converts a 00357 prefix to +357', () => {
    expect(normalizeCyprusPhone('0035799123456')).toBe('+35799123456');
  });

  it('handles a 357-prefixed number without +', () => {
    expect(normalizeCyprusPhone('35799123456')).toBe('+35799123456');
  });

  it('returns empty string for null/empty/garbage', () => {
    expect(normalizeCyprusPhone(null)).toBe('');
    expect(normalizeCyprusPhone('')).toBe('');
    expect(normalizeCyprusPhone('   ')).toBe('');
  });

  it('falls back to +<digits> for an unrecognised foreign number', () => {
    // e.g. a German number stored verbatim — surface it for verification,
    // do NOT assume +357.
    expect(normalizeCyprusPhone('00491701234567')).toBe('+491701234567');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:\Users\pete_\Claude app\bloom-direct-orders" && npx vitest run src/lib/phone.test.ts`
Expected: FAIL — "Failed to resolve import './phone'".

- [ ] **Step 3: Write the implementation**

Create `src/lib/phone.ts`:
```typescript
/**
 * Normalises a stored phone string to an international E.164-ish form for
 * deep-link messaging (Viber / WhatsApp / SMS).
 *
 * Cyprus numbers are stored inconsistently ("99123456", "+357 99 123456",
 * "00357..."). The sheet that uses this ALWAYS shows the resolved number so
 * the operator verifies the recipient before sending — we never silently
 * send to an ambiguous number, hence the "surface, don't guess" fallback.
 *
 * Rules:
 *   - strip all non-digits
 *   - "00357…"  → "+357…"   (drop the international 00 prefix)
 *   - "357…"    → "+357…"
 *   - 8 digits starting 2 or 9 (CY landline / mobile) → "+357…"
 *   - "0049…" / other "00…" → "+…" (drop 00, keep country code as given)
 *   - anything else → "+<digits>"  (surface for verification)
 */
export function normalizeCyprusPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('00357')) return '+357' + digits.slice(5);
  if (digits.startsWith('357')) return '+' + digits;
  if (digits.length === 8 && /^[29]/.test(digits)) return '+357' + digits;
  if (digits.startsWith('00')) return '+' + digits.slice(2);
  return '+' + digits;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:\Users\pete_\Claude app\bloom-direct-orders" && npx vitest run src/lib/phone.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\pete_\Claude app\bloom-direct-orders"
git add src/lib/phone.ts src/lib/phone.test.ts
git commit -m "feat(phone): Cyprus phone normalisation helper (TDD)"
```

---

## Task 5: PWA — `notify-message.ts` template + URL builder (TDD)

**Files:**
- Create: `src/lib/notify-message.ts`
- Test: `src/lib/notify-message.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/notify-message.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildReadyMessage, buildChannelUrl } from './notify-message';

describe('buildReadyMessage', () => {
  it('interpolates customer name and order number', () => {
    expect(buildReadyMessage('Λεπτή Κήπων', 'ORD-2026-056')).toBe(
      'Γεια σας Λεπτή Κήπων, η παραγγελία σας ORD-2026-056 είναι έτοιμη και μπορείτε να την παραλάβετε από τα Φυτώρια μας. Ευχαριστούμε!',
    );
  });

  it('omits the name when it is empty', () => {
    expect(buildReadyMessage('', 'ORD-2026-056')).toBe(
      'Γεια σας, η παραγγελία σας ORD-2026-056 είναι έτοιμη και μπορείτε να την παραλάβετε από τα Φυτώρια μας. Ευχαριστούμε!',
    );
  });
});

describe('buildChannelUrl', () => {
  const phone = '+35799123456';
  const msg = 'Γεια σας';

  it('builds a Viber deep-link with +-encoded number and no text', () => {
    expect(buildChannelUrl('VIBER', phone, msg)).toBe('viber://chat?number=%2B35799123456');
  });

  it('builds a wa.me link with the number sans + and an encoded text', () => {
    expect(buildChannelUrl('WHATSAPP', phone, msg)).toBe(
      'https://wa.me/35799123456?text=' + encodeURIComponent(msg),
    );
  });

  it('builds an iOS sms link with &body=', () => {
    expect(buildChannelUrl('SMS', phone, msg, false)).toBe(
      'sms:+35799123456&body=' + encodeURIComponent(msg),
    );
  });

  it('builds an Android sms link with ?body=', () => {
    expect(buildChannelUrl('SMS', phone, msg, true)).toBe(
      'sms:+35799123456?body=' + encodeURIComponent(msg),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:\Users\pete_\Claude app\bloom-direct-orders" && npx vitest run src/lib/notify-message.test.ts`
Expected: FAIL — "Failed to resolve import './notify-message'".

- [ ] **Step 3: Write the implementation**

Create `src/lib/notify-message.ts`:
```typescript
export type NotifyChannel = 'VIBER' | 'WHATSAPP' | 'SMS';

/**
 * Default "order ready" message. Greeting drops the name gracefully when it's
 * empty (e.g. unknown customer) so we never produce "Γεια σας ,".
 */
export function buildReadyMessage(customerName: string, orderNumber: string): string {
  const name = (customerName || '').trim();
  const greeting = name ? `Γεια σας ${name}` : 'Γεια σας';
  return `${greeting}, η παραγγελία σας ${orderNumber} είναι έτοιμη και μπορείτε να την παραλάβετε από τα Φυτώρια μας. Ευχαριστούμε!`;
}

/**
 * Builds the per-channel deep-link.
 * - Viber CANNOT pre-fill text → URL carries only the number; caller copies
 *   the message to the clipboard separately.
 * - WhatsApp wants the number WITHOUT a leading + (wa.me/35799…).
 * - SMS pre-fills body; iOS uses &body=, Android uses ?body=.
 */
export function buildChannelUrl(
  channel: NotifyChannel,
  phoneE164: string,
  message: string,
  isAndroid = false,
): string {
  const digits = phoneE164.replace(/\D/g, ''); // e.g. "35799123456"
  const enc = encodeURIComponent(message);
  switch (channel) {
    case 'VIBER':
      return `viber://chat?number=%2B${digits}`;
    case 'WHATSAPP':
      return `https://wa.me/${digits}?text=${enc}`;
    case 'SMS':
      return isAndroid ? `sms:+${digits}?body=${enc}` : `sms:+${digits}&body=${enc}`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:\Users\pete_\Claude app\bloom-direct-orders" && npx vitest run src/lib/notify-message.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\pete_\Claude app\bloom-direct-orders"
git add src/lib/notify-message.ts src/lib/notify-message.test.ts
git commit -m "feat(notify): message template + channel URL builder (TDD)"
```

---

## Task 6: PWA — types + `useNotifyCustomer` mutation

**Files:**
- Modify: `src/types/index.ts` (the `Order` interface ~L? and `OrderDetail`)
- Modify: `src/lib/queries.ts`

- [ ] **Step 1: Add notification fields to the Order type**

In `src/types/index.ts`, find the `Order` interface (the one with `status`, `delivery_date`, `order_number`). Add these two fields inside it:
```typescript
  customer_notified_at?: string | null;
  customer_notified_channel?: 'VIBER' | 'WHATSAPP' | 'SMS' | null;
```

- [ ] **Step 2: Add the mutation hook**

In `src/lib/queries.ts`, find the existing `useCreateAmendment` hook. Immediately after it, add:
```typescript
import type { NotifyChannel } from './notify-message';

export function useNotifyCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, channel }: { orderId: string; channel: NotifyChannel }) => {
      return apiFetch<Order>(`/api/orders/${orderId}/notify`, {
        method: 'POST',
        body: JSON.stringify({ channel }),
      });
    },
    onSuccess: (_data, { orderId }) => {
      void qc.invalidateQueries({ queryKey: ['order', orderId] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
```

If `import type { NotifyChannel }` causes a duplicate-import lint issue (queries.ts may already import from `./notify-message` — it won't yet, but check), place the import with the other top-of-file imports instead of inline. Verify `Order`, `apiFetch`, `useMutation`, `useQueryClient` are already imported in queries.ts (they are — used by existing hooks).

- [ ] **Step 3: Typecheck**

Run: `cd "C:\Users\pete_\Claude app\bloom-direct-orders" && npm run lint`
Expected: no errors (exit 0).

- [ ] **Step 4: Commit**

```bash
cd "C:\Users\pete_\Claude app\bloom-direct-orders"
git add src/types/index.ts src/lib/queries.ts
git commit -m "feat(queries): useNotifyCustomer mutation + Order notify fields"
```

---

## Task 7: PWA — `NotifyCustomerSheet` component

**Files:**
- Create: `src/components/NotifyCustomerSheet.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/NotifyCustomerSheet.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MobileSheet } from './MobileSheet';
import { normalizeCyprusPhone } from '@/lib/phone';
import { buildReadyMessage, buildChannelUrl, type NotifyChannel } from '@/lib/notify-message';
import { useNotifyCustomer } from '@/lib/queries';

interface Props {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  customerName: string;
  /** Phone from the order's primary contact (may be empty). */
  customerPhone: string | null | undefined;
}

const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

const CHANNELS: { id: NotifyChannel; label: string; bg: string }[] = [
  { id: 'VIBER', label: 'Viber', bg: '#7360F2' },
  { id: 'WHATSAPP', label: 'WhatsApp', bg: '#25D366' },
  { id: 'SMS', label: 'SMS', bg: 'var(--sage-700)' },
];

export default function NotifyCustomerSheet({
  open, onClose, orderId, orderNumber, customerName, customerPhone,
}: Props) {
  const notify = useNotifyCustomer();
  const [message, setMessage] = useState('');
  const [phoneInput, setPhoneInput] = useState('');

  // Re-seed the editable fields each time the sheet opens for a fresh order.
  useEffect(() => {
    if (open) {
      setMessage(buildReadyMessage(customerName, orderNumber));
      setPhoneInput(customerPhone || '');
    }
  }, [open, customerName, orderNumber, customerPhone]);

  const resolvedPhone = normalizeCyprusPhone(phoneInput);
  const canSend = resolvedPhone.length >= 8; // "+357" + at least a few digits

  async function send(channel: NotifyChannel) {
    if (!canSend) {
      toast.error('Συμπλήρωσε ένα έγκυρο τηλέφωνο');
      return;
    }
    // Viber can't pre-fill text → copy to clipboard so the operator pastes.
    if (channel === 'VIBER') {
      try {
        await navigator.clipboard?.writeText(message);
        toast.success('Μήνυμα αντιγράφηκε — κάνε paste στο Viber');
      } catch {
        toast.message('Αντίγραψε το μήνυμα χειροκίνητα πριν στείλεις');
      }
    }
    // Record the notification (fire-and-forget UX — don't block opening Viber).
    notify.mutate({ orderId, channel });
    // Open the messaging app.
    window.location.href = buildChannelUrl(channel, resolvedPhone, message, isAndroid);
    onClose();
  }

  return (
    <MobileSheet open={open} onClose={onClose} title="Ειδοποίηση πελάτη">
      <div style={{ padding: '4px 4px 8px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Phone */}
        <div>
          <label
            className="text-eyebrow"
            style={{ display: 'block', marginBottom: 6, color: 'var(--ink-500)' }}
          >
            Τηλέφωνο πελάτη
          </label>
          <input
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            inputMode="tel"
            placeholder="π.χ. 99123456"
            style={{
              width: '100%', height: 44, padding: '0 12px',
              border: '1px solid rgba(63,75,70,0.18)', borderRadius: 12,
              fontSize: 15, outline: 'none', background: '#fff',
            }}
          />
          <div
            className="font-mono-meta"
            style={{ fontSize: 12, color: canSend ? 'var(--sage-700)' : 'var(--clay)', marginTop: 6 }}
          >
            {resolvedPhone ? `Αποστολή σε: ${resolvedPhone}` : 'Δεν υπάρχει τηλέφωνο — πρόσθεσέ το'}
          </div>
        </div>

        {/* Message */}
        <div>
          <label
            className="text-eyebrow"
            style={{ display: 'block', marginBottom: 6, color: 'var(--ink-500)' }}
          >
            Μήνυμα
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            style={{
              width: '100%', padding: 12, resize: 'vertical',
              border: '1px solid rgba(63,75,70,0.18)', borderRadius: 12,
              fontSize: 15, lineHeight: 1.4, outline: 'none', background: '#fff',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Channels */}
        <div style={{ display: 'flex', gap: 8 }}>
          {CHANNELS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => void send(c.id)}
              disabled={!canSend}
              className="ios-tap"
              style={{
                flex: 1, height: 50, borderRadius: 14, border: 0,
                background: canSend ? c.bg : 'var(--cream-200)',
                color: canSend ? '#fff' : 'var(--ink-500)',
                fontSize: 15, fontWeight: 600,
                cursor: canSend ? 'pointer' : 'default',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </MobileSheet>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "C:\Users\pete_\Claude app\bloom-direct-orders" && npm run lint`
Expected: exit 0. If `MobileSheet` is a named export (it is — `export function MobileSheet`), the import `{ MobileSheet }` is correct.

- [ ] **Step 3: Commit**

```bash
cd "C:\Users\pete_\Claude app\bloom-direct-orders"
git add src/components/NotifyCustomerSheet.tsx
git commit -m "feat(notify): NotifyCustomerSheet — editable message + 3 channels"
```

---

## Task 8: PWA — OrderDetail trigger (button + auto-prompt + badge)

**Files:**
- Modify: `src/pages/OrderDetail.tsx`

- [ ] **Step 1: Add imports + state**

At the top of `src/pages/OrderDetail.tsx`, add to the lucide-react import (which already imports several icons) the `Send` and `Check` icons if not present — `Check` is already imported (used by edit mode). Add `Send`:
Change the lucide import line to include `Send` (append it to the existing destructured list).

Add the component import near the other component imports (e.g. after `import OrderSupplierBreakdownView ...`):
```typescript
import NotifyCustomerSheet from '@/components/NotifyCustomerSheet';
```

Add `fmtLongDate` usage is already imported; we also need a short date/time format. Add this small helper near the top of the file (after imports, before the component) — only if a date+time formatter isn't already present:
```typescript
function fmtNotifiedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('el-GR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}
```

Inside the component, with the other `useState` declarations (near `presentTotalOpen`), add:
```typescript
  const [notifyOpen, setNotifyOpen] = useState(false);
```

- [ ] **Step 2: Auto-prompt on transition to READY**

Find the `changeStatus` function in OrderDetail:
```typescript
  async function changeStatus(next: OrderStatus) {
    try {
      await patch.mutateAsync({ id: order.id, status: next });
      toast.success(`Status: ${STATUS_LABEL_GR[next]}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Σφάλμα');
    }
  }
```

Replace the body with:
```typescript
  async function changeStatus(next: OrderStatus) {
    try {
      await patch.mutateAsync({ id: order.id, status: next });
      toast.success(`Status: ${STATUS_LABEL_GR[next]}`);
      // Auto-open the customer notification sheet the moment an order
      // becomes READY — the operator usually wants to message right away.
      if (next === 'READY') setNotifyOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Σφάλμα');
    }
  }
```

- [ ] **Step 3: Add the permanent button + badge in the status-actions section**

Find the status-actions `<section>` that renders the next-status buttons (it begins with a comment/`<div className="folio">` containing `Επόμενη ενέργεια` and maps `nextStatuses`). Immediately BEFORE that section (or at the top of it), insert this block that shows the notify button + badge when the order is READY:

```tsx
      {/* Customer notification — only meaningful once the order is READY. */}
      {order.status === 'READY' && (
        <section style={{ padding: '20px 20px 0' }}>
          <button
            type="button"
            onClick={() => setNotifyOpen(true)}
            className="btn-primary ios-tap"
            style={{ height: 50 }}
          >
            <Send size={16} color="var(--cream-50)" strokeWidth={1.9} />
            Ειδοποίηση πελάτη
          </button>
          {order.customer_notified_at && (
            <div
              className="font-mono-meta"
              style={{
                marginTop: 8, fontSize: 12, color: 'var(--sage-700)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Check size={13} strokeWidth={2.4} />
              Ειδοποιήθηκε {fmtNotifiedAt(order.customer_notified_at)}
              {order.customer_notified_channel ? ` · ${order.customer_notified_channel}` : ''}
            </div>
          )}
        </section>
      )}
```

- [ ] **Step 4: Mount the sheet**

Near the other sheets at the bottom of the returned JSX (after `<OrderSupplierBreakdownView ... />`), add:
```tsx
      <NotifyCustomerSheet
        open={notifyOpen}
        onClose={() => setNotifyOpen(false)}
        orderId={order.id}
        orderNumber={order.order_number}
        customerName={customerName}
        customerPhone={customer?.phone}
      />
```
(`customerName` and `customer` are already in scope in this component.)

- [ ] **Step 5: Typecheck + build**

Run: `cd "C:\Users\pete_\Claude app\bloom-direct-orders" && npm run lint && npm run build`
Expected: lint exit 0; build completes ("files generated").

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\pete_\Claude app\bloom-direct-orders"
git add src/pages/OrderDetail.tsx
git commit -m "feat(order-detail): notify-customer button, auto-prompt on READY, badge"
```

---

## Task 9: PWA — bump SW reset + full test run + push

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: Bump SW_RESET_VERSION**

In `src/main.tsx`, find:
```typescript
const SW_RESET_VERSION = '2026-06-02-daykey-v4';
```
(or whatever the current value is — it may differ). Change it to:
```typescript
const SW_RESET_VERSION = '2026-06-24-notify-v6';
```

- [ ] **Step 2: Run the full PWA suite**

Run: `cd "C:\Users\pete_\Claude app\bloom-direct-orders" && npm run lint && npm run test:run && npm run build`
Expected: lint exit 0; all tests pass (existing 77 + 13 new = 90); build completes.

- [ ] **Step 3: Commit + push PWA**

```bash
cd "C:\Users\pete_\Claude app\bloom-direct-orders"
git add src/main.tsx
git commit -m "chore(pwa): bump SW reset for notify feature"
git push origin main
```

---

## Task 10: bloom-crm — desktop read-only badge + version + push

**Files:**
- Modify: `src/pages/OrderDetail.tsx` (bloom-crm desktop)
- Modify: `src/lib/version.ts` (bloom-crm)

- [ ] **Step 1: Locate where status is shown on the desktop order detail**

Run: `cd "C:\Users\pete_\Claude app\bloom-crm" && grep -n "status\|STATUS_PRESENTATION\|order.status" src/pages/OrderDetail.tsx | head -20`
Identify the JSX near the status chip/header where a small badge fits.

- [ ] **Step 2: Add the read-only badge**

In bloom-crm `src/pages/OrderDetail.tsx`, near the status display, add a conditional badge that reads the two new fields. Use the existing className conventions of that file (it uses Tailwind). Insert:
```tsx
{order.customer_notified_at && (
  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
    ✓ Ειδοποιήθηκε {new Date(order.customer_notified_at).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
    {order.customer_notified_channel ? ` · ${order.customer_notified_channel}` : ''}
  </span>
)}
```
If the desktop `Order` TypeScript type doesn't include the new fields, add them to that type (search `customer_notified_at` returns nothing → add `customer_notified_at?: string | null;` and `customer_notified_channel?: string | null;` to the desktop `Order` interface in `src/types/index.ts`).

- [ ] **Step 3: Bump APP_VERSION**

In bloom-crm `src/lib/version.ts`, bump the PATCH/MINOR (new feature → MINOR):
```typescript
export const APP_VERSION = '1.9.0';
```
(Use the next value above the current one — if current is 1.8.1, use 1.9.0.)

- [ ] **Step 4: Typecheck + test + build**

Run: `cd "C:\Users\pete_\Claude app\bloom-crm" && npm run test && npm run build`
Expected: all tests pass; build completes.

- [ ] **Step 5: Commit + push bloom-crm**

```bash
cd "C:\Users\pete_\Claude app\bloom-crm"
git add src/pages/OrderDetail.tsx src/types/index.ts src/lib/version.ts
git commit -m "feat(order-detail): read-only customer-notified badge; v1.9.0"
git push origin main
```

---

## Task 11: Post-deploy verification

- [ ] **Step 1: Confirm both deploys succeeded**

Run:
```bash
cd "C:\Users\pete_\Claude app\bloom-crm" && gh run list --workflow=deploy.yml --limit 1
cd "C:\Users\pete_\Claude app\bloom-direct-orders" && gh run list --workflow=deploy.yml --limit 1
```
Expected: both `completed success`. If a bloom-crm SSH timeout occurs, `gh run rerun <id>` (transient — per memory note).

- [ ] **Step 2: Confirm the migration applied (columns exist)**

The `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` runs on server boot. Confirm the endpoint works against production with a real auth token (from the browser's `bdo_token`):
```bash
curl -s -X POST "https://smartquotations.eu/api/orders/<known-READY-order-id>/notify" \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"channel":"SMS"}' | head -c 300
```
Expected: JSON of the updated order with `customer_notified_at` set and `customer_notified_channel: "SMS"`. (Use a test order — this sets the badge.)

- [ ] **Step 3: Smoke test on the device**

On the iPhone PWA (force-close once for the SW reset): open a READY order → "Ειδοποίηση πελάτη" button shows → tap → sheet opens with the message + phone → tap WhatsApp → WhatsApp opens with the text pre-filled → return to app → badge "✓ Ειδοποιήθηκε …" shows. Repeat picking Viber → message is on the clipboard, Viber opens the chat, paste works.

---

## Self-Review Notes

- **Spec coverage:** migration (T1), phone in payload (T2), notify endpoint (T3), phone.ts (T4), notify-message.ts (T5), types + hook (T6), sheet (T7), trigger+auto-prompt+badge (T8), SW bump+tests (T9), desktop badge + version (T10), verification (T11). All spec sections covered.
- **Channel constant consistency:** server `VALID_NOTIFY_CHANNELS` and client `NotifyChannel` both use `VIBER|WHATSAPP|SMS` (uppercase). Endpoint upper-cases input defensively.
- **Phone field flows:** server attaches `customer.phone` (T2) → PWA `Customer.phone` (existing type field) → sheet `customerPhone` prop (T7) → `normalizeCyprusPhone` (T4). Consistent.
- **No silent send:** sheet always shows `resolvedPhone` and disables channel buttons when it's too short (T7).
- **SMS platform branch:** `buildChannelUrl` `isAndroid` param (T5) fed from a UA check in the sheet (T7).
