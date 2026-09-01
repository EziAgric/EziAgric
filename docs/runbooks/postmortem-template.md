# Postmortem Template

Copy this into a new file under `docs/postmortems/YYYY-MM-DD-short-slug.md`
(matching the incident channel/ticket slug from
[incident-response.md](./incident-response.md#incident-channel--ticket-conventions))
and fill it in. This is blameless: the goal is to understand the system and
process gaps that allowed the incident, not to find who to blame. Write
about actions and decisions, not people ("the deploy lacked a health check
gate", not "X forgot to check the dashboard").

---

## Title

`<short, symptom-based title>` — e.g. "Trade release endpoint returning 500s
for 40 minutes"

**Date:** `<yyyy-mm-dd>`
**Severity:** `<P0 | P1 | P2 | P3>` (see [incident-response.md](./incident-response.md#severity-levels))
**Incident Commander:** `<role holder, not necessarily named — "on-call eng" is fine>`
**Tracking issue:** `<link>`
**Incident channel:** `<#incident-yyyy-mm-dd-slug>`

## Summary

Two or three sentences: what broke, for whom, for how long, and what the
user-visible impact was. Someone who wasn't in the incident channel should
be able to read just this and understand what happened.

## Impact

- Duration: `<start> - <end>` (wall clock, and duration)
- Who/what was affected: `<e.g. "all trade releases", "buyers on wallet X only">`
- Quantified where possible: `<e.g. "12 trade releases failed and were retried successfully after mitigation; no funds were lost">`

## Timeline

All times in UTC. Pull this from the incident channel/ticket timeline
rather than reconstructing from memory.

| Time | Event |
|---|---|
| `HH:MM` | First signal (alert fired / user report / manual observation) |
| `HH:MM` | Incident acknowledged, severity classified as `<Pn>` |
| `HH:MM` | Mitigation attempted: `<what>` |
| `HH:MM` | Mitigation confirmed effective / escalated further |
| `HH:MM` | Incident stood down |

## Root cause

What actually caused this, traced to the underlying condition — not just
"the rollback fixed it." Use as many "why" steps as it takes to get past a
symptom to a fixable cause (typically 3-5):

1. Why did users see `<symptom>`? Because `<...>`.
2. Why did `<...>` happen? Because `<...>`.
3. Why was that possible? Because `<...>`.
4. (continue until you reach something you can actually act on)

## What mitigated it

The specific action that stopped user impact, and why it worked (or, if the
incident self-resolved before mitigation landed, say so).

## What went well

Detection speed, an existing runbook that worked as written, a fast
rollback, good communication — call out what to keep doing.

## What went wrong / gaps

Missing alerting, an ambiguous runbook step, a slow escalation, a monitoring
blind spot, a migration that lacked a rollback plan — call out what let this
happen or made it worse.

## Action items

Every item needs an owner and a rough timeframe (not necessarily a hard
deadline) so it doesn't silently rot. File each as its own tracked issue and
link it here rather than leaving action items only in this document.

| Action item | Owner | Target | Tracking issue |
|---|---|---|---|
| `<e.g. "add alert for X">` | `<owner>` | `<e.g. "next sprint">` | `<link>` |

## Follow-up verification

How will you confirm the action items actually prevented recurrence (a
regression test, a new alert firing correctly in a drill, a chaos/game-day
exercise)? Note it here so "prevent recurrence" isn't just a claim.
