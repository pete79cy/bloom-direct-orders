import { test, expect } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_EMAIL ?? 'pete@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'password123';

/**
 * Free-text line flow: a rep creates an order containing a plant that
 * isn't in the catalogue. The server auto-creates plants + variants rows
 * with status='draft' inside the order transaction; the PWA renders a
 * ΠΡΟΧΕΙΡΟ marker on the cart + order detail.
 *
 * Requires:
 *   - bloom-crm API running on http://localhost:4000 with Phase 1 of
 *     the free-text-line feature deployed (schema migration + extended
 *     /api/direct-orders + variant_status enrichment).
 *   - VITE_API_BASE_URL set to http://localhost:4000 in .env.local
 *   - TEST_EMAIL + TEST_PASSWORD env vars for a valid admin user
 *   - At least one customer in the database
 *
 * Run with: TEST_EMAIL=you@x.com TEST_PASSWORD=... npx playwright test free-text-line
 */
test('user can create an order with a free-text line', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Email').fill(TEST_EMAIL);
  await page.getByLabel('Κωδικός').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Σύνδεση' }).click();
  await expect(page).toHaveURL('/');

  await page.getByRole('link', { name: /Νέα Παραγγελία/ }).click();
  await expect(page).toHaveURL('/orders/new');

  // Step 1 — pick the first customer in the list.
  await page.locator('ul li button').first().click();

  // Step 2 — defaults are fine.
  await page.getByRole('button', { name: 'Συνέχεια' }).click();

  // Step 3 — open the plant search sheet.
  await page.getByRole('button', { name: /Προσθήκη φυτού/ }).click();

  // Type a unique query that produces zero catalogue matches so the
  // "+ Νέο φυτό" link surfaces deterministically.
  const uniqueQuery = `E2E_FreeText_${Date.now()}`;
  await page.getByPlaceholder(/Αναζήτηση/i).fill(uniqueQuery);

  // Tap the "+ Νέο φυτό" link.
  const newLink = page.getByRole('button', { name: new RegExp(`Νέο φυτό.*${uniqueQuery}`) });
  await expect(newLink).toBeVisible();
  await newLink.click();

  // FreeTextLineSheet — confirm pre-fill, fill size + price.
  await expect(page.getByLabel(/Όνομα φυτού/i)).toHaveValue(uniqueQuery);
  await page.getByLabel(/Μέγεθος/i).fill('P 5L · H 80-100');
  await page.getByLabel(/Τιμή πώλησης/i).fill('8.50');
  // QtyStepper starts at 1; tap + twice → qty = 3
  await page.getByLabel('Αύξηση').click();
  await page.getByLabel('Αύξηση').click();
  await page.getByRole('button', { name: /Προσθήκη στην παραγγελία/i }).click();

  // Back in Step 3 — confirm the cart shows the new line with the draft
  // styling.
  await expect(page.getByText('ΠΡΟΧΕΙΡΟ — ΕΚΤΟΣ ΚΑΤΑΛΟΓΟΥ')).toBeVisible();
  await expect(page.getByText(uniqueQuery)).toBeVisible();

  await page.getByRole('button', { name: 'Συνέχεια' }).click();

  // Step 4 (review) — submit the order.
  await page.getByRole('button', { name: /Αποθήκευση/i }).click();

  // Land on the order detail — confirm ΠΡΟΧΕΙΡΟ marker is shown and the
  // typed plant name persisted.
  await expect(page).toHaveURL(/\/orders\/o-/);
  await expect(page.getByText(/ΠΡΟΧΕΙΡΟ/).first()).toBeVisible();
  await expect(page.getByText(uniqueQuery)).toBeVisible();
});
