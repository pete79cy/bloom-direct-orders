# iOS Shortcut: "Add to Bloom"

One-time setup so you can add a phone contact as a customer in two taps.

## What it does
From the Contacts app: **Share → Add to Bloom** → opens the Bloom Orders
new-customer form pre-filled with the contact's name, phone, and email. You
review and tap Save.

## Build it (Shortcuts app, ~3 min)

1. Open **Shortcuts** → **+** (new shortcut).
2. Tap the **(i)** / settings → enable **Show in Share Sheet**. Under
   **Share Sheet Types**, turn everything off except **Contacts**.
3. Add action **Get Details of Contacts**:
   - Detail: **Name**. (Input = Shortcut Input.) → this is `Name`.
4. Add another **Get Details of Contacts**:
   - Detail: **Phone Number** → `Phone`.
5. Add another **Get Details of Contacts**:
   - Detail: **Email Address** → `Email`.
6. (Recommended) Add a **URL Encode** action for each of `Name`, `Phone`,
   `Email` so spaces / Greek letters / `+` don't break the link. If your iOS
   version doesn't show a "URL Encode" action, skip — most names still work.
7. Add a **Text** action with exactly:
   ```
   https://orders.smartquotations.eu/customers/new?name=[Name]&phone=[Phone]&email=[Email]
   ```
   (insert the variables where shown).
8. Add **Open URLs** with that Text as input.
9. Name it **Add to Bloom**, pick an icon, Done.

## First run
- The link opens in **Safari** (not the installed PWA). Log in once there with
  **Remember me** — after that it stays logged in for 60 days.
- The customer is saved to the same central database, so it appears in the
  PWA and the desktop immediately regardless.

## Use it
Contacts app → open a contact → **Share** → **Add to Bloom** → review → **Save**.
Then optionally **"Νέα παραγγελία τώρα"** to start an order for them.
