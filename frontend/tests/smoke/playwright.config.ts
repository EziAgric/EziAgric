import { defineConfig } from "@playwright/test";

const baseURL = process.env.PREVIEW_URL;
if (!baseURL) {
  throw new Error("PREVIEW_URL must be set to the deployed preview frontend URL");
}

export default defineConfig({
  testDir: ".",
  testMatch: "*.smoke.ts",
  timeout: 30_000,
  expect: { timeout: 15_000 },
  retries: 1,
  reporter: [["list"]],
  use: { baseURL, trace: "off" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
