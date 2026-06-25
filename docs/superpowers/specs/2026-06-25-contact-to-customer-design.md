# Add Customer From Phone Contact — Design

**Date:** 2026-06-25
**Repos:** bloom-direct-orders (PWA, primary) + bloom-crm (one small server tweak — `POST /api/customers` must accept `email` and store it on the primary contact, mirroring how `phone` is already handled).
**Status:** Approved, pending implementation plan

## Problem

The operator wants to add a person from the iPhone's contact list as a new
customer, without re-typing the name and phone. i.e. "open my contacts → pick
one → it becomes a new customer, pre-filled".

## The iOS constraint (why this design)

There is **no web API to read the phone's contacts on iOS Safari / PWA**. The
W3C Contact Picker API (`navigator.contacts.select()`) exists only in Chrome
on Android; Apple has not shipped it in Safari. The Web Share Target API
(receiving a shared contact) is likewise Android/Chromium-only. So a button
inside the PWA cannot open the iPhone's contact list.

**The viable iOS path is the reverse: the contact app pushes to us.** An Apple
Shortcut (built once by the user) sits in the Contacts share sheet. The user
shares a contact to it; the Shortcut extracts name + phone and opens a deep
link into the PWA's new-customer form, pre-filled. The user reviews and saves.

### Data location (clarified with user)
The customer is created via the SAME `POST /api/customers` used everywhere
(desktop, PWA, this flow) → the SAME central `customers` table. The customer
appears everywhere immediately. Nothing is stored "separately". The only
per-browser-separate thing is the **login token** (iOS keeps localStorage
separate between Safari and the standalone PWA), so the first time the
Shortcut opens the form in Safari the user logs in once (with "Remember me",
60-day token). That is an auth-session nuance, not a data nuance.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Direction | Import a contact → pre-fill new-customer form (not export). |
| iOS mechanism | Apple Shortcut → deep link `/customers/new?name=…&phone=…&email=…`. |
| Fields carried | name + phone + email (email included when the contact has one). |
| After save | Prompt "Νέα παραγγελία τώρα;" → New Order wizard with the customer preselected; or "Τέλος" → Home. |
| Discoverability | A small "+ Από επαφή" help/reminder affordance on Home explaining the Shortcut. |

## Architecture / Flow

```
iPhone Contacts → Share → "Add to Bloom" (Apple Shortcut, built once)
   │  Shortcut reads the contact's name + phone, URL-encodes them
   ▼
Opens (in Safari): https://orders.smartquotations.eu/customers/new?name=…&phone=…&email=…
   │  RequireAuth — log in once in Safari if needed (Remember me)
   ▼
AddCustomerPage: new-customer form PRE-FILLED (name → trading_name, phone → phone, email → email)
   │  operator can edit, then taps Save → POST /api/customers
   ▼
Success: "✓ Προστέθηκε"
   ├─ "Νέα παραγγελία τώρα;" → /orders/new with presetCustomer
   └─ "Τέλος" → /
```

## Server change (bloom-crm)

`POST /api/customers` already accepts `phone` and writes it to a primary
`customer_contacts` row (added in v1.10.1). Extend that:
- Accept `email` from the body.
- Include the email in the primary-contact insert (the `customer_contacts`
  row already has an `email` column — currently passed as `''`).
- Create the primary-contact row when EITHER a phone OR an email is provided
  (change the existing `if (phoneTrimmed)` guard to `if (phoneTrimmed || emailTrimmed)`).
- Echo `email` on the returned row for client consistency (the `customers`
  table has no email column, same as phone).

No migration needed — `customer_contacts.email` already exists.

## PWA changes (bloom-direct-orders)

### New route
- `src/App.tsx`: add `<Route path="/customers/new" element={<RequireAuth><AddCustomerPage /></RequireAuth>} />`.

