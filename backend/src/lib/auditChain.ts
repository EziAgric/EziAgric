import crypto from "crypto";

/** Fields hashed into each AdminActionAudit chain link. */
export interface AuditChainEntryInput {
  action: string;
  actorAddress: string;
  targetReference: string | null | undefined;
  note: string | null | undefined;
  createdAt: Date;
}

/**
 * Computes this entry's chain hash from its own fields plus the previous
 * entry's hash. Chaining `prevHash` in means any edit to an older row (value
 * change, or deletion) changes every hash after it, making tampering with
 * already-written rows detectable by recomputing the chain.
 *
 * This proves rows haven't been altered/deleted after being chained — it does
 * NOT prove an entry was written at the claimed time (no external timestamp
 * anchor) or prevent a DB admin with write access from truncating the table
 * and rebuilding a self-consistent fake chain from scratch.
 */
export function computeAuditEntryHash(prevHash: string, entry: AuditChainEntryInput): string {
  const canonical = JSON.stringify({
    prevHash,
    action: entry.action,
    actorAddress: entry.actorAddress,
    targetReference: entry.targetReference ?? null,
    note: entry.note ?? null,
    createdAt: entry.createdAt.toISOString(),
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}
