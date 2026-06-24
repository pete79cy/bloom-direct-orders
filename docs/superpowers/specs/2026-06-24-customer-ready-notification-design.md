# Customer "Order Ready" Notification — Design

**Date:** 2026-06-24
**Repos:** bloom-direct-orders (PWA, primary) + bloom-crm (server, minor)
**Status:** Approved, pending implementation plan

## Problem

When an operator marks an order as **READY** at the nursery, they want to
tell the customer "your order is ready, you can pick it up". Today this is a
manual, out-of-band step (find the phone, find the number, type the message).
We want a one-tap-assisted flow from the PWA.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Automation level | **One-tap assisted** (deep-link). The server does NOT send messages — it opens the Viber/WhatsApp/SMS app on the operator's phone with the recipient + message ready. |
| Where | **PWA only** (orders.smartquotations.eu). The operator is at the nursery with the phone in hand. |
| Channels | **Viber + WhatsApp + SMS** (three buttons). |
| Message text | **Editable** before sending. |
| Trigger | **Both**: auto-open the sheet right after status flips to READY, AND a permanent button on READY orders. |
| Tracking | **Yes**, visible on PWA **and** desktop. Record last notification (timestamp + channel). |
| Recording mechanism | **Two columns on `orders`** (not a separate table). Keeps only the last notification — exactly what the badge needs. Upgradeable to a log table later without UI change. |

## Why deep-link, not Viber Business API

Full automation needs a Viber Business account (cost, approval, GDPR opt-in,
message templates) — weeks of setup for a single-operator business. The
deep-link approach matches an **existing pattern already in bloom-crm** for
supplier messaging (`viber://chat?number=%2B${phone}` at server/index.mjs
~L3817). Zero account, zero cost, zero compliance burden.

**Viber limitation:** Viber deep-links **cannot pre-fill the message text**
(unlike WhatsApp's `wa.me/?text=` and SMS's `sms:?body=`). So the Viber path
copies the message to the clipboard and the operator pastes it. WhatsApp and
SMS pre-fill the text → true one-tap.

## Architecture

Client-side deep-link. The server only **records** that a notification was
sent; the messaging app on the device does the actual send.

```
Order READY
   ├─ (auto)   after tapping "→ Έτοιμη" → NotifyCustomerSheet opens
   └─ (manual) "📲 Ειδοποίηση πελάτη" button, always visible on READY orders
   │
   ▼
NotifyCustomerSheet:
   • editable message (pre-filled from template)
   • customer phone in +357 international form (verify before send; typeable if missing)
   • three channel buttons: Viber · WhatsApp · SMS
   │
   ▼ (tap a channel)
   • copy message to clipboard (Viber path only)
   • open the channel deep-link
   • POST /api/orders/:id/notify { channel }   ← records the notification
   │
   ▼
Badge "✓ Ειδοποιήθηκε 12/06 14:30 · Viber"  (PWA + desktop)
```

## Server changes (bloom-crm)

### Migration
Add to `orders`:
- `customer_notified_at` — nullable **`timestamptz`** (NOT `DATE`). The badge
  shows time-of-day ("12/06 14:30"), so a `DATE` column would lose the time.
  Note this differs from the existing `created_at`/`updated_at` `DATE` columns
  on `orders` — intentional, because those don't need sub-day precision.
- `customer_notified_channel` — nullable TEXT, one of `VIBER` | `WHATSAPP` | `SMS`

### New endpoint
`POST /api/orders/:id/notify` body `{ channel }`
- Validate `channel ∈ {VIBER, WHATSAPP, SMS}` → 400 otherwise
- `UPDATE orders SET customer_notified_at = NOW(), customer_notified_channel = $1 WHERE id = $2`
- 404 if order not found
- Return the updated order row
- Auth: behind the standard `/api` requireAuth gate (default ADMIN) — no new public route

### Payload additions
- Include `customer_notified_at` + `customer_notified_channel` in `GET /api/orders/:id` and `GET /api/orders`.
- Include the customer's **primary contact phone** in the `GET /api/orders/:id`
  payload (currently absent). Source: `customer_contacts` where
  `is_primary = true`, falling back to any contact with a phone.

