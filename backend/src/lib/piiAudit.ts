import { appLogger } from "../middleware/logger";

export interface PiiAccessContext {
  /** Table/model holding the encrypted column, e.g. "DeliveryManifest" */
  resource: string;
  /** Primary key or trade identifier the encrypted row belongs to */
  recordId: string;
  /** Column(s) that were decrypted */
  fields: string[];
  /** Wallet address / identity of the caller that triggered the decrypt */
  actor: string;
  /** Why the decrypt happened, e.g. "manifest.view" */
  action: string;
}

/**
 * Writes a durable, structured audit log entry every time PII ciphertext is
 * decrypted. This is the "access logging on decrypt operations" control
 * required by the PII-at-rest encryption policy (docs/pii-encryption.md) —
 * it lets us answer "who read this driver's identity and when" without
 * touching application state or slowing down the decrypt path.
 *
 * Mirrors the structured-audit pattern used for escrow events in
 * `lib/escrowAudit.ts` so log aggregators can filter on `audit: true` and
 * `auditType` uniformly.
 */
export function logPiiAccess(ctx: PiiAccessContext): void {
  appLogger.info(
    {
      audit: true,
      auditType: "pii-decrypt",
      resource: ctx.resource,
      recordId: ctx.recordId,
      fields: ctx.fields,
      actor: ctx.actor,
      action: ctx.action,
      timestamp: new Date().toISOString(),
    },
    `[PiiAudit] decrypt ${ctx.resource}.[${ctx.fields.join(",")}] by ${ctx.actor}`,
  );
}
