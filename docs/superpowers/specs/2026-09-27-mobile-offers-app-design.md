# Bloom Offers — Mobile PWA για Προσφορές (Design)

**Date:** 2026-09-27
**Repos:** νέο repo `bloom-offers` (PWA, κλώνος του `bloom-direct-orders`) + `bloom-crm` (3 νέα endpoints + CORS)
**Status:** Draft για έγκριση

---

## 1. Τι φτιάχνουμε

Ένα **δεύτερο mobile PWA, ίδιο 1:1 σε stack, UI και δομή με το Bloom Direct
Orders**, που αντί για παραγγελίες (`orders` / `order_lines`) δημιουργεί και
διαχειρίζεται **προσφορές** (`quotes` / `quote_lines`) στη βάση του bloom-crm.

| | Direct Orders (υπάρχει) | Offers (νέο) |
|---|---|---|
| Domain | `orders.smartquotations.eu` | `offers.smartquotations.eu` |
| Dev port | 5174 | 5175 |
| Οντότητα | `orders` + `order_lines` | `quotes` + `quote_lines` |
| Αρίθμηση | `ORD-YYYY-NNN` | `QT-YYYY-NNN` (ήδη υπάρχει `nextQuoteNumberFromDb`) |
| Κύκλος ζωής | PENDING → … → INVOICED | DRAFT → SENT → ACCEPTED → CONVERTED (ή REJECTED / EXPIRED) |
| Token key | `bdo_token` | `bof_token` |
| Manifest | "Bloom Orders" | "Bloom Offers" |

**Χρήστης:** ο ίδιος πωλητής, στο iPhone, στο φυτώριο του πελάτη. Θέλει σε
2 λεπτά να βγάλει προσφορά, να την στείλει PDF (Viber / WhatsApp / Gmail) και
όταν ο πελάτης πει «ναι» να την κάνει παραγγελία με ένα tap.

**Non-goals (μένουν στο desktop bloom-crm):** revisions προσφοράς,
εναλλακτικές γραμμές (`is_alternative` / `line_group_id`), sourcing από
προμηθευτές, audit γραμμών, τιμές ομίλου (group pricing), competitor prices.

---

## 2. Γιατί ξεχωριστό app (και όχι tab μέσα στο Direct Orders)

Ο χρήστης ζήτησε «ακριβώς το ίδιο application». Επιπλέον:

- Το Direct Orders είναι σκόπιμα «ένα πράγμα, ένα flow». Ένα δεύτερο wizard
  με άλλο lifecycle μέσα στο ίδιο bottom nav το κάνει θολό.
- Ξεχωριστό PWA icon στο home screen = ξεχωριστό mental model («Παραγγελίες»
  vs «Προσφορές»).
- Deploy / SW updates ανεξάρτητα, ένα bug στο ένα δεν ρίχνει το άλλο.

Το κόστος είναι ~30 αρχεία που αντιγράφονται verbatim. Αποδεκτό — αν
αργότερα θέλουμε shared package, τα `lib/` και `components/` είναι ήδη
framework-free και εξάγονται εύκολα.

> Εναλλακτική που **απορρίπτεται**: να χρησιμοποιήσουμε το υπάρχον
> `MobileNewQuoteWizard` / `MobileQuoteDetail` του bloom-crm. Είναι μέσα στο
> desktop bundle, δουλεύει με cookie auth (δεν περνάει cross-subdomain), και
> στέλνει 52-column `quote_lines` payload μέσω `POST /api/quotes/save` με
> client-side αρίθμηση (`nextQuoteNumber(allQuotes)` = race condition). Το
> Direct Orders έλυσε ακριβώς αυτά τα προβλήματα με το `POST /api/direct-orders`.
> Κάνουμε το ίδιο για quotes.

---

## 3. Αρχιτεκτονική (ίδια με Direct Orders)

