/**
 * Admin event schema coverage (#52).
 *
 * Verifies the payloads admin-related handlers actually persist —
 * `StreamClawback` events (StreamClawbackEvent) and admin audit records
 * (AdminActionAudit) — match the documented schemas in
 * adminEvents.schema.ts, and that the schemas reject a payload once a
 * required admin field is missing.
 */
import { Prisma, StreamStatus } from "@prisma/client";
import { handleStreamClawback } from "../services/eventHandlers";
import { EventType, ParsedEvent } from "../types/events";
import {
  streamClawbackEventSchema,
  adminActionAuditSchema,
} from "../types/adminEvents.schema";
import {
  StreamTerminationService,
  ADMIN_ACTION_STREAM_TERMINATE,
} from "../services/streamTermination.service";

function makeStreamClawbackEvent(
  data: Partial<Record<"stream_id" | "admin" | "amount", string>> = {},
): ParsedEvent {
  return {
    eventType: EventType.StreamClawback,
    tradeId: "unused-tradeId-fallback",
    ledgerSequence: 42,
    contractId: "CONTRACT_STREAMS_TEST",
    eventId: "evt-clawback-001",
    data: {
      stream_id: "stream-abc-123",
      admin: "GADMIN000000000000000000000000000000000000000000000000",
      amount: "5000",
      ...data,
    },
  };
}

interface UpsertArgs {
  create: { streamId: string; admin: string; amount: string; txHash: string; timestamp: string };
}

function createMockTx() {
  const upsert = jest.fn(async (args: UpsertArgs) => args);
  return {
    tx: { streamClawbackEvent: { upsert } } as unknown as Prisma.TransactionClient,
    upsert,
  };
}

describe("Admin event schemas (#52)", () => {
  describe("stream_clawback event schema", () => {
    it("accepts the StreamClawbackEvent payload persisted by handleStreamClawback", async () => {
      const { tx, upsert } = createMockTx();
      await handleStreamClawback(tx, makeStreamClawbackEvent());

      const persisted = upsert.mock.calls[0][0].create;
      const result = streamClawbackEventSchema.safeParse({
        ...persisted,
        timestamp: new Date(persisted.timestamp),
      });

      expect(result.success).toBe(true);
    });

    it("fails validation when the on-chain event omits the admin address", async () => {
      const { tx, upsert } = createMockTx();
      // The handler falls back to an empty string for a missing `admin` field
      // rather than throwing, so the schema is what actually catches the gap.
      await handleStreamClawback(tx, makeStreamClawbackEvent({ admin: undefined as unknown as string }));

      const persisted = upsert.mock.calls[0][0].create;
      const result = streamClawbackEventSchema.safeParse({
        ...persisted,
        timestamp: new Date(persisted.timestamp),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path.includes("admin"))).toBe(true);
      }
    });

    it("does not persist an event at all when the stream id is missing", async () => {
      const { tx, upsert } = createMockTx();
      await handleStreamClawback(tx, makeStreamClawbackEvent({ stream_id: "" }));

      expect(upsert).not.toHaveBeenCalled();
    });
  });

  describe("admin audit event schema (AdminActionAudit)", () => {
    function createMockAuditPrisma() {
      const create = jest.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 1,
        createdAt: new Date(),
        ...args.data,
      }));
      const prisma = {
        stream: {
          findUnique: jest.fn(async () => ({
            streamId: "stream-abc-123",
            status: StreamStatus.ACTIVE,
            unclaimed: "1000",
          })),
          update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
            streamId: "stream-abc-123",
            status: StreamStatus.TERMINATED,
            unclaimed: "1000",
            ...data,
          })),
        },
        adminActionAudit: { create },
      };
      return { prisma, create };
    }

    it("accepts the AdminActionAudit payload written when a stream is terminated", async () => {
      const { prisma, create } = createMockAuditPrisma();
      const service = new StreamTerminationService(
        prisma as never,
        undefined,
        { notifyStreamTerminated: jest.fn(), notifyOperationFailed: jest.fn() } as never,
        async () => {},
      );

      await service.terminate({
        streamId: "stream-abc-123",
        adminAddress: "GADMIN000000000000000000000000000000000000000000000000",
        reason: "Recipient account compromised",
      });

      const persisted = create.mock.calls[0][0].data;
      const result = adminActionAuditSchema.safeParse(persisted);

      expect(result.success).toBe(true);
      expect(persisted.action).toBe(ADMIN_ACTION_STREAM_TERMINATE);
    });

    it("fails validation when actorAddress is missing", () => {
      const result = adminActionAuditSchema.safeParse({
        action: ADMIN_ACTION_STREAM_TERMINATE,
        actorAddress: "",
        targetReference: "stream-abc-123",
        note: null,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path.includes("actorAddress"))).toBe(true);
      }
    });

    it("fails validation when action is missing", () => {
      const result = adminActionAuditSchema.safeParse({
        actorAddress: "GADMIN000000000000000000000000000000000000000000000000",
        targetReference: "stream-abc-123",
        note: null,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path.includes("action"))).toBe(true);
      }
    });
  });
});
