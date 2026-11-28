/**
 * Payout idempotency and crash-window tests — Issue #179.
 *
 * The defect being guarded against: a release or refund succeeds on-chain and
 * then the process dies before the DB commit. A retry that looks like a fresh
 * request pays out a second time. These tests inject a crash at each point in
 * that window and assert no second submission is ever produced.
 */

import { Prisma, PayoutIntent } from "@prisma/client";

jest.mock("../lib/metrics", () => ({
  recordPayoutIntentOutcome: jest.fn(),
}));

import { recordPayoutIntentOutcome } from "../lib/metrics";
import {
  DuplicatePayoutError,
  PayoutIntentService,
  derivePayoutIdempotencyKey,
} from "../services/payoutIntent.service";

/**
 * In-memory stand-in for the `PayoutIntent` table that enforces the unique
 * constraint the same way Postgres does — the guarantee under test is the
 * constraint itself, not the application logic around it.
 */
function makeFakePrisma() {
  const rows = new Map<string, PayoutIntent>();
  let nextId = 1;

  const uniqueViolation = () =>
    new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "5.22.0",
    });

  return {
    rows,
    payoutIntent: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const key = data.idempotencyKey as string;
        if (rows.has(key)) {
          throw uniqueViolation();
        }
        const row = {
          id: nextId++,
          duplicateAttempts: 0,
          txHash: null,
          lastError: null,
          submittedAt: null,
          confirmedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        } as unknown as PayoutIntent;
        rows.set(key, row);
        return row;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { idempotencyKey: string };
          data: Record<string, unknown>;
        }) => {
          const row = rows.get(where.idempotencyKey);
          if (!row) throw new Error("Record not found");
          const next = { ...row } as Record<string, unknown>;
          for (const [field, value] of Object.entries(data)) {
            if (
              value &&
              typeof value === "object" &&
              "increment" in (value as Record<string, unknown>)
            ) {
              next[field] =
                (next[field] as number) +
                ((value as { increment: number }).increment as number);
            } else {
              next[field] = value;
            }
          }
          next.updatedAt = new Date();
          rows.set(where.idempotencyKey, next as unknown as PayoutIntent);
          return next as unknown as PayoutIntent;
        },
      ),
      findUnique: jest.fn(async ({ where }: { where: { idempotencyKey: string } }) =>
        rows.get(where.idempotencyKey) ?? null,
      ),
      // Mirrors the real query: only intents that have not reached a terminal
      // state are candidates for reconciliation.
      findMany: jest.fn(async ({ where }: { where?: { status?: { in: string[] } } } = {}) => {
        const statuses = where?.status?.in;
        return [...rows.values()].filter(
          (row) => !statuses || statuses.includes(row.status),
        );
      }),
    },
  };
}

const BASE_INPUT = {
  kind: "RELEASE" as const,
  tradeId: "trade-1",
  amountUsdc: "100.0000000",
  destination: "GSELLER",
  requestedBy: "GBUYER",
};

describe("derivePayoutIdempotencyKey", () => {
  it("is stable for the same payout", () => {
    expect(derivePayoutIdempotencyKey(BASE_INPUT)).toBe(
      derivePayoutIdempotencyKey({ ...BASE_INPUT }),
    );
  });

  it("changes when the amount changes", () => {
    // A different amount is a different payout and must not be swallowed.
    expect(derivePayoutIdempotencyKey(BASE_INPUT)).not.toBe(
      derivePayoutIdempotencyKey({ ...BASE_INPUT, amountUsdc: "100.0000001" }),
    );
  });

  it("distinguishes milestones of the same trade", () => {
    expect(
      derivePayoutIdempotencyKey({ ...BASE_INPUT, milestoneIndex: 0 }),
    ).not.toBe(derivePayoutIdempotencyKey({ ...BASE_INPUT, milestoneIndex: 1 }));
  });
});

describe("PayoutIntentService.claim", () => {
  let prisma: ReturnType<typeof makeFakePrisma>;
  let service: PayoutIntentService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makeFakePrisma();
    service = new PayoutIntentService(prisma as never);
  });

  it("claims a fresh payout", async () => {
    const { intent, duplicate } = await service.claim(BASE_INPUT);

    expect(duplicate).toBe(false);
    expect(intent.status).toBe("PENDING");
    expect(recordPayoutIntentOutcome).toHaveBeenCalledWith("RELEASE", "claimed");
  });

  it("recognises a retry that omits the idempotency header", async () => {
    await service.claim(BASE_INPUT);
    const second = await service.claim(BASE_INPUT);

    expect(second.duplicate).toBe(true);
    expect(second.intent.duplicateAttempts).toBe(1);
    expect(recordPayoutIntentOutcome).toHaveBeenCalledWith("RELEASE", "duplicate");
  });

  it("refuses a retry once the payout is confirmed", async () => {
    const { intent } = await service.claim(BASE_INPUT);
    await service.recordSubmission(intent.idempotencyKey, "abc123");
    await service.confirm(intent.idempotencyKey);

    await expect(service.claim(BASE_INPUT)).rejects.toBeInstanceOf(DuplicatePayoutError);
  });

  it("counts every duplicate attempt for the metric", async () => {
    await service.claim(BASE_INPUT);
    await service.claim(BASE_INPUT);
    await service.claim(BASE_INPUT);

    const stored = await service.findByKey(derivePayoutIdempotencyKey(BASE_INPUT));
    expect(stored?.duplicateAttempts).toBe(2);
  });

  it("lets only one of two concurrent claims through", async () => {
    const [a, b] = await Promise.all([
      service.claim(BASE_INPUT),
      service.claim(BASE_INPUT).catch((err) => err),
    ]);

    const results = [a, b].filter(
      (r): r is { intent: PayoutIntent; duplicate: boolean } => !(r instanceof Error),
    );
    const fresh = results.filter((r) => r.duplicate === false);
    expect(fresh).toHaveLength(1);
  });

  it("treats a different amount as a separate payout", async () => {
    await service.claim(BASE_INPUT);
    const other = await service.claim({ ...BASE_INPUT, amountUsdc: "50.0000000" });

    expect(other.duplicate).toBe(false);
  });

  it("honours an explicit idempotency key over the derived one", async () => {
    const first = await service.claim({ ...BASE_INPUT, idempotencyKey: "client-key-1" });
    expect(first.intent.idempotencyKey).toBe("client-key-1");

    const retry = await service.claim({ ...BASE_INPUT, idempotencyKey: "client-key-1" });
    expect(retry.duplicate).toBe(true);
  });
});