```
iPhone Safari PWA (offers.smartquotations.eu)
        │ HTTPS + JWT (Authorization: Bearer)
        ▼
bloom-crm Express API (smartquotations.eu/api/*)
        │ pg
        ▼
Postgres (quotes, quote_lines, quote_status_history, orders …)
        ▲
        │ desktop bloom-crm βλέπει την προσφορά αμέσως
```

Stack: Vite 8 · React 19 · TS · Tailwind + CSS vars · react-router v6 ·
TanStack Query v5 · sonner · lucide · jsPDF · vite-plugin-pwa · Sentry ·
Vitest / RTL / Playwright. **Καμία νέα εξάρτηση.**

---

## 4. Backend — αλλαγές στο `bloom-crm/server/index.mjs`

Κατ' αναλογία με το `POST /api/direct-orders`. Όλα με JWT auth (ίδιο
middleware με το Direct Orders).

### 4.1 `POST /api/direct-quotes` — ατομική δημιουργία

```jsonc
// Request
{
  "quote": {
    "customer_id": "c-…",            // required
    "issue_date": "2026-09-27",      // optional, default today
    "valid_until": "2026-10-27",     // optional, default +30 ημέρες
    "notes": "…", "terms": "…",       // optional
    "status": "DRAFT" | "SENT"       // optional, default DRAFT
  },
  "lines": [
    { "variant_id": "v-…", "qty": 10, "unit_sell_price": 4.5, "discount_pct": 0, "vat_rate": 19, "description": "…" },
    { "draft": { "name": "Λεβάντα", "size": "P2L" }, "qty": 5, "unit_sell_price": 3 }   // free-text line
  ]
}
// Response
{ "ok": true, "quoteId": "q-…", "quoteNumber": "QT-2026-142" }
```

Server-side:
1. Validation ίδια με direct-orders: κάθε γραμμή **ακριβώς ένα** από
   `variant_id` / `draft.name` (≥2 chars), `qty ≥ 1`, `unit_sell_price ≥ 0`.
2. `BEGIN` → `id = q-<epoch>` → `quote_number = nextQuoteNumberFromDb(client, issue_date)`.
3. INSERT `quotes` (`currency='EUR'`, `revision_no=0`, `created_by/updated_by = req.user.sub`).
4. Draft lines: ίδιο block με direct-orders (INSERT `plants` + `variants` με
   `status='draft'`, `variant_code = DRAFT-<plantId>`). **Εξαγωγή σε helper**
   `ensureDraftVariant(client, draft, today)` ώστε να μοιράζεται με το
   `/api/direct-orders` — όχι copy-paste.
5. INSERT `quote_lines` με μόνο τις στήλες που χρειάζονται:
   `id, quote_id, line_no, offered_variant_id, description_override, qty,
   unit_sell_price, discount_pct, vat_rate, supplier_procurement_status='READY'`.
   Όλα τα override / requested / audit πεδία μένουν στα defaults τους.
6. INSERT `quote_status_history` (`from=null, to=<status>, action='CREATE_QUOTE'`,
   `changed_by = req.user.name`).
7. Αν `status='SENT'`: τρέχει ο ίδιος guard `findUnpricedLines` → 422
   `UNPRICED_LINES` (ήδη υπάρχει). Ο `GROUP_PRICE_DEVIATIONS` guard **δεν**
   τρέχει εδώ — το mobile app δεν αγγίζει τιμές ομίλου (βλ. §9 ανοιχτά).
8. `COMMIT`.

### 4.2 `GET /api/quotes/:id` — detail (δεν υπάρχει σήμερα)

Σήμερα το μόνο που υπάρχει είναι `GET /api/quotes` (λίστα) και
`GET /api/quote-lines` (**όλες** οι γραμμές όλων των προσφορών). Το PWA
χρειάζεται ένα enriched detail, ίδιο σχήμα με `GET /api/orders/:id`:

```ts
interface QuoteDetail {
  quote: Quote;                      // + linked_order_id
  lines: QuoteLineEnriched[];        // join plants/variants: plant_common_name,
                                     // plant_scientific_name, size_summary,
                                     // variant_status, plant_status
  customer: Customer | null;
  statusHistory: QuoteStatusHistory[];
  linkedOrder: { id: string; order_number: string; status: OrderStatus } | null;
}
```

