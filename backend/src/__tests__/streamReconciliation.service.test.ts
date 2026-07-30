/**
 * streamReconciliation.service.test.ts — unit tests for StreamReconciliationService.reconcile() (#34)
 *
 * Exercises the service directly against a fake Prisma client. Covers:
 *  - Consistent states (no mismatches)
 *  - Individual and compound mismatches
 *  - Both directions of status reconciliation
 *  - Large-number BigInt arithmetic
 *  - Unknown stream (404)
 *  - DB error propagation
 */

import { StreamReconciliationService } from "../services/streamReconciliation.service";
import { AppError } from "../errors/errorCodes";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STREAM_ID = "stream-abc-123";

type StreamRecord = {
  streamId: string;
  recipient: string;
  totalVested: string;
  claimed: string;
  unclaimed: string;
  pendingClawback: string;
  status: string;
  terminatedAt: Date | null;
  terminatedBy: string | null;
  terminationReason: string | null;
};

type ClawbackEvent = {
  streamId: string;
  admin: string;
  amount: string;
  timestamp: Date;
  txHash: string;
};

type AuditRecord = {
  action: string;
  actorAddress: string;
  targetReference: string | null;
  note: string | null;
  createdAt: Date;
};

function makeStream(overrides: Partial<StreamRecord> = {}): StreamRecord {
  return {
    streamId: STREAM_ID,
    recipient: "GRECIPIENT000000000000000000000000000000000000000000",
    totalVested: "10000",
    claimed: "2500",
    unclaimed: "7500",
    pendingClawback: "0",
    status: "ACTIVE",
    terminatedAt: null,
    terminatedBy: null,
    terminationReason: null,
    ...overrides,
  };
}

