/**
 * Audit Service
 *
 * Appends trade state transitions to the immutable trade_audit_log table.
 * Write-only: the table rejects UPDATE/DELETE/TRUNCATE, so there is no read-modify path here.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";

export interface TradeAuditEventInput {
  tradeId: string;
  eventType: string;
  actorId?: string;
  metadata?: Prisma.InputJsonValue;
}

export async function recordTradeAuditEvent(input: TradeAuditEventInput) {
  return prisma.tradeAuditLog.create({
    data: {
      tradeId: input.tradeId,
      eventType: input.eventType,
      actorId: input.actorId ?? null,
      metadata: input.metadata ?? Prisma.JsonNull,
    },
  });
}
