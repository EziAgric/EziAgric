# Threat Model Review Checklist

Use this checklist for every quarterly or trigger-based review of `docs/threat-model.md` (see §8 of that document for cadence and trigger conditions). Copy this checklist into the tracked review issue and check items off as you go.

- **Reviewer:** ____________________
- **Date:** ____________________
- **Trigger:** ☐ Quarterly cadence  ☐ New asset type  ☐ New privileged capability  ☐ New external integration  ☐ Control status change / new finding

## 1. Scope re-check

- [ ] Confirm §1 System Overview / trust boundaries still match the deployed architecture (contracts, backend, frontend, infra).
- [ ] Confirm §6 Scope & Exclusions still lists the correct in-scope/out-of-scope components.
- [ ] Note any new components (contracts, services, integrations) not yet reflected in the diagram.

## 2. Assets & stakeholders (§2)

- [ ] Confirm the asset table is complete (no new asset types, key holders, or data classes missing).

## 3. Threat matrix (§3)

- [ ] Re-read every existing threat entry; confirm "Current Controls" is still accurate.
- [ ] Add new threat entries for any new capability, integration, or asset type introduced since the last review.
- [ ] Retire/mark resolved any threat whose mitigation has since shipped.
- [ ] Re-assess "Likelihood" for entries affected by real-world incidents or usage data since the last review.

## 4. Security controls summary (§4)

- [ ] Update the status column (✅/❌) for every control based on what has actually shipped.
- [ ] Cross-reference shipped mitigations against §5 Recommendations Priority — remove items that are now done.

## 5. Recommendations priority (§5)

- [ ] Re-rank priorities given the current state of controls and any new findings.
- [ ] Confirm effort estimates are still reasonable.

## 6. Linkage

- [ ] Link this review from the corresponding security audit PR (if this review was triggered by or accompanies an audit).
- [ ] Append a changelog entry to `docs/threat-model.md` §8 summarizing what changed.
- [ ] If ownership is transferring, update the Owner line in §8 and note the handoff in the changelog.

## 7. Sign-off

- [ ] Reviewer confident the document reflects current reality.
- [ ] Any follow-up mitigation work filed as tracked issues (link them here): ____________________