## PWA changes (bloom-direct-orders)

### `src/lib/phone.ts` (new) — correctness-critical
Normalises Cyprus phone numbers (stored inconsistently: `99123456`,
`+357 99 123456`, `00357...`) to international `+357XXXXXXXX`:
- strip all non-digits
- if it starts with `357` → use as-is
- if 8 digits starting with `9` or `2` (CY mobile/landline) → prepend `357`
- if it starts with `00357` → drop the `00`
- otherwise → use the digits as given **and surface them for verification**

The sheet ALWAYS displays the resolved international number so the operator
verifies the recipient before sending. We never silently send to an
ambiguous number. Unit-tested.

### `src/lib/notify-message.ts` (new)
Builds the default message from a template:
> `Γεια σας {customerName}, η παραγγελία σας {orderNumber} είναι έτοιμη και μπορείτε να την παραλάβετε από τα Φυτώρια Πακκούτη. Ευχαριστούμε!`

And builds the per-channel deep-link URLs:
- Viber: `viber://chat?number=%2B357XXXXXXXX` (text NOT included — copied to clipboard separately)
- WhatsApp: `https://wa.me/357XXXXXXXX?text=<encoded>`
- SMS: `sms:+357XXXXXXXX&body=<encoded>` (iOS uses `&body=`, Android uses
  `?body=`; the builder picks based on a simple UA check. Primary target is
  iOS Safari PWA.)

Unit-tested for template interpolation + URL format.

### `src/components/NotifyCustomerSheet.tsx` (new)
Bottom sheet matching the existing sheet aesthetic:
- editable `<textarea>` pre-filled with the template
- resolved phone shown in `+357 …` form; if no phone on the order, an inline
  input lets the operator type one (used for that send; not persisted in v1)
- three channel buttons (Viber / WhatsApp / SMS); on tap:
  - copy message to clipboard via `navigator.clipboard.writeText` (Viber path
    shows a toast "Μήνυμα αντιγράφηκε — κάνε paste στο Viber")
  - `window.location.href = <channel deep-link>`
  - fire `POST /api/orders/:id/notify { channel }` (React Query mutation),
    invalidate `['order', id]` / `['orders']`
  - close the sheet

### `src/lib/queries.ts`
- `useNotifyCustomer()` mutation → `POST /api/orders/:id/notify`
- extend `OrderDetail` / `Order` types with `customer_notified_at`,
  `customer_notified_channel`, and the customer phone field

### `src/pages/OrderDetail.tsx`
- "📲 Ειδοποίηση πελάτη" button in the status-actions area when `status === 'READY'`
- after a successful status change to READY, auto-open NotifyCustomerSheet
- "✓ Ειδοποιήθηκε {date} · {channel}" badge when `customer_notified_at` is set

## Desktop changes (bloom-crm)
- `OrderDetail` (desktop): read-only "✓ Ειδοποιήθηκε {date} · {channel}" badge
  near the status, reading the same two columns. No send capability on desktop.

## Edge cases
- **No phone on order:** sheet shows an inline phone input rather than blocking.
- **Ambiguous phone format:** resolved number always shown for verification;
  never sent silently.
- **Clipboard API unavailable** (older webview): fall back to a selectable text
  block + toast "Αντίγραψε το μήνυμα χειροκίνητα".
- **Re-notify:** allowed; the columns just overwrite with the latest send. The
  badge reflects the most recent notification.
- **Status not READY:** button hidden; no auto-prompt.

## Scope boundaries (v1 — explicitly NOT included)
- No Viber Business API / true server-side send.
- No full notification history log (single last-notification only).
- No persisting a typed-in phone back to the customer record.
- No desktop send button (desktop is read-only badge).
- Button shown for READY only (not PREPARING / PARTIALLY_DELIVERED).

## Testing
- `phone.ts`: Cyprus formats — 8-digit mobile, 8-digit landline, `+357` with
  spaces, `00357`, already-normalised, garbage input.
- `notify-message.ts`: template interpolation; each channel's URL format and
  encoding.
- Server: `POST /api/orders/:id/notify` records both columns; rejects invalid
  channel (400); 404 on unknown order.
- (Existing PWA + CRM test suites must stay green.)
