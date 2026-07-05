# Stellar Proxy Endpoints

These endpoints proxy the Stellar network (via Horizon) so clients don't
need to talk to Horizon directly or manage network selection themselves. The
backend targets whichever network `STELLAR_NETWORK` is configured for
(`testnet` or `pubnet`/mainnet).

None of these require a bearer token unless noted.

## Fee stats

`GET /stellar/fees`

Current network fee statistics, straight from Horizon's fee stats endpoint.

**Response `200`**

```json
{
  "feeCharged": { "min": "100", "max": "10000", "p50": "100" },
  "maxFee": { "min": "100", "max": "10000", "p50": "100" },
  "ledger": 51234567,
  "lastLedgerBaseFee": 100
}
```

`502` if Horizon is unreachable or errors.

## Transaction status

`GET /stellar/tx/:hash/status`

Looks up a submitted transaction by its 64-character hex hash and decodes
its result XDR into human-readable operation result codes.

**Response `200`**

```json
{
  "status": "success",
  "resultCodes": { "transaction": "txSUCCESS", "operations": ["opINNER"] },
  "ledger": 51234567,
  "hash": "a1b2c3...",
  "createdAt": "2026-07-05T12:00:00Z"
}
```

| Status | Meaning |
|---|---|
| `400` | `hash` missing or not 64 characters |
| `404` | Not found on the network yet - `{ "status": "pending", ... }`. A transaction that was just submitted may briefly 404 before Horizon ingests it; poll rather than treating this as a failure. |
| `502` | Horizon lookup failed for another reason |

## Assets

`GET /stellar/assets?issuer=<address>` - lists assets, optionally filtered by
issuer.

`GET /stellar/assets/:code?issuer=<address>` - lists assets matching a code,
optionally scoped to one issuer. `404` if nothing matches.

Both endpoints cache Horizon responses for 5 minutes; a cache hit is
indicated by `"cached": true` in the response so clients can tell freshness
apart from a live lookup.

**Response `200`**

```json
{
  "assets": [
    {
      "code": "USDC",
      "issuer": "GBBB...C4",
      "supply": "1000000.0000000",
      "authRequired": false,
      "authRevocable": false,
      "authClawbackEnabled": false,
      "numAccounts": 42
    }
  ],
  "cached": false
}
```

## Account balance

`GET /stellar/account/:address/balance`

**Response `200`**

```json
{
  "address": "GAAA...WHF",
  "balances": [
    { "assetType": "native", "assetCode": "XLM", "issuer": null, "balance": "100.0000000", "limit": null },
    { "assetType": "credit_alphanum4", "assetCode": "USDC", "issuer": "GBBB...C4", "balance": "250.0000000", "limit": "1000000" }
  ]
}
```

An address that's valid but not yet funded on-network returns `200` with an
empty `balances` array rather than a `404` - "not funded" and "no balances"
are treated as the same client-visible state. `400` for a malformed address
(must be 56 characters starting with `G`).

## Account creation

`POST /stellar/account/create`

Generates a new Stellar keypair server-side. **The response includes the
secret key, symmetrically encrypted** (`encryptedSecretKey`) - decrypting it
is the caller's responsibility using whatever key-management flow the
client app implements; the backend does not persist the plaintext secret.

**Request body** (all optional)

```json
{ "fund": true }
```

`fund: true` on testnet triggers a Friendbot airdrop so the account is
immediately usable; on mainnet `fund` is accepted but ignored (no automatic
funding exists there), and Friendbot failures don't fail account creation -
the account is still returned with `"funded": false`.

**Response `201`**

```json
{
  "publicKey": "GAAA...WHF",
  "encryptedSecretKey": "...",
  "funded": true
}
```

## Contract state

`GET /contract/:contractId/state?tradeId=<id>`

Reads a trade's on-chain escrow contract state directly from the Soroban
contract (not the backend's own database) - useful for verifying that the
backend's view of a trade matches the chain.

**Response `200`**

```json
{ "contractId": "CA...", "tradeId": "4294967297", "state": { "...": "..." } }
```

`tradeId` query parameter is required (`400 VALIDATION_ERROR` otherwise).

## Path payment quotes

`GET /wallet/path-payment-quote?sourceAmount=1000&sourceAsset=NGN&sourceAssetIssuer=<issuer>`

**Requires a bearer token.** Returns candidate Stellar path-payment routes
for converting `sourceAsset` into the trade settlement asset (USDC).

| Query param | Required | Notes |
|---|---|---|
| `sourceAmount` | yes | Decimal string |
| `sourceAsset` | yes | Asset code, or `native` for XLM |
| `sourceAssetIssuer` | only for non-native assets | Issuer's Stellar public key |

`400` with `{ "error": "Missing sourceAmount or sourceAsset" }` if either
required parameter is absent.
