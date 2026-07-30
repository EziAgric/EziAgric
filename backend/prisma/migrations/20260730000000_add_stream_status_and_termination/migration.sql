-- Stream lifecycle state, so admin termination can validate the stream's state
-- before acting and reject a replay against an already-terminal stream.
CREATE TYPE "StreamStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TERMINATED', 'COMPLETED');

ALTER TABLE "Stream" ADD COLUMN "status" "StreamStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Stream" ADD COLUMN "terminatedAt" TIMESTAMP(3);
ALTER TABLE "Stream" ADD COLUMN "terminatedBy" VARCHAR(255);
ALTER TABLE "Stream" ADD COLUMN "terminationReason" TEXT;

CREATE INDEX "Stream_status_idx" ON "Stream"("status");