Φιλτράρει `is_alternative = false` (το PWA δεν δείχνει εναλλακτικές).

> Προσοχή routing: το `/api/quotes/:id/audit`, `/photos`, `/profitability`
> ορίζονται ήδη· το νέο `GET /api/quotes/:id` μπαίνει **μετά** από αυτά για
> να μην τα σκιάσει (Express matching σειρά).

### 4.3 `PATCH /api/quotes/:id` — status / notes / valid_until

```jsonc
{ "status"?: "SENT" | "ACCEPTED" | "REJECTED", "notes"?: string, "valid_until"?: "YYYY-MM-DD" }
```

- Επιτρεπτές μεταβάσεις: `DRAFT→SENT`, `SENT→ACCEPTED`, `SENT→REJECTED`,
  `DRAFT→REJECTED`. Οτιδήποτε άλλο → 409 `INVALID_TRANSITION`.
- Locked (`ACCEPTED`/`CONVERTED`/`SUPERSEDED`) → 409 `QUOTE_LOCKED` (ίδιο error με το save).
- `DRAFT→SENT` → guard `UNPRICED_LINES`.
- `SENT→ACCEPTED` → **καλεί `syncAcceptedQuoteToOrder(client, quote, lines, req.user.sub)`**
  (ήδη υπάρχει, δημιουργεί το `orders` row με `source_quote_id`). Επιστρέφει
  `{ quote, orderCreated, orderId, orderNumber }` ώστε το PWA να δείξει
  «Έγινε παραγγελία ORD-2026-311» με link προς το Direct Orders app.
- Γράφει `quote_status_history` με `action='UPDATE_STATUS'`.

### 4.4 `PUT /api/direct-quotes/:id` — επεξεργασία DRAFT

Ίδιο body με το POST. Επιτρέπεται **μόνο** όσο `status='DRAFT'`. Διαγράφει
και ξαναγράφει τις `quote_lines` (ό,τι κάνει και το `/api/quotes/save`).
Χρειάζεται για το «Συνέχισε την επεξεργασία» στο detail. Μπορεί να πάει
Phase 2.

### 4.5 Υπάρχοντα που ξαναχρησιμοποιούμε as-is

| Endpoint | Χρήση |
|---|---|
| `GET /api/quotes` | λίστα (φέρνει ήδη `lines_count`, `total_value`, `linked_order_id`) |
| `GET /api/quotes/:id/photos` | visual PDF με φωτογραφίες |
| `POST /api/quotes/:id/send-gmail` | αποστολή PDF μέσω Gmail (client φτιάχνει `pdf_base64`) |
| `GET /api/customers`, `POST /api/customers`, `GET /api/google-contacts` | ίδια με Direct Orders |
| `GET /api/plants?status=all`, `GET /api/variants?status=all` | κατάλογος |
| `GET /api/customer-prices?customer_id=` | τιμοκατάλογος πελάτη |
| `GET /api/suppliers`, `/supplier-products`, `/supplier-prices` | κόστος + περιθώριο στις γραμμές |
| `POST /api/auth/login` (+ OIDC handoff) | ίδιο |

### 4.6 CORS

`ALLOWED_ORIGINS` += `https://offers.smartquotations.eu`, dev list +=
`http://localhost:5175`.

---

## 5. Frontend — τι αντιγράφεται, τι αλλάζει, τι είναι νέο

### 5.1 Verbatim (copy, μόνο rename `bdo_`→`bof_`)

