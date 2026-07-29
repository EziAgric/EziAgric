-- Compliance audit trail for admin-initiated actions (e.g. treasury withdrawals/clawbacks),
-- capturing an optional operator-supplied reason/note.
CREATE TABLE "AdminActionAudit" (
    "id" SERIAL NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "actorAddress" VARCHAR(255) NOT NULL,
    "targetReference" VARCHAR(255),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminActionAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminActionAudit_action_createdAt_idx" ON "AdminActionAudit"("action", "createdAt");
CREATE INDEX "AdminActionAudit_actorAddress_idx" ON "AdminActionAudit"("actorAddress");
