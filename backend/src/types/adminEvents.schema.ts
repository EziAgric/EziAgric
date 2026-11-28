/**
 * Schemas for admin-related event/audit payloads, kept alongside the Prisma
 * models they describe so drift between what handlers persist and what the
 * rest of the system expects gets caught by tests instead of surfacing later
 * as bad data. See docs/api/admin.md ("Admin event schemas") for the field
 * reference.
 */
import { z } from "zod";

/**
 * `StreamClawback` event payload, as persisted to `StreamClawbackEvent` by
 * `handleStreamClawback` (see services/eventHandlers.ts).
 */
export const streamClawbackEventSchema = z.object({
  streamId: z.string().min(1, "streamId is required"),
  admin: z.string().min(1, "admin is required"),
  amount: z.string().regex(/^\d+$/, "amount must be a non-negative integer string"),
  txHash: z.string().min(1, "txHash is required"),
  timestamp: z.date(),
});

export type StreamClawbackEventPayload = z.infer<typeof streamClawbackEventSchema>;

/**
 * `AdminActionAudit` record, written whenever an admin action (e.g. stream
 * termination) needs a compliance audit trail (see
 * services/streamTermination.service.ts).
 */
export const adminActionAuditSchema = z.object({
  action: z.string().min(1, "action is required"),
  actorAddress: z.string().min(1, "actorAddress is required"),
  targetReference: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

export type AdminActionAuditPayload = z.infer<typeof adminActionAuditSchema>;
