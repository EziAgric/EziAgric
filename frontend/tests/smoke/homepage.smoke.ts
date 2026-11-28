import { test, expect } from "@playwright/test";

// Runs against the deployed PR preview (PREVIEW_URL). Kept as *.smoke.ts so the
// frontend Jest suite (*.test / *.spec) does not pick it up.
test("homepage returns 200, shows wallet connect, and logs no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("button", { name: /connect wallet/i })).toBeVisible();
  expect(errors).toEqual([]);
});