`lib/api.ts` `auth.ts` `format.ts` `vat.ts` `cn.ts` `phone.ts` `search.ts`
`plant-display.ts` `supplier-cost.ts` `draft-line.ts` `deep-link.ts`
`notify-message.ts` · `components/` **όλα** (`MobileSheet`, `FullScreenSheet`,
`MobileStepper`, `BottomNav`\*, `AddLineSheet`, `VariantPickerSheet`,
`FreeTextLineSheet`, `NewCustomerSheet`, `GoogleContactsPicker`, `QtyStepper`,
`PriceInput`, `VatPicker`, `PlantTile`, `VariantCard`, `PwaUpdateToast`,
`RequireAuth`, `LeafMark`, `MobileSearchInput`, `CustomerFormField`) ·
`pages/Login.tsx` `AddCustomerPage.tsx` · `styles/globals.css` · `main.tsx` ·
configs (`vite`, `tailwind`, `tsconfig`, `playwright`, `vitest`) · nginx conf ·
`.github/workflows/*` (με αλλαγμένο path `/var/www/offers/`) · fonts.

\* `BottomNav`: αλλάζουν μόνο labels/routes.

### 5.2 Προσαρμογή (ίδιος σκελετός, άλλο domain object)

| Direct Orders | Offers | Τι αλλάζει |
|---|---|---|
| `types/index.ts` `Order`/`OrderLine`/`OrderDetail` | `Quote`/`QuoteLine`/`QuoteDetail` | `unit_price`→`unit_sell_price`, `description`→`description_override`, `delivery_date`→`issue_date`+`valid_until`, `+terms`, `QuoteStatus` |
| `lib/queries.ts` | ίδιο | `useQuotes`, `useQuote(id)`, `useCreateDirectQuote`, `usePatchQuote`, `useUpdateDraftQuote`; τα customers/plants/variants/prices/suppliers hooks verbatim |
| `StatusBadge.tsx` / `StatusTimeline.tsx` | ίδιο | 7 quote statuses, χρώματα: DRAFT γκρι · SENT μπλε · ACCEPTED πράσινο · CONVERTED σκούρο πράσινο · REJECTED κόκκινο · EXPIRED πορτοκαλί · SUPERSEDED γκρι-ριγέ. Timeline: DRAFT→SENT→ACCEPTED→CONVERTED |
| `pages/Home.tsx` | ίδιο | stats: «Ανοιχτές» (DRAFT+SENT), «Λήγουν σε 7 ημέρες», «Αποδεκτές μήνα». CTA «Νέα προσφορά». Recent = τελευταίες 5 |
| `pages/OrdersList.tsx` → `QuotesList.tsx` | ίδιο | filter chips ανά `QuoteStatus`, default = DRAFT+SENT. Search σε `quote_number` + πελάτη. Δεν δείχνει `archived_at` / SUPERSEDED |
| `pages/NewOrderWizard.tsx` → `NewQuoteWizard.tsx` | ίδιο | βλ. §6 |
| `pages/OrderDetail.tsx` → `QuoteDetail.tsx` | ίδιο | βλ. §7 |
| `pages/Calendar.tsx` → `Expiring.tsx` | αντικατάσταση | βλ. §8 |
| `lib/pdf-order.ts` → `pdf-quote.ts` | ίδιο | header «ΠΡΟΣΦΟΡΑ», `quote_number`, ισχύει έως `valid_until`, `terms` block στο τέλος. Port του jsPDF κώδικα από `bloom-crm/src/pages/QuoteBuilder.tsx` (ήδη Greek-font aware) |
| `lib/pdf-delivery.ts` | **αφαιρείται** | δεν έχει νόημα σε προσφορά. Μένει μόνο visual mode (φωτογραφίες) ως `pdf-quote-visual.ts` |
| `NotifyCustomerSheet.tsx` → `SendQuoteSheet.tsx` | ίδιο | κανάλια Viber / WhatsApp / Gmail / Web Share (PDF attach) — βλ. §7 |
| `ReminderSheet` / `useReminders` | ίδιο | reminder default = `valid_until − 2 ημέρες`, «Follow-up προσφοράς» |
| `OrderTotalPresentView` → `QuoteTotalPresentView` | ίδιο | full-screen «δείξε στον πελάτη» view, ίδιο component, άλλο label |