### New page `src/pages/AddCustomerPage.tsx`
- Reads `name`, `phone`, and `email` from `useSearchParams()`.
- Renders the new-customer form pre-filled. Reuses `useCreateCustomer` and the
  same field set as `NewCustomerSheet` (trading_name, legal_name, vat_id,
  phone, email, payment_terms_days defaulting to '0'). To stay DRY, extract the
  small presentational `Field` input from `NewCustomerSheet.tsx` into a shared
  `src/components/CustomerFormField.tsx` and import it in both places (the
  field is currently a local function in NewCustomerSheet — moving it is a
  targeted, in-scope improvement). Add an `email` field to `NewCustomerSheet`
  too while the form is being touched, so both entry points capture it and the
  `CreateCustomerPayload` gains an `email?: string`.
- Pre-fill mapping: `name` → `tradingName`, `phone` → `phone`, `email` →
  `email`. Empty/missing params → empty fields (form still usable).
- On save (success): switch to a success view with two buttons:
  - **"Νέα παραγγελία τώρα;"** → `navigate('/orders/new', { state: { presetCustomer: created } })`
  - **"Τέλος"** → `navigate('/')`

### Wizard preselect
- `src/pages/NewOrderWizard.tsx`: read an optional `location.state.presetCustomer`
  (a `Customer`). When present and there's no `duplicate` seed, initialise
  `customer` from it and start at Step 2 — WITHOUT the "Επανάληψη …" banner that
  the duplicate path shows. (Use a separate `presetCustomer` state key rather
  than reusing `duplicate` with empty lines, to keep the banner logic clean.)
  Clear `location.state` after consuming, same as the duplicate path does.

### Home reminder affordance
- `src/pages/Home.tsx`: a small, low-emphasis "+ Από επαφή" link/button that
  opens a short explanation sheet/toast: "Πρόσθεσε πελάτη από τις επαφές σου με
  το Shortcut «Add to Bloom»" plus a one-line how-to. This is purely
  discoverability — the actual entry point is the iOS Shortcut. Keep it subtle.

## iOS Shortcut (user builds once — documented, not code)

The spec ships step-by-step build instructions (the implementer adds them to a
short `docs/` note and the Home explanation). The Shortcut:
1. Accepts input from the Share Sheet, type **Contacts**.
2. Gets the contact's **Name**, **Phone Number** (first phone), and **Email**
   (first email, may be empty).
3. URL-encodes each.
4. Builds the URL `https://orders.smartquotations.eu/customers/new?name=<name>&phone=<phone>&email=<email>`.
5. **Open URLs**.
6. In Shortcut settings: enable **Show in Share Sheet**, accepts Contacts.

Result: every contact's Share sheet shows "Add to Bloom" → two taps → pre-filled
form.

## Edge cases
- **No phone on the contact:** form opens with name only; operator may add a
  phone or leave blank.
- **Malformed / missing query params:** form opens empty; no crash. Param values
  are rendered as React-controlled input values (auto-escaped — no injection).
- **Not logged in (Safari):** RequireAuth redirects to login; after login the
  user re-runs the Shortcut (or we preserve the intended URL — nice-to-have,
  not required for v1).
- **Long/odd names:** stored as-is in `trading_name`; operator can edit before
  saving.

## Scope boundaries (v1 — explicitly NOT included)
- No Android Contacts Picker button (the user is on iPhone; can be added later
  behind a `'contacts' in navigator` feature check without touching this flow).
- No duplicate-customer detection on this path (create as normal; dedupe is a
  separate concern).
- We do not auto-install the Shortcut (impossible) — we document it.

## Testing
- `AddCustomerPage`: given `?name=Foo&phone=99123456&email=foo@bar.gr`, the
  trading-name, phone, and email fields show those values (render test with a
  MemoryRouter + initial entry).
- `AddCustomerPage`: empty params → empty fields, Save disabled until a trading
  name is entered.
- Save calls `useCreateCustomer` with `{ trading_name, phone, email, payment_terms_days: 0 }`
  (mock the mutation; assert payload).
- Wizard: `location.state.presetCustomer` initialises the selected customer and
  starts at Step 2 with no "Επανάληψη" banner.
- Server (manual / node --check): `POST /api/customers` with `email` only (no
  phone) still creates the primary-contact row.
- Existing PWA suite stays green.
