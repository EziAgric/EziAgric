# Mutation Testing Baseline — Money Math Pilot

> StrykerJS pilot on `backend/src/lib/feeComputation.ts` and
> `backend/src/lib/lossAllocation.ts`.
>
> See `.github/workflows/mutation-testing.yml` for the scheduled run.
> See `backend/stryker.money-math.config.json` for Stryker configuration.

---

## 1. Why mutation testing?

Line coverage says nothing about assertion strength. A test that calls
`computeReleaseFee(10_000n, 100)` and asserts only that it does not throw will
pass with 100% line coverage while missing dozens of arithmetic mutants (e.g.
`*` → `/`, `−` → `+`). Mutation testing inserts those changes and verifies
that your tests actually kill them.

**Pilot scope**: fee calculation and loss-ratio allocation — the two modules
where a surviving mutant would directly corrupt money arithmetic.

---

## 2. Pilot modules

| File | What it does |
|------|-------------|
| `backend/src/lib/feeComputation.ts` | Platform fee computation for all trade outcomes (release, refund, split, full\_seller, full\_buyer). BigInt BPS arithmetic mirroring on-chain Rust contract. |
| `backend/src/lib/lossAllocation.ts` | Largest-remainder BPS split ensuring zero-dust (sum == total) invariant. |

---

## 3. Target score

| Threshold | Score |
|-----------|-------|
| **Target (green)** | ≥ 80% |
| **Warning (amber)** | 70–79% |
| **Fail (red)** | < 70% — triggers `low` threshold in Stryker config |

The `break` threshold is `null` (no hard failure) for the weekly scheduled
run. This keeps CI green while the team triages surviving mutants. Set
`"break": 80` once the pilot has stabilised.

---

## 4. Running locally

```bash
cd backend
pnpm install          # installs @stryker-mutator/core etc.
pnpm mutation         # runs StrykerJS, opens HTML report on completion
```

The HTML report is written to `backend/reports/mutation/money-math/index.html`.

---

## 5. Baseline (pilot run — pre-implementation)

> This section records the first run result. Update after each triage cycle.

| Module | Killed | Survived | Score |
|--------|--------|----------|-------|
| `feeComputation.ts` | — | — | **TBD — first run** |
| `lossAllocation.ts` | — | — | **TBD — first run** |
| **Combined** | — | — | **TBD — first run** |

*Run after merging this PR to establish the first baseline, then update this
table with the actual score.*

---

## 6. Surviving mutant triage ritual

Run weekly (see GitHub Actions job `mutation-money-math`, scheduled Mondays at 03:00 UTC).

After each run:

1. Download the `mutation-report-money-math-<run>` artifact from the Actions run.
2. Open `index.html` in a browser.
3. For each surviving mutant, decide:

| Decision | Action |
|----------|--------|
| **Kill it** | Write a new test that specifically detects the change. See `*.mutation.test.ts` files for examples. |
| **Waive it** | Add a `// Stryker disable <MutatorName>` comment at the line with a one-line justification. |
| **Exclude it** | Add the mutation class to `excludedMutations` in `stryker.money-math.config.json` with a PR comment. |

---

## 7. Known justified waivers

| Location | Mutant | Reason |
|----------|--------|--------|
| `feeComputation.ts` — `calculatedAt` | `StringLiteral` on ISO date | `new Date().toISOString()` survivors are excluded globally via `excludedMutations: ["StringLiteral"]` — the timestamp value is not safety-critical. |

---

## 8. Expanding scope

Once the pilot reaches ≥ 80% on both modules for two consecutive weekly runs:

1. Add the next module to `mutate` in `stryker.money-math.config.json`.
2. Document the new module in Section 2 above.
3. Run locally first to establish a local baseline before merging.

Suggested next modules (in priority order):
- `backend/src/lib/vestingSchedule.ts` (if present)
- Any frontend fee-display utilities that derive values from the backend breakdown

---

## 9. CI artefact retention

Mutation reports are retained for **30 days** (see `retention-days: 30` in the
workflow). Download the JSON artefact before expiry if you need historical
comparisons.
