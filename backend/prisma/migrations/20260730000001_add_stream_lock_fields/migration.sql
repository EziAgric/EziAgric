-- Maintenance-lock fields for Stream, orthogonal to lifecycle status.
-- When lockedAt IS NOT NULL the stream is locked; all admin mutations
-- (suspend, resume, terminate, clawback) are rejected with 409 Conflict.

ALTER TABLE "Stream" ADD COLUMN "lockedAt" TIMESTAMP(3);
ALTER TABLE "Stream" ADD COLUMN "lockedBy" VARCHAR(255);
ALTER TABLE "Stream" ADD COLUMN "lockReason" TEXT;
