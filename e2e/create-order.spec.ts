import { test, expect } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_EMAIL ?? 'pete@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'password123';

/**
 * Happy path: login → wizard → create direct order → land on detail.
 *
 * Requires:
 *   - bloom-crm API running on http://localhost:4000
 *   - VITE_API_BASE_URL set to http://localhost:4000 in .env.local
 *   - TEST_EMAIL + TEST_PASSWORD env vars for a valid admin user
 *   - At least one customer and one variant in the database
 *
 * Run with: TEST_EMAIL=you@x.com TEST_PASSWORD=... npx playwright test
 */
test('user can log in and create a direct order', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Email').fill(TEST_EMAIL);
  await page.getByLabel('Κωδικός').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Σύνδεση' }).click();
  await expect(page).toHaveURL('/');

  await page.getByRole('link', { name: /Νέα Παραγγελία/ }).click();
  await expect(page).toHaveURL('/orders/new');

  // Step 1: Customer — first one in the list
  await page.locator('ul li button').first().click();

  // Step 2: Details — defaults are fine
  await page.getByRole('button', { name: 'Συνέχεια' }).click();

  // Step 3: Lines — add the first variant via the sheet
  await page.getByRole('button', { name: /Προσθήκη γραμμής/ }).click();
  await page.locator('ul li button').first().click();
  await page.getByRole('button', { name: 'Συνέχεια' }).click();

  // Step 4: Save
  await page.getByRole('button', { name: /Αποθήκευση παραγγελίας/ }).click();

  // Confirm we land on a detail page
  await expect(page).toHaveURL(/\/orders\/[\w-]+$/);
  await expect(page.getByText(/Εκκρεμής/)).toBeVisible();
});
