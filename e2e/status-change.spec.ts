import { test, expect } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_EMAIL ?? 'pete@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'password123';

/**
 * User can find a PENDING order in the list and advance it to PREPARING.
 *
 * Requires at least one order with status=PENDING in the database.
 */
test('user can advance an order status', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(TEST_EMAIL);
  await page.getByLabel('Κωδικός').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Σύνδεση' }).click();

  await page.getByRole('link', { name: 'Παραγγελίες' }).click();
  await expect(page).toHaveURL('/orders');

  const pendingItem = page.locator('li', { hasText: 'Εκκρεμής' }).first();
  await pendingItem.locator('a').click();

  await page.getByRole('button', { name: /Σε ετοιμασία/ }).click();
  await expect(page.locator('header').getByText('Σε ετοιμασία')).toBeVisible();
});
