# Visual Snapshot Policy

## Overview

Playwright screenshot tests run on **two viewports** for every visual spec:

| Project            | Viewport   | Device base    |
| ------------------ | ---------- | -------------- |
| `chromium-desktop` | 1440 × 900 | Desktop Chrome |
| `chromium-mobile`  | 375 × 667  | Pixel 5        |

Snapshots live alongside their spec files under `tests/visual/` in subdirectories named after the Playwright project, e.g. `tests/visual/vault.spec.ts-snapshots/vault-auth-main-chromium-desktop-linux.png`.

---

## Deterministic rendering

All visual tests use the fixtures in `tests/visual/fixtures.ts`, which:

1. **Freeze `Date.now()`** to `2026-03-01T12:00:00.000Z` so timestamps in the UI never drift.
2. **Disable CSS animations and transitions** by injecting a `0s` override stylesheet before page load.
3. **Mock every API route** with stable fixture data — no real backend needed.
4. **Seed a JWT + Freighter mock** for authenticated pages, keeping the auth flow deterministic.
5. Pass `--disable-gpu --font-render-hinting=none` to Chromium so font rasterisation is identical across CI and local Linux runners.

The `maxDiffPixelRatio` threshold is set to `0.002` (0.2%). This absorbs the tiny sub-pixel antialiasing variance that exists between identical runs on the same machine, while still catching any meaningful layout shift.

---

## Stability target

The suite must pass **20 consecutive runs** without phantom diffs. Before merging baseline changes, run:

```bash
# From the frontend/ directory
for i in $(seq 1 20); do pnpm test:visual -- --reporter=line && echo "Run $i OK"; done
```

If any run produces a diff, investigate the root cause (usually a non-deterministic timestamp, animation, or data-fetching side-effect) before updating baselines.

---

## When to regenerate snapshots

Regenerate baselines **only** when there is an intentional visual change — a design update, layout refactor, spacing correction, or new UI state. Run:

```bash
# From frontend/
pnpm test:visual:update
```

Then **commit the updated `.png` files in the same PR** as the code change that caused them. Include a short explanation in the PR description of what changed visually and why. A screenshot diff attached to the PR is ideal.

### Approving a visual change in PR review

1. Pull the branch locally and run `pnpm test:visual -- --reporter=html`.
2. Open `playwright-report/index.html` and navigate to the diff view.
3. Verify the diff region matches the stated design change and nothing else regressed.
4. Approve when the diff is intentional and scoped.

---

## When NOT to regenerate

Do not regenerate snapshots to silence a failing test. A snapshot diff that is not caused by your PR is a signal of an unrelated regression — investigate it instead of overwriting it.

---

## CI gate

The `visual-regression` job in `.github/workflows/ci.yml` runs after the main frontend build and fails the PR if any snapshot diff exceeds the threshold. Artifacts (diff PNGs + HTML report) are uploaded to the `visual-regression-report` artifact bucket for 14 days.

The gate is **required for all PRs** that touch `frontend/**`.

---

## Adding a new page to the suite

1. **Create a spec file** at `frontend/tests/visual/<page-name>.spec.ts`.
2. **Import from fixtures**: `import { test, expect } from './fixtures'`.
3. Use one of the three fixture pages:
   - `publicPage` — unauthenticated, no JWT.
   - `authenticatedPage` — user-role JWT, mocked API.
   - `adminPage` — admin-role JWT, mocked API.
4. **Add route mocks** inside the test if the page calls endpoints not already covered by `mockApiRoutes()` in `fixtures.ts`.
5. Target **the smallest stable DOM region** that proves the assertion (`page.locator('main')` or a named `data-testid`). Avoid `{ fullPage: true }` unless the whole page is the feature under test.
6. Run `pnpm test:visual:update` once to generate the baseline PNGs.
7. **Commit the baseline PNGs** alongside the spec in the same PR.
8. Verify the suite passes 20 consecutive runs locally before opening the PR.

### Naming convention

Screenshot filenames are derived from the `toHaveScreenshot()` argument, e.g.:

```ts
await expect(main).toHaveScreenshot("vault-auth-main.png");
// Produces: vault-auth-main-chromium-desktop-linux.png (per project)
```

Use kebab-case names that encode `<page>-<state>-<region>`, e.g. `admin-streams-full.png`, `vault-manage-main.png`.

---

## Troubleshooting

| Symptom                    | Likely cause               | Fix                                                                         |
| -------------------------- | -------------------------- | --------------------------------------------------------------------------- |
| Diff on timestamp text     | `Date` not frozen          | Ensure test uses `fixtures.ts` helper                                       |
| Diff on spinner/skeleton   | Animation not disabled     | Check the CSS `0s` override loaded before `page.goto()`                     |
| Diff only on CI, not local | Font rasterisation differs | Both environments need `--font-render-hinting=none` (already set in config) |
| Diff on API data           | Route mock missing         | Add the endpoint to `mockApiRoutes()` or override inside the test           |
| Flaky diff on scrollbar    | OS scrollbar width differs | Scope to inner element, not the page root                                   |