function makePrisma(overrides: {
  stream?: StreamRecord | null;
  clawbackEvents?: ClawbackEvent[];
  adminActions?: AuditRecord[];
  /** If true, stream.findUnique throws */
  streamError?: Error;
  /** If true, clawbackEvents.findMany throws */
  clawbackError?: Error;
  /** If true, adminActions.findMany throws */
  adminError?: Error;
} = {}) {
  const {
    stream = makeStream(),
    clawbackEvents = [],
    adminActions = [],
    streamError,
    clawbackError,
    adminError,
  } = overrides;

  return {
    stream: {
      findUnique: jest.fn(async ({ where }: { where: { streamId: string } }) => {
        if (streamError) throw streamError;
        return stream && stream.streamId === where.streamId ? { ...stream } : null;
      }),
    },
    streamClawbackEvent: {
      findMany: jest.fn(async () => {
        if (clawbackError) throw clawbackError;
        return clawbackEvents;
      }),
    },
    adminActionAudit: {
      findMany: jest.fn(async (args?: { where?: { targetReference?: string } }) => {
        if (adminError) throw adminError;
        if (args?.where?.targetReference) {
          return adminActions.filter((a) => a.targetReference === args.where!.targetReference);
        }
        return adminActions;
      }),
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("StreamReconciliationService.reconcile", () => {
  // ── Consistent states ────────────────────────────────────────────────────

  describe("consistent states", () => {
    it("returns consistent=true with no mismatches for a clean active stream", async () => {
      const prisma = makePrisma();
      const svc = new StreamReconciliationService(prisma as never);

      const result = await svc.reconcile(STREAM_ID);

      expect(result.consistent).toBe(true);
      expect(result.mismatches).toEqual([]);
      expect(result.streamSnapshot).toMatchObject({
        status: "ACTIVE",
        totalVested: "10000",
        claimed: "2500",
        unclaimed: "7500",
        pendingClawback: "0",
      });
      expect(result.onChainSummary).toEqual({
        clawbackEventCount: 0,
        totalClawedBackOnChain: "0",
      });
      expect(result.adminActionCount).toBe(0);
      expect(typeof result.reconciledAt).toBe("string");
      expect(result.streamId).toBe(STREAM_ID);
    });

    it("is consistent when pendingClawback equals the sum of on-chain clawback events", async () => {
      const prisma = makePrisma({
        stream: makeStream({
          totalVested: "20000",
          claimed: "5000",
          unclaimed: "8000",
          pendingClawback: "7000",
        }),
        clawbackEvents: [
          { streamId: STREAM_ID, admin: "GA", amount: "3000", timestamp: new Date("2026-01-01"), txHash: "tx1" },
          { streamId: STREAM_ID, admin: "GA", amount: "2500", timestamp: new Date("2026-01-02"), txHash: "tx2" },
          { streamId: STREAM_ID, admin: "GA", amount: "1500", timestamp: new Date("2026-01-03"), txHash: "tx3" },
        ],
      });
      const svc = new StreamReconciliationService(prisma as never);

      const result = await svc.reconcile(STREAM_ID);

      expect(result.consistent).toBe(true);
      expect(result.onChainSummary.clawbackEventCount).toBe(3);
      expect(result.onChainSummary.totalClawedBackOnChain).toBe("7000");
    });

    it("is consistent when stream is TERMINATED with matching terminate audit record", async () => {
      const prisma = makePrisma({
        stream: makeStream({
          status: "TERMINATED",
          terminatedAt: new Date("2026-01-15"),
          terminatedBy: "GADMIN",
          terminationReason: "Fraud investigation",
        }),
        adminActions: [
          {
            action: "STREAM_TERMINATE",
            actorAddress: "GADMIN",
            targetReference: STREAM_ID,
            note: "Fraud investigation",
            createdAt: new Date("2026-01-15"),
          },
        ],
      });
      const svc = new StreamReconciliationService(prisma as never);

      const result = await svc.reconcile(STREAM_ID);

      expect(result.consistent).toBe(true);
      expect(result.adminActionCount).toBe(1);
      expect(result.mismatches).toEqual([]);
    });

    it("is consistent when a SUSPENDED stream has no terminate audit", async () => {
      const prisma = makePrisma({
        stream: makeStream({ status: "SUSPENDED" }),
      });
      const svc = new StreamReconciliationService(prisma as never);

      const result = await svc.reconcile(STREAM_ID);

      expect(result.consistent).toBe(true);
    });

    it("returns zero unclaimed when everything has been clawed back", async () => {
      const prisma = makePrisma({
        stream: makeStream({
          totalVested: "10000",
          claimed: "1000",
          unclaimed: "0",
          pendingClawback: "9000",
        }),
        clawbackEvents: [
          { streamId: STREAM_ID, admin: "GA", amount: "9000", timestamp: new Date(), txHash: "tx" },
        ],
      });
      const svc = new StreamReconciliationService(prisma as never);

      const result = await svc.reconcile(STREAM_ID);

      expect(result.consistent).toBe(true);
    });
  });

  // ── Individual mismatches ────────────────────────────────────────────────

  describe("individual mismatches", () => {
    it("detects pendingClawback mismatch", async () => {
      const prisma = makePrisma({
        stream: makeStream({ pendingClawback: "0" }),
        clawbackEvents: [
          { streamId: STREAM_ID, admin: "GA", amount: "5000", timestamp: new Date(), txHash: "tx" },
        ],
      });
      const svc = new StreamReconciliationService(prisma as never);

      const result = await svc.reconcile(STREAM_ID);

      expect(result.consistent).toBe(false);
      expect(result.mismatches).toContainEqual({
        field: "pendingClawback",
        expected: "5000",
        actual: "0",
        source: "on-chain",
        description: expect.stringContaining("pendingClawback"),
      });
    });

    it("detects pendingClawback mismatch when DB overstates the amount", async () => {
      const prisma = makePrisma({
        stream: makeStream({ pendingClawback: "9999" }),
        clawbackEvents: [
          { streamId: STREAM_ID, admin: "GA", amount: "100", timestamp: new Date(), txHash: "tx" },
        ],
      });
      const svc = new StreamReconciliationService(prisma as never);

      const result = await svc.reconcile(STREAM_ID);

      expect(result.consistent).toBe(false);
      const m = result.mismatches.find((x) => x.field === "pendingClawback")!;
      expect(m.expected).toBe("100");
      expect(m.actual).toBe("9999");
    });

    it("detects unclaimed mismatch", async () => {
      const prisma = makePrisma({
        stream: makeStream({
          totalVested: "10000",
          claimed: "2000",
          unclaimed: "8000", // should be 3000 = 10000 - 2000 - 5000
          pendingClawback: "0",
        }),
        clawbackEvents: [
          { streamId: STREAM_ID, admin: "GA", amount: "5000", timestamp: new Date(), txHash: "tx" },
        ],
      });
      const svc = new StreamReconciliationService(prisma as never);

      const result = await svc.reconcile(STREAM_ID);

      expect(result.consistent).toBe(false);
      expect(result.mismatches).toContainEqual({
        field: "unclaimed",
        expected: "3000",
        actual: "8000",
        source: "computed",
        description: expect.stringContaining("unclaimed"),
      });
    });

    it("detects status mismatch: terminate audit exists but stream is not TERMINATED", async () => {
      const prisma = makePrisma({
        stream: makeStream({ status: "ACTIVE" }),
        adminActions: [
          {
            action: "STREAM_TERMINATE",
            actorAddress: "GADMIN",
            targetReference: STREAM_ID,
            note: null,
            createdAt: new Date(),
          },
        ],
      });
      const svc = new StreamReconciliationService(prisma as never);

      const result = await svc.reconcile(STREAM_ID);

      expect(result.consistent).toBe(false);
      expect(result.mismatches).toContainEqual({
        field: "status",
        expected: "TERMINATED",
        actual: "ACTIVE",
        source: "backend",
        description: expect.stringContaining("terminate audit record"),
      });
    });

    it("detects status mismatch: stream TERMINATED but no terminate audit exists", async () => {
      const prisma = makePrisma({
        stream: makeStream({ status: "TERMINATED" }),
      });
      const svc = new StreamReconciliationService(prisma as never);

      const result = await svc.reconcile(STREAM_ID);

      expect(result.consistent).toBe(false);
      expect(result.mismatches).toContainEqual({
        field: "status",
        expected: "ACTIVE or SUSPENDED (no terminate audit record found)",
        actual: "TERMINATED",
        source: "backend",
        description: expect.stringContaining("no STREAM_TERMINATE"),
      });
    });
  });

  // ── Compound mismatches ──────────────────────────────────────────────────

  describe("compound mismatches", () => {
    it("reports all mismatches simultaneously when multiple fields are off", async () => {
      const prisma = makePrisma({
        stream: makeStream({
          totalVested: "50000",
          claimed: "10000",
          unclaimed: "20000", // should be 10000 (50000 - 10000 - 30000)
          pendingClawback: "0", // should be 30000
          status: "ACTIVE", // should be TERMINATED based on audit
        }),
        clawbackEvents: [
          { streamId: STREAM_ID, admin: "GA", amount: "30000", timestamp: new Date(), txHash: "tx" },
        ],
        adminActions: [
          {
            action: "STREAM_TERMINATE",
            actorAddress: "GADMIN",
            targetReference: STREAM_ID,
            note: null,
            createdAt: new Date(),
          },
        ],
      });
      const svc = new StreamReconciliationService(prisma as never);

      const result = await svc.reconcile(STREAM_ID);

      expect(result.consistent).toBe(false);
      expect(result.mismatches.length).toBe(3);

      const fields = result.mismatches.map((m) => m.field);
      expect(fields).toContain("pendingClawback");
      expect(fields).toContain("unclaimed");
      expect(fields).toContain("status");
    });

    it("does not produce duplicate status mismatches", async () => {
      // If stream is ACTIVE and has a terminate audit, only one status mismatch
      const prisma = makePrisma({
        stream: makeStream({ status: "ACTIVE" }),
        adminActions: [
          {
            action: "STREAM_TERMINATE",
            actorAddress: "GADMIN",
            targetReference: STREAM_ID,
            note: null,
            createdAt: new Date(),
          },
        ],
      });
      const svc = new StreamReconciliationService(prisma as never);

      const result = await svc.reconcile(STREAM_ID);

      const statusMismatches = result.mismatches.filter((m) => m.field === "status");
      expect(statusMismatches.length).toBe(1);
    });
  });

  // ── Large-number arithmetic ──────────────────────────────────────────────

  describe("large-number BigInt arithmetic", () => {
    it("handles very large vested amounts without overflow", async () => {
      const hugeAmount = "999999999999999999999999999999"; // 30 digits
      const prisma = makePrisma({
        stream: makeStream({
          totalVested: hugeAmount,
          claimed: "0",
          unclaimed: hugeAmount,
          pendingClawback: "0",
        }),
      });
      const svc = new StreamReconciliationService(prisma as never);

      const result = await svc.reconcile(STREAM_ID);

      expect(result.consistent).toBe(true);
      expect(result.streamSnapshot.totalVested).toBe(hugeAmount);
    });

    it("computes large on-chain clawback sums correctly", async () => {
      const prisma = makePrisma({
        stream: makeStream({
          totalVested: "1000000000000000000",
          claimed: "0",
          unclaimed: "0",
          pendingClawback: "1000000000000000000",
        }),
        clawbackEvents: [
          { streamId: STREAM_ID, admin: "GA", amount: "500000000000000000", timestamp: new Date(), txHash: "tx1" },
          { streamId: STREAM_ID, admin: "GA", amount: "500000000000000000", timestamp: new Date(), txHash: "tx2" },
        ],
      });
      const svc = new StreamReconciliationService(prisma as never);

      const result = await svc.reconcile(STREAM_ID);

      expect(result.consistent).toBe(true);
      expect(result.onChainSummary.totalClawedBackOnChain).toBe("1000000000000000000");
    });
  });

  // ── Unknown stream ───────────────────────────────────────────────────────

  describe("unknown stream", () => {
    it("throws AppError with 404 when stream does not exist", async () => {
      const prisma = makePrisma({ stream: null });
      const svc = new StreamReconciliationService(prisma as never);

      await expect(svc.reconcile("non-existent-stream")).rejects.toThrow(AppError);
      await expect(svc.reconcile("non-existent-stream")).rejects.toMatchObject({
        code: "NOT_FOUND",
        statusCode: 404,
      });
    });

    it("throws AppError with the stream ID in details", async () => {
      const prisma = makePrisma({ stream: null });
      const svc = new StreamReconciliationService(prisma as never);

      try {
        await svc.reconcile("missing-stream-id");
        fail("Expected AppError to be thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.details).toEqual({ streamId: "missing-stream-id" });
      }
    });
  });

  // ── DB error propagation ─────────────────────────────────────────────────

  describe("error propagation", () => {
    it("propagates stream lookup errors", async () => {
      const prisma = makePrisma({ streamError: new Error("DB connection lost") });
      const svc = new StreamReconciliationService(prisma as never);

      await expect(svc.reconcile(STREAM_ID)).rejects.toThrow("DB connection lost");
    });

    it("propagates clawback event query errors", async () => {
      const prisma = makePrisma({ clawbackError: new Error("Query timeout") });
      const svc = new StreamReconciliationService(prisma as never);

      await expect(svc.reconcile(STREAM_ID)).rejects.toThrow("Query timeout");
    });

    it("propagates admin audit query errors", async () => {
      const prisma = makePrisma({ adminError: new Error("Connection reset") });
      const svc = new StreamReconciliationService(prisma as never);

      await expect(svc.reconcile(STREAM_ID)).rejects.toThrow("Connection reset");
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("treats an empty clawback event list as zero total clawed back", async () => {
      const prisma = makePrisma({
        stream: makeStream({ pendingClawback: "0" }),
      });
      const svc = new StreamReconciliationService(prisma as never);

      const result = await svc.reconcile(STREAM_ID);

      expect(result.onChainSummary.totalClawedBackOnChain).toBe("0");
      expect(result.onChainSummary.clawbackEventCount).toBe(0);
      expect(result.consistent).toBe(true);
    });

    it("ignores admin actions with other action types", async () => {
      const prisma = makePrisma({
        stream: makeStream({ status: "SUSPENDED" }),
        adminActions: [
          {
            action: "STREAM_SUSPEND", // not STREAM_TERMINATE
            actorAddress: "GADMIN",
            targetReference: STREAM_ID,
            note: "Suspended for review",
            createdAt: new Date(),
          },
        ],
      });
      const svc = new StreamReconciliationService(prisma as never);

      const result = await svc.reconcile(STREAM_ID);

      // No status mismatch because STREAM_SUSPEND ≠ STREAM_TERMINATE
      expect(result.consistent).toBe(true);
    });

    it("ignores admin actions targeting other streams", async () => {
      const prisma = makePrisma({
        stream: makeStream({ status: "ACTIVE" }),
        adminActions: [
          {
            action: "STREAM_TERMINATE",
            actorAddress: "GADMIN",
            targetReference: "other-stream-id", // different stream
            note: null,
            createdAt: new Date(),
          },
        ],
      });
      const svc = new StreamReconciliationService(prisma as never);

      const result = await svc.reconcile(STREAM_ID);

      // The terminate is for another stream, so no mismatch here
      expect(result.consistent).toBe(true);
    });
  });
});
