# ADR-009: Trust Score Algorithm

## Status

Accepted. Describes the algorithm specified in
[backend/docs/trust-score.md](../../backend/docs/trust-score.md) and
implemented in the backend reputation service
(`backend/src/services/reputationService.ts`). That spec remains the reference
for exact constants and recompute mechanics. This ADR records **why** the
algorithm looks the way it does.

## Context

Each user has a trust score from 0 to 100. Two product behaviours depend on it:

- **Marketplace ranking.** Higher-scoring sellers appear more prominently, so
  the score directly affects who gets business.
- **Escrow terms.** Trades with low-trust counterparties can require a higher
  buyer/seller loss ratio (see [ADR-002](ADR-002-escrow-loss-sharing-model.md)),
  so the score affects how much risk each party carries.

Because the score moves money and visibility, it is an obvious target for
manipulation, and any change to it changes outcomes for real users. Until now
the design choices (which factors, what weights, how history ages, how gaming
is resisted) existed only as code and a spec with no rationale. Future
changes had nothing to be judged against.

Constraints we designed for:

1. **Explainable.** A farmer or food processor must be able to understand why
   their score is what it is. This rules out opaque ML models.
2. **Derived from facts the platform can verify.** Inputs come from trade and
   dispute records projected from on-chain events (see
   [ADR-003](ADR-003-offchain-vs-onchain-data-partitioning.md)), not from
   self-reported or client-submitted data.
3. **Bounded.** No single factor can dominate, and the score is always in
   `[0, 100]`.
4. **Cheap and deterministic to recompute,** so a nightly job can recompute
   everyone from source data and detect drift.

## Decision

### Scoring formula

A weighted sum of four inputs, each normalized to `[0, 1]` and capped:

```
completedScore = min(completedTrades / 50, 1)
disputeScore   = max(0, 1 - disputesLost / 5)
onTimeScore    = clamp(onTimeDeliveryRate, 0, 1)
volumeScore    = min(volume / 100000, 1)

trustScore = round2(clamp(100 * (
    0.40 * completedScore +
    0.25 * disputeScore +
    0.20 * onTimeScore +
    0.15 * volumeScore
), 0, 100))
```

### Factor weights and rationale

| Factor | Weight | Target / cap | Why this weight |
|---|---:|---|---|
| Completed trades | 40% | 50 trades | The strongest available signal: each completion is a trade where the counterparty released escrow. Largest weight because it is the hardest to fake (see anti-gaming). Saturates at 50 so long-standing users do not grow an unassailable lead. |
| Disputes lost | 25% | 5 losses → 0 | Only disputes **resolved against** the user count. Raised-but-won disputes do not, so a counterparty cannot lower someone's score just by opening a dispute. Five losses remove the whole factor. |
| On-time delivery | 20% | rate in `[0,1]` | Late delivery is the most common real-world complaint in agricultural trade (perishables), and it is measured against the deadline agreed in the trade. |
| Volume | 15% | 100,000 (settled, normalized) | Rewards a track record at scale, but kept lowest so large traders do not outrank smaller traders with a cleaner record. Capped so volume alone cannot buy rank. |

Weights sum to 1.0. Each factor is capped at 1, so one factor can contribute
at most its weight.

**New users start at 0**, not at a neutral midpoint. We chose that over a
neutral prior on purpose: a score earned from zero cannot be reset by creating
a new account (see anti-gaming). The UI shows "new trader" alongside a low
score so newcomers are not mistaken for bad actors.

### Decay function

**v1 uses no time decay** (the decay function is the identity: every
completed trade, lost dispute, and settled unit of volume counts the same
regardless of age). This is deliberate:

- Most users are early in their history. Decay would mostly push active,
  honest users down and make scores harder to explain.
- Caps already limit how much old history can help. A user with 50 old
  completions and 5 recent lost disputes still loses the entire 25% dispute
  factor.
- A pure aggregate is trivially reproducible by the nightly full recompute.
  A time-dependent score would change every night without any new event,
  which would turn drift detection into noise.

**When decay is introduced** (planned once the median account is older than
12 months), it will be exponential decay applied to each event before
aggregation:

```
weight(event) = 0.5 ^ (ageDays / HALF_LIFE_DAYS)     # HALF_LIFE_DAYS = 180
```

Lost disputes will use the same half-life, so a user can recover from an old
bad period. Introducing decay requires a new ADR that supersedes this
section, because it changes the drift-detection tolerance and every user's
score.

### Anti-gaming measures

| Threat | Mitigation |
|---|---|
| **Self-reported or client-forged stats** | All inputs come from the off-chain mirror of on-chain trade and dispute events ([ADR-003](ADR-003-offchain-vs-onchain-data-partitioning.md)). No API accepts a score or score input from a client. |
| **Wash trading** (two colluding accounts trading back and forth to pump completions and volume) | Every trade locks real cNGN in escrow and pays the protocol fee, so each fake completion has a real cost. Completions and volume are capped, which limits the payoff. Planned: count trades with the same counterparty at most N times toward `completedTrades`. |
| **Sybil / fresh-account reset** after a bad history | New accounts start at 0, so abandoning a low score gains nothing. |
| **Malicious dispute filing** to damage a competitor | Only disputes **lost** count. Opening a dispute that the mediator rules against the filer does not hurt the target. |
| **Volume whale dominance** | Volume weight is lowest (15%) and capped. |
| **Silent score tampering or bugs** | The nightly job recomputes every user from source aggregates, reports any score that drifts by more than `0.01`, and corrects it. |

### Research and prior art consulted

- **eBay feedback score and percent-positive.** Showed that a raw cumulative
  count rewards tenure over quality, which is why we cap completions and give
  dispute outcomes a separate factor.
- **Jøsang & Ismail, "The Beta Reputation System" (2002).** Basis for treating
  positive and negative outcomes as separate evidence and for the future
  exponential "forgetting factor" (decay) design.
- **Kamvar, Schlosser & Garcia-Molina, "The EigenTrust Algorithm" (2003).**
  Considered for collusion resistance via transitive trust. Rejected for v1
  because it is not explainable to end users and needs a much denser trade
  graph than we have.
- **Escrow marketplaces (Upwork Job Success Score, Airbnb Superhost).** Both
  weight dispute and cancellation outcomes heavily and publish their criteria.
  This supported an explainable, published formula over a hidden one.

## Consequences

- **Positive:** The score is explainable from four numbers the user can see in
  their trade history, and it is fully reproducible from source data, which
  is what makes nightly drift detection possible.
- **Positive:** Gaming the score costs real money (escrow plus fees) and gives
  a capped payoff. Filing disputes against competitors does not work.
- **Positive:** Proposed changes can now be judged against stated goals:
  explainability, verifiable inputs, bounded factors, determinism.
- **Negative:** Without decay, an old good history and a recent bad one can
  average out. We accept this for v1. Lost disputes are the main safeguard.
- **Negative:** Starting new users at 0 disadvantages legitimate newcomers in
  marketplace ranking. The UI label and buyers' ability to choose
  higher loss ratios offset this, but do not remove it.
- **Negative:** Wash trading between colluding accounts is made expensive, not
  impossible, until the per-counterparty cap is implemented.
- **Follow-up:** Any change to weights, targets, or the decay function must be
  recorded in a new ADR that supersedes the relevant section here, and must
  update [backend/docs/trust-score.md](../../backend/docs/trust-score.md) and
  the unit tests for each factor.
