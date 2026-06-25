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
   - Input: **Shortcut Input**
   - Detail: **Name** → this is `Name`
4. Add another **Get Details of Contacts**:
   - Input: **Shortcut Input** (not "Contact" — always the same input)
   - Detail: **Phone Number** → `Phone`
5. Add another **Get Details of Contacts**:
   - Input: **Shortcut Input**
   - Detail: **Email Address** → `Email`
6. (Recommended) Add a **URL Encode** action for each of `Name`, `Phone`,
   `Email` so spaces / Greek letters / `+` don't break the link. If your iOS
   version doesn't show a "URL Encode" action, skip — the app tolerates most
   names.
7. Add a **Text** action with exactly:
   ```
   https://orders.smartquotations.eu/customers/new?name=[Name]&phone=[Phone]&email=[Email]
   ```
   (insert the variables where shown — **do not** type `%20` or spaces between
   variables; put the full name in the single `Name` variable from step 3).
8. Add **Open URLs** with that Text as input.
9. Name it **Add to Bloom**, pick an icon, Done.

## Common mistakes (if phone/email are empty or you see `%20` in the name)

| Wrong | Right |
|---|---|
| **Get First Name** + **Get Last Name** separately | One **Get Details of Contacts → Name** (full name) |
| Source = **Contact** on later steps | Source = **Shortcut Input** on every step |
| **Get Phone Numbers** (plural) | **Get Details of Contacts → Phone Number** (singular) |
| Text: `name=[First Name]%20[Last Name]` | Text: `name=[Name]` only |
| Skipping **URL Encode** on Greek names | Add **URL Encode** on Name / Phone / Email before the Text step |

## First run
- The link opens in **Safari** (not the installed PWA). Log in once there with
  **Remember me** — after that it stays logged in for 60 days.
- The customer is saved to the same central database, so it appears in the
  PWA and the desktop immediately regardless.

## Use it
Contacts app → open a contact → **Share** → **Add to Bloom** → review → **Save**.
Then optionally **"Νέα παραγγελία τώρα"** to start an order for them.

## Ελληνικά — γρήγορη ρύθμιση

1. **Shortcuts** → νέο shortcut → ενεργοποίησε **Εμφάνιση στο μενού Κοινοποίησης** → μόνο **Επαφές**.
2. **Λήψη πληροφοριών επαφών** → Είσοδος: **Είσοδος συντόμευσης** → **Όνομα**.
3. Ξανά **Λήψη πληροφοριών επαφών** → **Είσοδος συντόμευσης** → **Αριθμός τηλεφώνου**.
4. Ξανά **Λήψη πληροφοριών επαφών** → **Είσοδος συντόμευσης** → **Διεύθυνση email**.
5. (Προαιρετικά) **Κωδικοποίηση URL** για Όνομα, Τηλέφωνο, Email.
6. **Κείμενο**: `https://orders.smartquotations.eu/customers/new?name=[Όνομα]&phone=[Αριθμός τηλεφώνου]&email=[Διεύθυνση email]`
7. **Άνοιγμα URL**.
8. Ονόμασέ το **Add to Bloom**.
