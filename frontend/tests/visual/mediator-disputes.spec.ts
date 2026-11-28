import { test, expect } from '@playwright/test';

// Unauthenticated/non-mediator visitors see the "Access Restricted" state,
// which still exercises the page's shared spacing/typography (h1, container).
test.describe('Mediator Disputes Page Visual Tests', () => {
  test('access-restricted layout matches snapshot', async ({ page }) => {
    await page.goto('/mediator/disputes');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Access Restricted' })).toBeVisible();
    const content = page.getByTestId('mediator-disputes-page');
    await expect(content).toHaveScreenshot('mediator-disputes-restricted.png');
  });
});
