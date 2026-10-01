# Supply Chain Contract Event Schema Refactor

Standardizes event topics across produce tracking and payment release contracts.

## Driver Attestation

The escrow contract supports an optional driver per trade. A driver is registered
when the seller submits the manifest and may co-sign the delivery outcome via
`driver_attest`.

### `DRVATT` event

Emitted by `driver_attest(trade_id, outcome, evidence_cid)` after the registered
driver's authorization is verified and the attestation is stored.

| Field | Type | Description |
|---|---|---|
| `trade_id` | `u64` | Identifier of the trade being attested. |
| `driver` | `Address` | Registered driver that co-signed the delivery. |
| `outcome` | `u32` | Delivery outcome code supplied by the driver. |
| `evidence_cid` | `String` | Content identifier pointing at off-chain evidence. |

Topics: `(symbol_short!("DRVATT"), trade_id)`.

### Rules

- Only the address registered as the trade's driver can attest; any other
  signer receives a typed error.
- A trade without a registered driver cannot be attested.
- Attestation is immutable: a second `driver_attest` call for the same trade
  returns a typed error.
- The stored attestation is exposed through `get_trade` and the dedicated
  attestation getter.
