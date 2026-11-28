-- WebhookDelivery: per-attempt outbound delivery history for WebhookSubscription (#934)
CREATE TABLE "WebhookDelivery" (
    "id" SERIAL NOT NULL,
    "subscriptionId" INTEGER NOT NULL,
    "event" VARCHAR(50) NOT NULL,
    "tradeId" VARCHAR(255) NOT NULL,
    "attempt" INTEGER NOT NULL,
    "statusCode" INTEGER,
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookDelivery_subscriptionId_createdAt_idx" ON "WebhookDelivery"("subscriptionId", "createdAt");

ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "WebhookSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- TradeEvidence soft delete for seller retraction (#936)
ALTER TABLE "TradeEvidence" ADD COLUMN "deletedAt" TIMESTAMP(3);
