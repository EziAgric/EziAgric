# PII Encryption at Rest

**Owner:** Backend/Security (`@Ndifreke000`)
**Status:** Living document — update whenever a new PII-bearing column is added.
**Related:** `backend/src/services/encryption.service.ts`, `backend/src/services/manifest.service.ts`, `backend/src/lib/piiAudit.ts`, `backend/scripts/verify-pii-encryption.ts`

---

## 1. Classified PII Inventory

| Column | Table | Classification | Encrypted? | Search need |
|---|---|---|---|---|
| `driverName` | `DeliveryManifest` | Direct identifier (name) | ✅ App-layer AES-256-GCM | No — mediator/seller view only |
| `driverIdNumber` | `DeliveryManifest` | Direct identifier (gov't ID) | ✅ App-layer AES-256-GCM | No |
| `vehicleRegistration` | `DeliveryManifest` | Indirect identifier | ✅ App-layer AES-256-GCM | No |
| `routeDescription` | `DeliveryManifest` | Free-text, may contain address fragments | ✅ App-layer AES-256-GCM | No |
| `driverNameHash` / `driverIdHash` | `DeliveryManifest` | SHA-256 blind index of the above | N/A (already a one-way hash) | Yes — equality match, see §3 |
| `walletAddress` | `User`, `Trade.buyerAddress/sellerAddress`, etc. | Pseudonymous identifier (Stellar public key) | Not encrypted — public by design, required for on-chain joins and is not classified as PII under NDPR guidance for public blockchain addresses | Yes — primary key lookups |

There is currently **no phone/contact-number column** in `backend/prisma/schema.prisma`. If one is added (e.g. a `phone` field for delivery contact), it must be added to this table and to `PII_COLUMNS` in `backend/scripts/verify-pii-encryption.ts` before it ships, following the pattern in §2–§3 below.

## 2. Encryption Design

`EncryptionService` (`backend/src/services/encryption.service.ts`) implements envelope-style encryption:

- **Cipher:** AES-256-GCM (authenticated encryption).
- **Key derivation:** a per-record data key is derived with `pbkdf2Sync(masterSecret, salt, 200_000, 32, "sha256")`, where `salt = sha256(masterSecret:recordId:keyVersion)`. `recordId` is the trade ID today, which means every trade's manifest is encrypted under a distinct derived key even though they share one root secret (`JWT_SECRET` by default) — the "envelope" layer. Ciphertext is stored as `keyVersion:salt:iv:ciphertext:tag`.
- **Rotation:** `rotateCiphertext()` re-derives under a new `keyVersion` and re-encrypts, so old and new key versions can co-exist during a rotation (dual-version acceptance).

### Roadmap to full KMS-backed envelope encryption

The current design derives data keys from a single root secret in application config rather than a managed KMS. This is tracked as a **TODO**: swap `masterSecret` for a per-environment Data Encryption Key (DEK) fetched from a KMS (AWS KMS / GCP KMS / Vault Transit) and wrapped by a KMS Customer Master Key, so compromising `JWT_SECRET` alone no longer compromises PII ciphertext. This does not require a schema change — only `EncryptionService`'s key-sourcing.

## 3. Search-by-identity via blind index

Direct equality search on `driverName` / `driverIdNumber` is supported without decrypting rows, via `driverNameHash` / `driverIdHash` — SHA-256 hashes of the plaintext computed at write time (`manifest.service.ts::sha256`). These are deterministic, so `WHERE driverNameHash = sha256(query)` performs an equality blind-index lookup. They are intentionally **not** used for the on-chain audit trail's confidentiality guarantee alone — see `docs/threat-model.md` TH-D-02 for the preimage-reveal caveat during disputes.

## 4. Migration & Rollback

Ciphertext columns (`driverName`, `driverIdNumber`, `vehicleRegistration`, `routeDescription`) are plain `VARCHAR`/`TEXT` columns — encryption is transparent at the application layer (`ManifestService.submitManifest` always encrypts before `create`). No separate backfill migration was required because these columns were introduced encrypted-by-default (migration `20260326000001_add_manifest_evidence` plus `feat(backend): encrypt sensitive trade data at rest`).

Run `backend/scripts/verify-pii-encryption.ts` after any migration or backfill touching these tables to assert **zero plaintext remnants**:

```bash
npx ts-node backend/scripts/verify-pii-encryption.ts
```

It walks every column in the inventory table above and fails (exit code 1) if any stored value doesn't match the `keyVersion:salt:iv:ciphertext:tag` ciphertext envelope. Rollback plan: if a future migration needs to decrypt in bulk (e.g. moving to a new KMS scheme), use `EncryptionService.decrypt` / `rotateCiphertext` in a batched script guarded by the dual-version window described in §2, never a raw SQL `UPDATE`.

## 5. Access Logging on Decrypt

Every decrypt of manifest PII (`ManifestService.getManifestByTradeId`) writes a structured audit event via `logPiiAccess()` (`backend/src/lib/piiAudit.ts`), following the same `audit: true` convention as escrow audit logs (`backend/src/lib/escrowAudit.ts`). Each entry records `resource`, `recordId` (trade ID), `fields` decrypted, `actor` (caller wallet address), and `action`. Ship these logs to the same aggregator as other audit events and alert on unexpected `actor` values relative to trade participants/mediator allowlist.

## 6. Key Rotation Procedure & Drill

1. Introduce a new `keyVersion` (e.g. `v2`) constant.
2. Deploy `EncryptionService` accepting decrypts of both `v1` and `v2` payloads (already supported — `decrypt()` reads `keyVersion` from the payload itself, so old and new ciphertexts co-exist with no code change needed).
3. Run a batch job calling `rotateCiphertext(ciphertext, tradeId, "v2")` over all `DeliveryManifest` rows, writing the result back.
4. Run `verify-pii-encryption.ts` to confirm every row is re-encrypted and well-formed.
5. Once 100% migrated, retire the old master secret.

**Drill status:** TODO — schedule a staging drill rotating the manifest data key end-to-end (rotate → verify → retire) and record the outcome here with a date and owner, mirroring the format used in `docs/admin-secret-rotation.md`.

## 7. Performance Impact

TODO — measure p50/p95 latency of `POST /trades/:id/manifest` and `GET /trades/:id/manifest` with encryption enabled vs. a stubbed pass-through `EncryptionService`, and confirm the overhead is under the 10% budget set in issue #208. Not yet measured in this change.
