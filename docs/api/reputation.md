# Reputation API

Reputation exposes a wallet's trade history summary, a trust score, and recent
reputation events. Routes are defined in
[`backend/src/routes/reputation.routes.ts`](../../backend/src/routes/reputation.routes.ts)
and mounted under `/users` (also under `/api/v1/users`). Scoring lives in
[`backend/src/services/reputation.service.ts`](../../backend/src/services/reputation.service.ts).

The trust score formula implemented in code is described in
[Trust score](#trust-score) below. [`backend/docs/trust-score.md`](../../backend/docs/trust-score.md)
describes a different, weighted formula and does not match the code; treat
this page as the description of current behaviour.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/users/me/reputation` | Bearer token | Reputation for the caller |
| GET | `/users/:address/reputation` | None | Reputation for any wallet |
| GET | `/users/reputation/spec` | None | Trust score constants |
| POST | `/users/:address/reputation/recompute` | None | Recompute and store one wallet's score |
| POST | `/users/reputation/recompute-all` | None | Recompute all stored scores, return drift report |

Route order matters: `/users/me/reputation` is matched before
`/users/:address/reputation`, so `me` cannot be used as a wallet address.

> **Known issues (current code)**
> - `GET /users/reputation/spec` and `POST /users/reputation/recompute-all` call
>   `ReputationService.getTrustScoreSpec()` and `recomputeAllTrustScores()`,
>   which do not exist on the service. The shapes below are the intended
>   contract; the calls fail until the route is aligned with the service
>   (the nightly job is `runNightlyRecompute()`).
> - The two `recompute` endpoints have no `authMiddleware`. Anyone can trigger
>   a full recompute, which scans every stored reputation row. See
>   [Security notes](#security-notes).

### GET /users/me/reputation

Requires `Authorization: Bearer <token>`. The wallet is taken from the token,
not from the URL.

```bash
curl http://localhost:4000/users/me/reputation \
  -H 'Authorization: Bearer <token>'
```

Returns `200` with a [`ReputationResponse`](#reputationresponse). Returns `401`
when the token is missing or invalid.

### GET /users/:address/reputation

Public. `:address` is a Stellar public key; it is lowercased before lookup.

```bash
curl http://localhost:4000/users/GAAA...WHF/reputation
```

Returns `200` with a [`ReputationResponse`](#reputationresponse).

### GET /users/reputation/spec

Public. Intended to return the trust score constants so clients can display
the formula without hardcoding it.

Intended response `200`:

```json
{
  "base": 50,
  "weights": { "completedTrade": 5, "disputeLost": -8, "disputeInitiated": -2 },
  "volumeTiers": [
    { "minTrades": 50, "bonus": 15 },
    { "minTrades": 25, "bonus": 8 },
    { "minTrades": 10, "bonus": 5 }
  ],
  "min": 0,
  "max": 100
}
```

### POST /users/:address/reputation/recompute

Recomputes the trust score from the database and upserts it into the
reputation table. Intended for trade completion and dispute resolution flows
to keep scores fresh within one minute. No request body.

```bash
curl -X POST http://localhost:4000/users/GAAA...WHF/reputation/recompute
```

Returns `200` with the recomputed score as a bare JSON number, for example:

```json
62
```

### POST /users/reputation/recompute-all

Recomputes every stored reputation row (intended for a nightly cron) and
returns a drift report. No request body.

Intended response `200` (a [`DriftReport`](#driftreport)):

```json
{
  "checked": 120,
  "drifted": 2,
  "entries": [
    {
      "walletAddress": "gaaa...whf",
      "storedScore": 60,
      "computedScore": 62,
      "drift": 2
    }
  ]
}
```

## Response shapes

### ReputationResponse

```json
{
  "trustScore": 68,
  "totalTrades": 12,
  "completedTrades": 3,
  "disputedTrades": 1,
  "successRate": 25,
  "history": [
    {
      "id": "trade-3f9c2a1b-...",
      "event": "Completed trade as seller (3f9c2a1b...)",
      "impact": 5,
      "impactLabel": "+5",
      "timestamp": "2026-11-20T09:14:00.000Z",
      "type": "trade_completed"
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `trustScore` | integer | `0`–`100`, see [Trust score](#trust-score) |
| `totalTrades` | integer | Trades where the wallet is buyer or seller |
| `completedTrades` | integer | Trades in `COMPLETED` status |
| `disputedTrades` | integer | Trades in `DISPUTED` status |
| `successRate` | number | `completedTrades / totalTrades` as a percentage, one decimal. `100` when there are no trades |
| `history` | array | Up to 20 events, newest first |

`history[]` items:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Prefixed by source: `trade-`, `dispute-`, or `review-` |
| `event` | string | Human-readable description |
| `impact` | integer | Score contribution of this event |
| `impactLabel` | string | `impact` with an explicit `+` for non-negative values |
| `timestamp` | string | ISO 8601 |
| `type` | string | `trade_completed`, `dispute_initiated`, `dispute_resolved`, or `trade_review` |

### DriftReport

| Field | Type | Notes |
|---|---|---|
| `checked` | integer | Number of stored rows processed |
| `drifted` | integer | Number of rows whose stored score differed from the computed score |
| `entries` | array | `{ walletAddress, storedScore, computedScore, drift }`, where `drift = computedScore - storedScore` |

## Trust score

Implemented in `ReputationService.calculateTrustScore`:

```
score = clamp(0, 100,
    50                                  // base
  + 5  * completed trades               // as buyer or seller
  - 8  * disputes lost                  // disputes initiated and RESOLVED or CLOSED
  - 2  * disputes initiated             // all disputes the wallet opened
  + volume bonus)                       // by total trades: >=50: +15, >=25: +8, >=10: +5, else 0
```

`GET /users/:address/reputation` also adds `(rating - 3) * 2` for each review
received (ratings are 1–5), then clamps. The recompute endpoints do not include
reviews, so a stored score can differ from the one returned by the GET endpoint
for wallets with reviews.

Reviews are created by `ReputationService.submitTradeReview`, which is not
exposed by any route in `reputation.routes.ts`.

## Security notes

- `POST /users/:address/reputation/recompute` and
  `POST /users/reputation/recompute-all` are unauthenticated. The
  `recompute-all` endpoint does a full table scan with per-row writes, so it
  should be restricted to the scheduler (admin auth or an internal-only route)
  before it is exposed publicly.
