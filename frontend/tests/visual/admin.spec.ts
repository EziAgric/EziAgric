/**
 * Visual regression tests — Admin pages.
 *
 * Admin routes are gated behind auth + isAdmin checks. The `adminPage`
 * fixture seeds a JWT with `role: 'admin'` and mocks the API routes, so
 * the admin layout renders real content instead of the access-denied redirect.
 *
 * Covers:
 *  - /admin/streams  (stream list layout)
 *  - Admin access-denied redirect (unauthenticated visitor)
 */

import { test, expect } from './fixtures';

async function waitForStable(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(150);
}

test.describe('Admin Streams — access denied (unauthenticated)', () => {
  test('access-denied page matches snapshot', async ({ publicPage: page }) => {
    // Unauthenticated visitors are redirected to /access-denied.
    await page.goto('/admin/streams');
    // Wait for either the redirect or the access-denied content.
    await page.waitForURL(/(admin|access-denied)/, { timeout: 5_000 }).catch(() => {});
    await waitForStable(page);

    const body = page.locator('body');
    await expect(body).toHaveScreenshot('admin-access-denied.png');
  });
});

test.describe('Admin Streams — authenticated admin', () => {
  test('streams list layout matches snapshot', async ({ adminPage: page }) => {
    // Override the streams route with deterministic fixture data.
    await page.route('http://localhost:4000/admin/streams?**', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'stream-001',
              status: 'ACTIVE',
              createdAt: '2026-01-15T10:00:00.000Z',
              totalAmount: 5000,
              recipientAddress: 'GDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD004',
              tags: ['agriculture'],
            },
            {
              id: 'stream-002',
              status: 'TERMINATED',
              createdAt: '2026-01-10T09:00:00.000Z',
              totalAmount: 12000,
              recipientAddress: 'GEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE005',
              tags: ['batch'],
            },
          ],
          pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
        }),
      }),
    );

    await page.goto('/admin/streams');
    await waitForStable(page);

    const main = page.locator('main').first();
    await expect(main).toHaveScreenshot('admin-streams-main.png');
  });

  test('full admin streams page matches snapshot', async ({ adminPage: page }) => {
    await page.goto('/admin/streams');
    await waitForStable(page);

    await expect(page).toHaveScreenshot('admin-streams-full.png', { fullPage: true });
  });
});
