import { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../lib/db";
import { AppError, ErrorCode } from "../errors/errorCodes";

/**
 * Stream reconciliation — compares on-chain contract events against backend
 * stream records and reports mismatches with expected and actual values (#34).
 *
 * The service queries:
 *  - The stream record (authoritative backend state)
 *  - StreamClawbackEvent records (on-chain clawback events ingested by the listener)
 *  - AdminActionAudit records (admin actions taken on this stream)
 *
 * It compares expected (computed from events) vs actual (DB state) for key
 * fields and returns a structured reconciliation result.
 */

/** A single field-level mismatch detected during reconciliation. */
export interface ReconciliationMismatch {
  /** The field that differs between expected and actual. */
  field: string;
  /** The value computed from on-chain events or derived from them. */
  expected: string;
  /** The value currently stored in the backend database. */
  actual: string;
  /** Where the expected value comes from. */
  source: "on-chain" | "backend" | "computed";
  /** Human-readable explanation of the mismatch. */
  description: string;
}

export interface ReconciliationResult {
  streamId: string;
  /** ISO-8601 timestamp of when the reconciliation was performed. */
  reconciledAt: string;
  /** True when no mismatches were found — the backend record is consistent with on-chain data. */
  consistent: boolean;
  /** List of mismatches detected. Empty when consistent. */
  mismatches: ReconciliationMismatch[];
  /** Summary snapshot of the backend stream state at reconciliation time. */
  streamSnapshot: {
    status: string;
    totalVested: string;
    claimed: string;
    unclaimed: string;
    pendingClawback: string;
  };
  /** Summary of on-chain clawback events for this stream. */
  onChainSummary: {
    clawbackEventCount: number;
    totalClawedBackOnChain: string;
  };
  /** Count of admin audit actions on this stream. */
  adminActionCount: number;
}

type StreamPrisma = Pick<
  PrismaClient,
  "stream" | "streamClawbackEvent" | "adminActionAudit"
>;

export class StreamReconciliationService {
  private prisma: StreamPrisma;

  constructor(prisma: StreamPrisma = defaultPrisma) {
    this.prisma = prisma;
  }

  /**
   * Reconcile a stream's backend state against on-chain event records.
   *
   * Throws AppError(NOT_FOUND, 404) when the stream does not exist.
   */
  async reconcile(streamId: string): Promise<ReconciliationResult> {
    const stream = await this.prisma.stream.findUnique({
      where: { streamId },
    });

    if (!stream) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        `Stream ${streamId} not found`,
        404,
        { streamId },
      );
    }

    // Query on-chain clawback events for this stream
    const clawbackEvents = await this.prisma.streamClawbackEvent.findMany({
      where: { streamId },
      orderBy: { timestamp: "asc" },
    });

    // Query admin audit actions for this stream
    const adminActions = await this.prisma.adminActionAudit.findMany({
      where: { targetReference: streamId },
    });

    const mismatches: ReconciliationMismatch[] = [];

    // ── Compute expected values from on-chain data ──────────────────────

    // Expected pendingClawback = sum of all on-chain clawback amounts
    const totalClawedBackOnChain = clawbackEvents
      .reduce((sum, ev) => sum + BigInt(ev.amount), BigInt(0))
      .toString();

    // Expected unclaimed = totalVested - claimed - pendingClawback (from on-chain)
    const expectedUnclaimed = (
      BigInt(stream.totalVested) -
      BigInt(stream.claimed) -
      BigInt(totalClawedBackOnChain)
    ).toString();

    // ── Compare fields ──────────────────────────────────────────────────

    // 1. pendingClawback: DB vs sum of on-chain clawback events
    if (stream.pendingClawback !== totalClawedBackOnChain) {
      mismatches.push({
        field: "pendingClawback",
        expected: totalClawedBackOnChain,
        actual: stream.pendingClawback,
        source: "on-chain",
        description:
          "Sum of StreamClawbackEvent amounts does not match the stream's pendingClawback field",
      });
    }

    // 2. unclaimed: computed from on-chain totals vs DB
    if (stream.unclaimed !== expectedUnclaimed) {
      mismatches.push({
        field: "unclaimed",
        expected: expectedUnclaimed,
        actual: stream.unclaimed,
        source: "computed",
        description:
          "Computed unclaimed (totalVested - claimed - onChainClawbacks) differs from stored unclaimed",
      });
    }

    // 3. Check if stream status is consistent with audit trail
    // If there's a STREAM_TERMINATE audit action but stream is not TERMINATED
    const hasTerminateAction = adminActions.some(
      (a) => a.action === "STREAM_TERMINATE",
    );
    if (hasTerminateAction && stream.status !== "TERMINATED") {
      mismatches.push({
        field: "status",
        expected: "TERMINATED",
        actual: stream.status,
        source: "backend",
        description:
          "An admin terminate audit record exists but the stream status is not TERMINATED",
      });
    }

    // 4. status: if stream is TERMINATED but no terminate audit record exists
    if (
      stream.status === "TERMINATED" &&
      !hasTerminateAction
    ) {
      mismatches.push({
        field: "status",
        expected: "ACTIVE or SUSPENDED (no terminate audit record found)",
        actual: stream.status,
        source: "backend",
        description:
          "Stream is TERMINATED but no STREAM_TERMINATE admin audit record exists — the termination may not have been recorded properly",
      });
    }

    return {
      streamId,
      reconciledAt: new Date().toISOString(),
      consistent: mismatches.length === 0,
      mismatches,
      streamSnapshot: {
        status: stream.status,
        totalVested: stream.totalVested,
        claimed: stream.claimed,
        unclaimed: stream.unclaimed,
        pendingClawback: stream.pendingClawback,
      },
      onChainSummary: {
        clawbackEventCount: clawbackEvents.length,
        totalClawedBackOnChain,
      },
      adminActionCount: adminActions.length,
    };
  }
}

export const streamReconciliationService = new StreamReconciliationService();
