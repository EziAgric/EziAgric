# CLI Clawback Tool

The `clawback` CLI tool lets administrators invoke an emergency admin clawback
on a funded Amana escrow trade directly from the terminal, bypassing the HTTP
API. It uses the same signing pattern as `SorobanAdminService`.

---

## Prerequisites

- Node.js ≥ 18
- `tsx` or `ts-node` available in the backend dev dependencies
- A valid Stellar admin secret key (`ADMIN_SECRET_KEY` or `--admin-key` flag)

---

## Usage

Run from the `backend/` directory:

```bash
npx tsx scripts/clawback.ts \
  --stream-id <escrow-trade-id> \
  --amount <amount-in-stroops> \
  [--admin-key <stellar-secret-key>] \
  [--rpc-url <soroban-rpc-url>] \
  [--network testnet|mainnet] \
  [--dry-run]
```

---

## Flags

| Flag           | Required | Description                                                                 |
|----------------|----------|-----------------------------------------------------------------------------|
| `--stream-id`  | ✅       | The escrow stream/trade ID to claw back.                                    |
| `--amount`     | ✅       | Clawback amount in stroops (positive integer). Must not exceed vested balance. |
| `--admin-key`  | ❌       | Stellar secret key. Falls back to `ADMIN_SECRET_KEY` env var.               |
| `--rpc-url`    | ❌       | Soroban RPC URL. Falls back to `STELLAR_RPC_URL` or `SOROBAN_RPC_URL` env. Defaults to testnet endpoint. |
| `--network`    | ❌       | `testnet` (default) or `mainnet`.                                           |
| `--dry-run`    | ❌       | Print the unsigned XDR without signing or submitting.                       |

---

## Examples

### Dry run (inspect without signing)

```bash
ADMIN_SECRET_KEY=SCZANGBA... npx tsx scripts/clawback.ts \
  --stream-id trade-00000000000000001 \
  --amount 1000000 \
  --dry-run
```

### Live — produce signed XDR for submission

```bash
ADMIN_SECRET_KEY=SCZANGBA... npx tsx scripts/clawback.ts \
  --stream-id trade-00000000000000001 \
  --amount 1000000 \
  --network testnet
```

### Mainnet with explicit key and RPC URL

```bash
npx tsx scripts/clawback.ts \
  --stream-id trade-00000000000000001 \
  --amount 5000000 \
  --admin-key SCZANGBA... \
  --rpc-url https://mainnet.sorobanrpc.com \
  --network mainnet
```

---

## Example Output

```
=== Amana Contract Clawback ===
Stream ID        : trade-00000000000000001
Amount (stroops) : 1000000
Admin Public Key : GDQZAIJQ...
Network          : testnet
Network Phrase   : Test SDF Network ; September 2015
Mode             : LIVE

--- Signed XDR (ready for RPC submission) ---
AAAAAgAAAAA...

NOTE: Submit via `stellar tx submit --xdr <signed-xdr>` or your RPC endpoint.
```

---

## Submitting the Signed XDR

The tool prints the signed XDR but does **not** submit it automatically. To submit:

```bash
# Using Stellar CLI
stellar tx submit --xdr "<signed-xdr>" --rpc-url https://soroban-testnet.stellar.org

# Using curl to the Soroban RPC endpoint
curl -X POST https://soroban-testnet.stellar.org \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"sendTransaction","params":{"transaction":"<signed-xdr>"}}'
```

---

## Security Notes

- **Never commit secret keys.** Always pass via the `ADMIN_SECRET_KEY` environment
  variable or a secrets manager, not directly on the command line.
- Use `--dry-run` first to verify the stream ID and amount before producing a live
  signed transaction.
- The tool does not auto-submit. The signed XDR requires a second deliberate step
  to be broadcast, reducing the risk of accidental execution.
- All clawback operations are recorded on-chain via `AdminClawbackEvent` and in
  the trade history. There is no way to undo a submitted clawback.

---

## Related

- Contract function: `admin_clawback(trade_id, amount, admin)` in `contracts/amana_escrow/src/lib.rs`
- Backend signing service: `backend/src/services/sorobanAdmin.service.ts`
- Error code mapping: `backend/src/services/contractClawbackError.service.ts`
- Error code reference: `docs/contract-error-codes.md`
