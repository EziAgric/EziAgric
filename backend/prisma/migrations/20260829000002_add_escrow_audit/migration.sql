-- AddEscrowAudit migration
-- Adds EscrowAudit model for tracking escrow state transitions
-- Used by outbox completeness scanner to detect missed event emissions

-- CreateTable EscrowAudit
CREATE TABLE "EscrowAudit" (
    "id" SERIAL NOT NULL,
    "tradeId" VARCHAR(255) NOT NULL,
    "eventType" VARCHAR(100) NOT NULL,
    "fromStatus" VARCHAR(50),
    "toStatus" VARCHAR(50) NOT NULL,
    "actor" VARCHAR(255),
    "contractId" VARCHAR(255),
    "ledgerSequence" INTEGER,
    "extra" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EscrowAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EscrowAudit_tradeId_idx" ON "EscrowAudit"("tradeId");

-- CreateIndex
CREATE INDEX "EscrowAudit_tradeId_createdAt_idx" ON "EscrowAudit"("tradeId", "createdAt");

-- CreateIndex
CREATE INDEX "EscrowAudit_eventType_idx" ON "EscrowAudit"("eventType");
