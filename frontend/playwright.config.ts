import { defineConfig, devices } from "@playwright/test";

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./tests",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI
    ? [
        ["html", { outputFolder: "playwright-report", open: "never" }],
        ["github"],
        ["json", { outputFile: "test-results/results.json" }],
      ]
    : [["html", { outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: "http://localhost:3000",

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",

    /* Screenshot on failure */
    screenshot: "only-on-failure",

    /* Video on retry */
    video: "retain-on-failure",
  },

  /* Visual regression threshold: allow up to 0.2% pixel difference to absorb
     sub-pixel antialiasing variance across runs without phantom diffs. */
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.002,
      // Animate: 'disabled' freezes CSS animations for deterministic captures.
      animations: "disabled",
      // Wait for fonts to load before snapping.
      caret: "hide",
    },
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium-mobile",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 375, height: 667 },
        // Disable GPU compositing — identical raster output across CI runners.
        launchOptions: {
          args: ["--disable-gpu", "--font-render-hinting=none"],
        },
      },
      testMatch: "**/visual/**/*.spec.ts",
    },
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          args: ["--disable-gpu", "--font-render-hinting=none"],
        },
      },
      testMatch: "**/visual/**/*.spec.ts",
    },
    /* E2E projects run all tests */
    {
      name: "e2e-chromium",
      use: { ...devices["Desktop Chrome"] },
      testMatch: "**/e2e/**/*.spec.ts",
    },
    {
      name: "e2e-pact",
      use: { ...devices["Desktop Chrome"] },
      testMatch: "**/pact/**/*.spec.ts",
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