### 5.3 Αφαιρούνται

`OrderSupplierBreakdownView`, `PdfActionSheet` (3 delivery modes),
`pdf-delivery.ts`, amendments (`useCreateAmendment`) — οι DRAFT προσφορές
επεξεργάζονται με `PUT`, δεν έχουν amendments.

---

## 6. Wizard `/quotes/new` — 4 βήματα (ίδιο `MobileStepper`)

| # | Label | Ίδιο με orders | Διαφορές |
|---|---|---|---|
| 0 | **Πελάτης** | ✅ 100% | — (search, recent, «Νέος πελάτης», contacts picker, deep-link prefill) |
| 1 | **Στοιχεία** | σκελετός | `issue_date` (default σήμερα) · `valid_until` (default +30, quick chips 15/30/60) · `notes` · `terms` (textarea, prefilled από localStorage «τελευταίοι όροι») |
| 2 | **Γραμμές** | ✅ 100% | `AddLineSheet` / `VariantPickerSheet` / free-text / customer price / cost+margin chip / VAT picker — verbatim. Μόνο το field name στο draft state (`unit_sell_price`) |
| 3 | **Έλεγχος** | σκελετός | totals + VAT breakdown (ίδιο `vatBreakdown`), **δύο CTA**: «Αποθήκευση ως πρόχειρο» (DRAFT) και «Αποστολή» (SENT → μετά ανοίγει `SendQuoteSheet`) |

Draft state: `{ customer, issueDate, validUntil, notes, terms, lines[] }` σε
component state, όπως και στα orders (χωρίς persistence).

Validation `canNext`: step 0 πελάτης · step 1 `valid_until ≥ issue_date` ·
step 2 ≥1 γραμμή με `qty ≥ 1` · step 3 ελέγχει `unit_sell_price > 0` σε όλες
τις γραμμές πριν ενεργοποιήσει το «Αποστολή» (mirror του server guard
`UNPRICED_LINES`, ώστε να μη φάμε 422).

---

## 7. `/quotes/:id` — Detail

Ίδιο layout με `OrderDetail`: header card (αριθμός, πελάτης, badge),
`StatusTimeline`, λίστα γραμμών, totals, notes (editable inline όπως orders),
sticky action bar.

Actions ανά status (mirror του `MobileQuoteDetail` του desktop, αλλά χωρίς stubs):

| Status | Primary CTA | Δευτερεύοντα |
|---|---|---|
| DRAFT | **Αποστολή** (PATCH→SENT + SendQuoteSheet) | Επεξεργασία (wizard preloaded, Phase 2) · PDF · Απόρριψη |
| SENT | **Αποδοχή** (PATCH→ACCEPTED) | Απόρριψη · Ξαναστείλε PDF · Reminder · Παράταση `valid_until` |
| ACCEPTED / CONVERTED | **Δες παραγγελία** → deep-link `https://orders.smartquotations.eu/orders/<linked_order_id>` | PDF |
| REJECTED / EXPIRED | **Αντίγραφο ως νέα** → wizard prefilled (Phase 2) | PDF |

`SendQuoteSheet`: γεννά PDF client-side (`pdf-quote.ts`) →
- **Web Share API** με `files:[pdf]` (iOS 15+: ανοίγει το share sheet, ο
  χρήστης διαλέγει Viber/WhatsApp/Mail) — **primary path, δουλεύει χωρίς backend**.
- Fallback χωρίς `navigator.canShare({files})`: download PDF + `viber://` /
  `wa.me/<phone>?text=` με κείμενο από `notify-message.ts` (ίδιο pattern με το
  ready-notification των orders).
- **Gmail** (αν ο χρήστης έχει συνδέσει Google): `POST /api/quotes/:id/send-gmail`
  με `pdf_base64`, subject/body prefilled στα ελληνικά.

Το «Αποδοχή» δείχνει toast «Δημιουργήθηκε παραγγελία ORD-…» με κουμπί που
ανοίγει το Direct Orders app.

