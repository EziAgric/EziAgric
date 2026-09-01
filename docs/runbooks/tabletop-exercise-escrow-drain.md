# Tabletop Exercise: Simulated Escrow-Drain

A dry-run walkthrough of [incident-response.md](./incident-response.md)
against a fictional P0 scenario, so the process is exercised before a real
incident forces it. Re-run this (or a variant) periodically, and any time
the runbook changes materially.

## How to run this

1. Pick a facilitator who plays "reality" (feeds new information, plays any
   external party) and isn't otherwise on the response.
2. Everyone else plays their normal on-call role. No code is actually
   touched — this is entirely discussion-based ("I would run X", "I would
   check Y").
3. The facilitator reads the scenario below one step at a time, pausing for
   the group to say what they'd do before revealing the next step.
4. Debrief immediately after: what would have worked, what was ambiguous,
   what's missing. Capture that as findings (§3 below), not just verbally.

## 1. Scenario

> An automated alert fires: `reconciliation_drift_critical` — on-chain
> escrow contract balance is lower than the off-chain ledger's sum of
> active trade balances by an amount equivalent to roughly 3 medium-sized
> trades. No corresponding `TradeReleased` or `TradeRefunded` events were
> recorded for the delta.

**Facilitator notes for later steps (do not reveal up front):**

- Root cause: a since-patched race in the event listener allowed a
  duplicate `execute_upgrade` replay window (fictional, for the exercise)
  during which a single malicious release was submitted directly against
  the contract, bypassing the backend's authorization checks entirely.
- The admin key was not compromised; the contract's authorization surface
  had a gap that let a correctly-signed-but-unauthorized caller trigger a
  release.

## 2. Worked dry run (example responses)

This is one plausible run-through, recorded as a worked example — your
actual tabletop's answers are the point, not agreement with this one.

| Step | Expected response |
|---|---|
| Alert fires | On-call acknowledges, opens `#incident-2026-08-29-escrow-drift` and the matching tracking issue, self-assigns **Incident Commander** |
| Classify severity | **P0** — "funds at risk" per the severity table, since the drift implies funds moved without a matching application event |
| Mitigate before diagnosing | Per the runbook's P0 priority, IC directs Ops to rotate/pause the admin key path and freeze new releases (via feature flag) *before* root-causing, to stop further loss |
| Check health signals | Ops runs `/health/detail`, confirms backend and DB are otherwise healthy — this is not an availability incident, it's an integrity one |
| Communicate | Comms posts to the incident channel: "P0: investigating unexplained escrow balance drift, releases are paused as a precaution" |
| Escalate | Because this matches "suspected fund loss" in the escalation matrix, IC pages the eng lead + admin key holder immediately, not after the normal 10-minute grace period |
| Diagnose | Ops correlates the drift amount against on-chain event logs directly (bypassing the backend's DB, in case *it* is the compromised layer) and finds the unauthorized release transaction |
| Stand down | Once the authorization gap is patched and redeployed, releases are re-enabled, drift stops widening, and a reconciliation job confirms no further discrepancy over one full cycle |
| Postmortem | Written within 2 business days using [postmortem-template.md](./postmortem-template.md), published to `docs/postmortems/2026-08-29-escrow-drift.md` |

## 3. Findings from this exercise

Findings surfaced by running through the scenario above. Each should be
filed as its own tracked GitHub issue (linked here once opened) rather than
left only in this document — this list is the seed, not the tracker.

1. **No documented "freeze releases" feature flag exists yet as a named,
   drilled procedure** — `admin.md#feature-flags` documents flags generally,
   but there's no single flag confirmed to gate *all* release paths, and no
   runbook step names it explicitly. *(needs tracking issue)*
2. **Reconciliation alert payloads don't include the affected trade IDs**,
   only an aggregate drift amount — Ops had to manually correlate against
   on-chain logs to find the specific bad transaction, which is slow under
   pressure. *(needs tracking issue — extend `reconciliation_drift_critical`
   alert details with candidate trade IDs where feasible)*
3. **The escalation matrix's "suspected fund loss" row names "eng lead +
   treasury/admin key holder" but not a concrete contact method** (phone?
   Slack DM? a paging tool?) — fine informally today, but should be made
   concrete before this scales past a small team. *(tracked informally;
   revisit once an on-call rotation is formalized, per
   [alert-routing-policy.md §4](../alert-routing-policy.md#4-on-call-and-escalation))*

## 4. Next exercise

Schedule the next tabletop after either: (a) a materially different
scenario category (e.g. a failed migration mid-flight, or a compromised
third-party dependency) to exercise different parts of the runbook, or (b)
any time the incident-response runbook changes in a way that would change
how this scenario plays out.
