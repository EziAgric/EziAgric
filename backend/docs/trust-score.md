# Trust Score Specification

This document defines how a user's **trust score** is calculated, when it is
recomputed, and how drift between the stored score and a freshly computed score
is detected.

The trust score is a value in the range `[0, 100]`. It is derived from four
inputs and is recomputed incrementally as trades close and disputes are
resolved, with a nightly full recompute job that reports drift.

## Inputs and weights

| Input | Symbol | Weight | Description |
|---|---|---|---|
| Completed trades | `completedTrades` | 40% | Number of trades the user has successfully completed. |
| Disputes lost | `disputesLost` | 25% | Number of disputes resolved against the user. |
| On-time delivery | `onTimeDeliveryRate` | 20% | Fraction of completed trades delivered on or before the agreed deadline (`0..1`). |
| Volume | `volume` | 15% | Total settled trade volume, normalized against a reference volume. |

Weights sum to `1.0`.

## Formula

Each input is normalized to `[0, 1]` before weighting:

```
completedScore = min(completedTrades / COMPLETED_TRADES_TARGET, 1)
disputeScore   = max(0, 1 - disputesLost / DISPUTES_LOST_TARGET)
onTimeScore    = clamp(onTimeDeliveryRate, 0, 1)
volumeScore    = min(volume / VOLUME_TARGET, 1)

trustScore = 100 * (
    0.40 * completedScore +
    0.25 * disputeScore +
    0.20 * onTimeScore +
    0.15 * volumeScore
)
```

Reference constants (see `reputation.service.ts`):

| Constant | Value |
|---|---|
| `COMPLETED_TRADES_TARGET` | 50 |
| `DISPUTES_LOST_TARGET` | 5 |
| `VOLUME_TARGET` | 100000 |

The result is rounded to two decimal places and clamped to `[0, 100]`.

### Edge cases

- A user with no history has `completedTrades = 0`, `disputesLost = 0`,
  `onTimeDeliveryRate = 0`, `volume = 0`, yielding a score of `0`.
- `disputesLost` above `DISPUTES_LOST_TARGET` floors `disputeScore` at `0`
  rather than producing a negative contribution.
- Inputs above their targets are capped at `1` so a single factor cannot push
  the score beyond `100`.

## Recompute triggers

Scores are recomputed incrementally so that a user's score reflects a trade
within **1 minute** of the triggering event:

| Event | Trigger |
|---|---|
| Trade completed | `recomputeTrustScore(userId)` on trade completion. |
| Dispute resolved | `recomputeTrustScore(userId)` for each affected party on dispute resolution. |

Both triggers call the same `recomputeTrustScore` entry point, which reads the
current aggregates, applies the formula above, and persists the new score.

## Nightly full recompute job

The nightly job recomputes the trust score for **every** user from source
aggregates and compares the result against the stored score. Any user whose
stored score differs from the recomputed score beyond the drift tolerance is
included in a **drift report**.

- Schedule: once per night (off-peak).
- Drift tolerance: `0.01` (scores are stored to two decimal places).
- Report contents: `userId`, `storedScore`, `recomputedScore`, `delta`.
- The job persists the recomputed score for every user, correcting any drift.

## Unit tests

Each factor is covered by a dedicated unit test in
`backend/src/services/reputation.service.test.ts`:

- completed trades factor
- disputes lost factor
- on-time delivery factor
- volume factor
- combined score and clamping
- incremental recompute on trade completion / dispute resolution
- nightly recompute drift detection
