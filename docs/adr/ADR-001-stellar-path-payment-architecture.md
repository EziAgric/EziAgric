# ADR-001: Stellar Path Payment Architecture

## Status

Accepted (implemented in `backend/src/services/pathPayment.service.ts`,
exposed via `GET /wallet/path-payment-quote` - see
[docs/api/stellar.md](../api/stellar.md#path-payment-quotes)).

## Context

Amana settles trades in USDC on Stellar, but buyers frequently hold other
assets (most notably NGN-pegged tokens, or XLM). Requiring a buyer to
manually acquire USDC before funding a trade is friction that pushes people
off the platform. Stellar's DEX supports **path payments**, which let a
sender pay in one asset while the receiver gets another, atomically, via an
on-network conversion path - but discovering a *viable* path (one with
enough liquidity for the amount involved) requires querying Horizon's
`strictSendPaths` endpoint, and that endpoint is an external network
dependency that can be slow, rate-limited, or briefly unavailable.

We needed a way to expose "what will I get if I pay with X" to the frontend
without making every quote request a single point of failure for the rest
of the API.

## Decision

1. **Always quote against USDC as the destination asset.** The backend
   resolves the correct USDC issuer for the configured network
   (`USDC_ISSUER_MAINNET`/`USDC_ISSUER_TESTNET`) rather than accepting an
   arbitrary destination asset - trade settlement is always USDC, so the
   quote endpoint's job is narrowly "convert this into what a trade needs,"
   not a general-purpose DEX quoting service.
2. **Source asset defaults to a fixed test/reference issuer when the caller
   doesn't supply one**, so the endpoint has a sane behavior in
   non-production environments without every caller needing to know a real
   issuer address.
3. **Wrap the Horizon call in both a retry and a circuit breaker**
   (`retryAsync` from `lib/retry.ts`, `CircuitBreaker` from
   `lib/circuitBreaker.ts`, named `horizon-path-payment`):
   - `retryAsync` absorbs transient failures (network blips, Horizon 5xx)
     with backoff, so a single flaky request doesn't surface as an error to
     the client.
   - The circuit breaker (5 consecutive failures to open, 2 successes in
     half-open to close, 30s cooldown) protects the rest of the backend
     from a sustained Horizon outage - once open, quote requests fail fast
     with a clear "temporarily unavailable" error instead of piling up
     retries against a dead dependency.
4. **The quote endpoint is read-only and side-effect-free.** It never
   builds or submits a transaction; it only returns candidate routes
   (`source_amount`, `destination_amount`, `path`, etc.) for the client to
   choose from before initiating an actual payment/deposit flow elsewhere.
5. **No caching of path payment quotes.** Unlike `stellar.asset.ts` (which
   caches asset lookups for 5 minutes - see
   [docs/api/stellar.md](../api/stellar.md#assets)), path quotes are
   time-sensitive to DEX liquidity and are deliberately fetched live every
   time rather than risking a stale quote a user acts on.

## Consequences

- **Positive:** A Horizon outage degrades gracefully (fast, clear failure
  via the circuit breaker) instead of cascading into slow timeouts across
  the API.
- **Positive:** Buyers can fund trades from whatever asset they hold,
  which is the entire point of exposing this endpoint.
- **Negative:** Quotes are advisory only - the actual conversion happens
  when the buyer's wallet builds and submits the real path payment
  transaction client-side, and DEX liquidity can move between quote and
  execution. The backend does not (and cannot, without holding funds)
  guarantee the quoted rate.
- **Negative:** The circuit breaker is process-local (an in-memory
  `Map`-backed registry in `lib/circuitBreaker.ts`), so in a multi-instance
  deployment each instance trips independently - a coordinated view of
  Horizon health across instances would need a shared store, which we
  don't have today.
- **Follow-up:** If additional Horizon-backed endpoints need the same
  resilience pattern, extract the retry+circuit-breaker wrapping into a
  shared helper rather than re-implementing it per service - `stellar.fees.ts`
  and `stellar.tx.status.ts` currently handle Horizon failures with a bare
  `try/catch` -> `502`, not this pattern, and might benefit from it as they
  see more traffic.

## Addendum: Seller Payout Destination Preferences (cNGN -> NGN off-ramp)

### Status

Proposed (issue #396). This addendum extends the path payment architecture
above to cover the *outbound* leg: sellers who want to convert settled USDC
into NGN held in a bank account.

### Context

Sellers ultimately want NGN in a bank account, not a Stellar asset. The
path payment flow above only closes the loop for *buyers* funding trades.
To close the loop for sellers we need an off-ramp from cNGN (the NGN-pegged
Stellar asset) to fiat NGN, and we need to remember, per seller, whether
they want to be paid out to a Stellar wallet or to a bank account via an
anchor.

### Candidate cNGN anchors

Anchors are evaluated against the SEP-1 `stellar.toml` discovery document,
SEP-10 auth, SEP-24 interactive deposit/withdraw, and testnet availability.
The table below is the research artifact required by issue #396; entries
are filled in as each anchor is verified against its testnet `stellar.toml`.

| Anchor | SEP-1 | SEP-10 | SEP-24 | Testnet | Notes |
|---|---|---|---|---|---|
| Anchor candidate A (cNGN issuer) | TBD | TBD | TBD | TBD | Verify `TRANSFER_SERVER_SEP0024` + `WEB_AUTH_ENDPOINT` in `stellar.toml`. |
| Anchor candidate B | TBD | TBD | TBD | TBD | Verify withdraw support for cNGN asset code/issuer. |
| Anchor candidate C | TBD | TBD | TBD | TBD | Verify KYC requirements and NGN bank payout rails. |

Selection criteria, in priority order:

1. Supports SEP-24 **withdraw** for the cNGN asset (not just deposit).
2. Publishes a testnet `stellar.toml` so the end-to-end demo can run on
   testnet.
3. Reasonable KYC surface (SEP-12 optional) and NGN bank payout coverage.
4. Operationally stable (uptime, published status page).

### Decision

1. **Payout preference is stored per seller** as a discriminated value:
   `wallet` (default - pay out to the seller's Stellar address) or
   `anchor_offramp` (pay out to a bank account via a SEP-24 anchor). The
   preference is persisted alongside the seller record and read by the
   payout service; it does not change how trades settle, only where the
   resulting funds are sent.
2. **Anchor interaction uses SEP-10 for authentication.** The backend
   fetches the anchor's `stellar.toml`, reads `WEB_AUTH_ENDPOINT`, requests
   a challenge transaction, signs it with the seller's (or a dedicated
   payout) Stellar keypair, and exchanges the signed challenge for a JWT.
   The JWT is held only for the duration of the withdraw flow and is never
   persisted.
3. **SEP-24 drives the interactive withdraw flow.** With a valid SEP-10
   JWT the backend calls the anchor's `TRANSFER_SERVER_SEP0024`
   `/transactions/withdraw/interactive` endpoint, returns the interactive
   URL to the client, and polls `/transaction` until the anchor reports a
   terminal status. The backend does not custody funds at any point.
4. **Secrets follow `docs/secrets-policy.md`.** Anchor endpoints, signing
   keys, and any anchor API credentials are supplied via environment
   variables (never committed), consistent with the existing
   `USDC_ISSUER_*` handling. No anchor secret is logged.

### Consequences

- **Positive:** Sellers can choose wallet or bank payout without changing
  the settlement path; the off-ramp is additive.
- **Positive:** SEP-10/SEP-24 are standard, so swapping anchors is a
  configuration change rather than a code change.
- **Negative:** The off-ramp depends on a third-party anchor's availability
  and KYC process; failures there are outside our control and must surface
  as clear, retryable errors to the seller.
- **Negative:** Interactive SEP-24 flows require a client round-trip
  (KYC, bank details), so the withdraw is not fully headless.
- **Follow-up:** Once an anchor is selected, add a testnet end-to-end
  withdraw demo and wire the payout preference into the seller settings
  API.
