# Runbook: Nightly E2E Trade Lifecycle Tests

> **Issue #236** — Nightly E2E trade lifecycle suite against Stellar testnet
> Last updated: 2026-08-30

## Overview

The nightly E2E lifecycle test suite runs every night at 02:00 UTC against
Stellar testnet. It exercises the complete trade lifecycle (create → fund →
evidence → release), dispute resolution, clawback, fee math, and event
emission integrity.

**Workflow:** `.github/workflows/nightly-e2e-lifecycle.yml`
**Tests:** `frontend/tests/e2e/testnet-lifecycle.spec.ts`
**Artifacts:** Uploaded as `e2e-lifecycle-artifacts` on failure (14-day retention)

## Interpreting Failures

### 1. Network Connectivity Issues

**Symptoms:**
- `ECONNREFUSED` or `ETIMEDOUT` errors
- `Stellar RPC should be reachable` assertion failure

**Diagnosis:**
- Check Stellar testnet status: https://status.stellar.org/
- Verify RPC URL is correct: `https://soroban-testnet.stellar.org`
- Check if the Horizon API is responding: `curl https://horizon-testnet.stellar.org/`

**Resolution:**
- If Stellar testnet is down, re-run the workflow manually after it recovers
- If the RPC URL is wrong, update the `STELLAR_RPC_URL` environment variable
- These failures are transient and should be quarantined if testnet is degraded

### 2. Contract Build Failures

**Symptoms:**
- `cargo build --target wasm32-unknown-unknown` fails
- WASM artifact not found

**Diagnosis:**
- Check the Rust toolchain version (should be stable with `wasm32-unknown-unknown` target)
- Verify `Cargo.lock` is committed and up to date
- Run `cargo build` locally to reproduce

**Resolution:**
- These are real failures — fix the contract code or dependencies
- Do NOT quarantine build failures

### 3. Contract Test Failures

**Symptoms:**
- `test result: FAILED` in contract test output
- Specific test assertions failing

**Diagnosis:**
- Look at the specific test name in the output
- Check if it's a new failure (compare with previous night's run)
- Run the test locally: `cd contracts/amana_escrow && cargo test <test_name>`

**Resolution:**
- New failures = likely a code change broke an invariant → fix immediately
- Recurring failures = investigate if the test is flaky or if there's a real bug
- Update the flake budget if quarantining a test

### 4. Backend Integration Failures

**Symptoms:**
- Backend auth regression tests failing
- API health check failing

**Diagnosis:**
- Check if the backend starts correctly
- Verify environment variables are set
- Check Prisma schema is up to date

**Resolution:**
- Backend failures may indicate schema drift or missing migrations
- Run `cd backend && pnpm prisma migrate status` to check

### 5. Event Emission Failures

**Symptoms:**
- Event schema tests failing
- Event payload mismatches

**Diagnosis:**
- Check if `EVENT_SCHEMA_VERSION` was bumped
- Verify event structs match the test expectations
- Look for `event_schema_tests` failures specifically

**Resolution:**
- If schema version was intentionally bumped, update the tests
- If events are missing fields, check the contract code

## Flake Budget

Each test has a quarantine path tracked in the GitHub Actions summary:

| Status | Meaning |
|--------|---------|
| `clean` | No flake patterns detected |
| `quarantined` | Potential network or transient issue detected |

**Quarantine criteria:**
- `ECONNREFUSED` / `ETIMEDOUT` / `Socket hang up` patterns
- `Transaction failed` with no specific test assertion failure
- `Rate limit` errors from Stellar APIs

**Quarantine process:**
1. Mark the run as quarantined in the summary
2. If the same test quarantines 3+ nights in a row, investigate root cause
3. Create an issue for persistent flakes

## Milestone Gate

Before any mainnet milestone:
- [ ] Suite passes 14 consecutive nights (or flakes quarantined with cause)
- [ ] Runtime < 30 minutes with parallelized segments
- [ ] Artifacts sufficient to diagnose without re-runs
- [ ] This runbook is up to date

## Re-running Manually

From GitHub Actions:
```
Actions → Nightly E2E Trade Lifecycle → Run workflow → Branch: main
```

From CLI:
```bash
gh workflow run nightly-e2e-lifecycle.yml --ref main
```

## Key Metrics

Track in GitHub Actions output:
- `pass_count`: Number of passing test assertions
- `fail_count`: Number of failing test assertions
- `flake_status`: `clean` or `quarantined`
