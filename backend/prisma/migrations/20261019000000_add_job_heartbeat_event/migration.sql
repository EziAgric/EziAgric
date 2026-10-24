-- AddJobHeartbeatEvent migration
-- Adds a rolling heartbeat history used to compute job uptime on the dashboard

-- CreateTable JobHeartbeatEvent
CREATE TABLE "JobHeartbeatEvent" (
    "id" SERIAL NOT NULL,
    "jobType" VARCHAR(100) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobHeartbeatEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobHeartbeatEvent_jobType_recordedAt_idx" ON "JobHeartbeatEvent"("jobType", "recordedAt");

-- CreateIndex
CREATE INDEX "JobHeartbeatEvent_recordedAt_idx" ON "JobHeartbeatEvent"("recordedAt");