describe("crash windows", () => {
  let prisma: ReturnType<typeof makeFakePrisma>;
  let service: PayoutIntentService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makeFakePrisma();
    service = new PayoutIntentService(prisma as never);
  });

  /** Simulates a submission whose DB follow-up dies partway through. */
  async function crashingRelease(crashAfter: "claim" | "submit") {
    const { intent, duplicate } = await service.claim(BASE_INPUT);
    if (duplicate) throw new Error("should not have been a duplicate");
    if (crashAfter === "claim") {
      throw new Error("process died after claiming, before submitting");
    }
    await service.recordSubmission(intent.idempotencyKey, "tx-hash-1");
    throw new Error("process died after submitting, before committing");
  }

  it("a crash between claim and submit still blocks a naive retry", async () => {
    await expect(crashingRelease("claim")).rejects.toThrow(/before submitting/);

    // The retry must not get a fresh claim — the first attempt's outcome is
    // unknown until reconciliation rules on it.
    const retry = await service.claim(BASE_INPUT);
    expect(retry.duplicate).toBe(true);
    expect(retry.intent.status).toBe("PENDING");
  });

  it("a crash between submit and commit still blocks a naive retry", async () => {
    await expect(crashingRelease("submit")).rejects.toThrow(/before committing/);

    const retry = await service.claim(BASE_INPUT);
    expect(retry.duplicate).toBe(true);
    expect(retry.intent.status).toBe("SUBMITTED");
    // The hash survived the crash, so reconciliation can settle the question.
    expect(retry.intent.txHash).toBe("tx-hash-1");
  });

  it("never produces a second submission across repeated crash-and-retry", async () => {
    const submissions: string[] = [];

    for (let attempt = 0; attempt < 5; attempt++) {
      const { intent, duplicate } = await service.claim(BASE_INPUT);
      if (duplicate) continue;
      submissions.push(intent.idempotencyKey);
      await service.recordSubmission(intent.idempotencyKey, "tx-hash-1");
      // Crash before commit, every time.
    }

    expect(submissions).toHaveLength(1);
  });
});

describe("PayoutIntentService.reconcile", () => {
  let prisma: ReturnType<typeof makeFakePrisma>;
  let service: PayoutIntentService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makeFakePrisma();
    service = new PayoutIntentService(prisma as never);
  });

  it("confirms an intent whose transaction applied on-chain", async () => {
    const { intent } = await service.claim(BASE_INPUT);
    await service.recordSubmission(intent.idempotencyKey, "tx-ok");

    const result = await service.reconcile(async () => "SUCCESS", { olderThanMs: 0 });

    expect(result.confirmed).toBe(1);
    const settled = await service.findByKey(intent.idempotencyKey);
    expect(settled?.status).toBe("CONFIRMED");
    // And the key is now permanently closed to retries.
    await expect(service.claim(BASE_INPUT)).rejects.toBeInstanceOf(DuplicatePayoutError);
  });

  it("releases the key when the chain says the transaction failed", async () => {
    const { intent } = await service.claim(BASE_INPUT);
    await service.recordSubmission(intent.idempotencyKey, "tx-bad");

    const result = await service.reconcile(async () => "FAILED", { olderThanMs: 0 });

    expect(result.failed).toBe(1);
    const settled = await service.findByKey(intent.idempotencyKey);
    expect(settled?.status).toBe("FAILED");
  });

  it("leaves an intent unresolved while the chain outcome is unknown", async () => {
    const { intent } = await service.claim(BASE_INPUT);
    await service.recordSubmission(intent.idempotencyKey, "tx-unknown");

    const result = await service.reconcile(async () => "NOT_FOUND", { olderThanMs: 0 });

    // Guessing either way here is how a double payout or a stuck payout happens.
    expect(result.pending).toBe(1);
    const settled = await service.findByKey(intent.idempotencyKey);
    expect(settled?.status).toBe("SUBMITTED");
  });

  it("fails an intent that never reached submission without consulting the chain", async () => {
    await service.claim(BASE_INPUT);
    const lookup = jest.fn();

    const result = await service.reconcile(lookup as never, { olderThanMs: 0 });

    expect(result.failed).toBe(1);
    expect(lookup).not.toHaveBeenCalled();
  });
});
