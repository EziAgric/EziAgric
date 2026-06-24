-- User-scoped reusable trade terms and dashboard watchlist bookmarks.
-- Composite indexes match the ownership filters and stable created-at ordering
-- used by the API routes.
CREATE TABLE "TradeTemplate" (
    "id" SERIAL NOT NULL,
    "userAddress" VARCHAR(255) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sellerAddress" VARCHAR(255) NOT NULL,
    "amountUsdc" VARCHAR(100) NOT NULL,
    "buyerLossBps" INTEGER NOT NULL DEFAULT 5000,
    "sellerLossBps" INTEGER NOT NULL DEFAULT 5000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserWatchlist" (
    "id" SERIAL NOT NULL,
    "userAddress" VARCHAR(255) NOT NULL,
    "tradeId" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserWatchlist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TradeTemplate_userAddress_name_key" ON "TradeTemplate"("userAddress", "name");
CREATE INDEX "TradeTemplate_userAddress_createdAt_idx" ON "TradeTemplate"("userAddress", "createdAt");
CREATE UNIQUE INDEX "UserWatchlist_userAddress_tradeId_key" ON "UserWatchlist"("userAddress", "tradeId");
CREATE INDEX "UserWatchlist_userAddress_createdAt_idx" ON "UserWatchlist"("userAddress", "createdAt");
CREATE INDEX "UserWatchlist_tradeId_idx" ON "UserWatchlist"("tradeId");

ALTER TABLE "TradeTemplate" ADD CONSTRAINT "TradeTemplate_userAddress_fkey"
  FOREIGN KEY ("userAddress") REFERENCES "User"("walletAddress") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserWatchlist" ADD CONSTRAINT "UserWatchlist_userAddress_fkey"
  FOREIGN KEY ("userAddress") REFERENCES "User"("walletAddress") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserWatchlist" ADD CONSTRAINT "UserWatchlist_tradeId_fkey"
  FOREIGN KEY ("tradeId") REFERENCES "Trade"("tradeId") ON DELETE CASCADE ON UPDATE CASCADE;
