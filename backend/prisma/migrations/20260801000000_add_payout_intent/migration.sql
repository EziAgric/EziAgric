-- Payout idempotency (issue #179).
--
-- A release or refund can succeed on-chain and then fail before the DB commit;
-- a client or job retry then submits the same payout again. The unique index on
-- "idempotencyKey" makes that collision a database error rather than something
-- application logic has to notice, so a crash anywhere in the window cannot
-- produce a second payout.

CREATE TYPE "PayoutIntentStatus" AS ENUM ('PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED');

CREATE TYPE "PayoutKind" AS ENUM ('RELEASE', 'MILESTONE_RELEASE', 'REFUND', 'CLAWBACK');

CREATE TABLE "PayoutIntent" (
    "id" SERIAL NOT NULL,
    "idempotencyKey" VARCHAR(255) NOT NULL,
    "kind" "PayoutKind" NOT NULL,
    "tradeId" VARCHAR(255) NOT NULL,
    "milestoneIndex" INTEGER,
    "amountUsdc" VARCHAR(100) NOT NULL,
    "destination" VARCHAR(255) NOT NULL,
    "requestedBy" VARCHAR(255) NOT NULL,
    "status" "PayoutIntentStatus" NOT NULL DEFAULT 'PENDING',
    "txHash" VARCHAR(255),
    "duplicateAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "submittedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutIntent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayoutIntent_idempotencyKey_key" ON "PayoutIntent"("idempotencyKey");

CREATE INDEX "PayoutIntent_tradeId_kind_idx" ON "PayoutIntent"("tradeId", "kind");

-- Drives the reconciliation sweep: find intents stuck in PENDING/SUBMITTED,
-- oldest first.
CREATE INDEX "PayoutIntent_status_updatedAt_idx" ON "PayoutIntent"("status", "updatedAt");

CREATE INDEX "PayoutIntent_txHash_idx" ON "PayoutIntent"("txHash");