---

## 8. `/expiring` — αντί για Calendar

Το calendar των orders γυρίζει γύρω από `delivery_date`. Στις προσφορές το
αντίστοιχο «ημερομηνία που με νοιάζει» είναι το `valid_until`. Αντί για
month-grid (λίγο νόημα για λήξεις), μια λίστα **SENT** προσφορών ομαδοποιημένη:
«Έληξαν» · «Λήγουν αυτή την εβδομάδα» · «Αργότερα». Tap → detail. Swipe
actions δεν χρειάζονται· το detail έχει «Παράταση».

Bottom nav: **Αρχική · Προσφορές · Λήξεις**.

> Αν προτιμάς να μείνει το Calendar 1:1 (month grid με `valid_until`), είναι
> ~0 δουλειά: `useDeliveries` → `useQuotes` filtered client-side. Το αφήνω ως
> επιλογή (§9).

---

## 9. Ανοιχτά ερωτήματα (θέλουν απόφαση πριν ξεκινήσει το build)

1. **Όνομα repo / domain.** Πρόταση: `pete79cy/bloom-offers`, `offers.smartquotations.eu`.
2. **Λήξεις vs Calendar** (§8).
3. **Group pricing.** Το desktop μπλοκάρει DRAFT→SENT όταν η τιμή γραμμής
   αποκλίνει από τιμή ομίλου (422 `GROUP_PRICE_DEVIATIONS`). Πρόταση: το
   mobile **δεν** τρέχει τον guard και **δεν** γράφει ποτέ τιμές ομίλου
   (`price_scope` μένει null) — η προσφορά βγαίνει με τη γραμμή όπως είναι.
   Αν το θέλεις αυστηρό, ο guard μπαίνει στο PATCH και το PWA δείχνει το
   μήνυμα read-only («φτιάξ' το από το desktop»).
4. **Επεξεργασία DRAFT από το κινητό** (`PUT`, §4.4) — Phase 1 ή 2;
5. **Auto-EXPIRED.** Σήμερα κανείς δεν γυρίζει SENT→EXPIRED αυτόματα. Το PWA
   θα δείχνει «ληγμένη» visually όταν `valid_until < today` χωρίς να αλλάζει
   status. OK;

---

## 10. Φάσεις

**Phase 0 — Backend (bloom-crm, ~1 μέρα)**
`POST /api/direct-quotes`, `GET /api/quotes/:id`, `PATCH /api/quotes/:id`,
`ensureDraftVariant` helper, CORS. Tests στο `server/` για transitions + numbering.

**Phase 1 — PWA MVP (~2–3 μέρες)**
Fork repo → rename → types/queries → wizard → list → detail (status actions,
PDF, share) → home. Deploy σε `offers.smartquotations.eu`. Το 70% είναι
copy + rename, το βάρος είναι `QuoteDetail` + `pdf-quote.ts`.

**Phase 2 (~1 μέρα)**
`PUT` edit DRAFT, «Αντίγραφο ως νέα», Gmail send, Expiring view polish,
Playwright e2e για wizard + accept flow.

---

## 11. Checklist "διαφορές σχήματος" (για να μην ξαναπατήσουμε τα ίδια)

| Orders | Quotes |
|---|---|
| `order_lines.unit_price` | `quote_lines.unit_sell_price` |
| `order_lines.description` | `quote_lines.description_override` |
| `order_lines.variant_id` | `quote_lines.offered_variant_id` |
| `orders.delivery_date` | `quotes.issue_date` + `quotes.valid_until` |
| — | `quotes.terms`, `quotes.currency`, `quotes.revision_no` (πάντα 0 από το PWA) |
| `id = 'o-<epoch>'` | `id = 'q-<epoch>'` |
| `nextOrderNumber` | `nextQuoteNumberFromDb` (ίδιο `nextSequenceNumber`) |
| status history: — | `quote_status_history` (**υποχρεωτικό** σε κάθε αλλαγή status) |
