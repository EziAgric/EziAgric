-- Composite indexes matching visible pagination/list query shapes:
-- Trade.listUserTrades OR-filters by buyer/seller + optional status, sorted by
-- createdAt (trade.service.ts); TradeEvidence is fetched per-trade ordered by
-- createdAt (auditTrail.service.ts); AdminActionAudit is listed unfiltered,
-- sorted by createdAt (adminAudit.service.ts). Additive only — no data changes,
-- safe to roll back by dropping the indexes below (see
-- docs/migration-rollback-playbook.md).
CREATE INDEX "Trade_buyerAddress_status_createdAt_idx" ON "Trade"("buyerAddress", "status", "createdAt");
CREATE INDEX "Trade_sellerAddress_status_createdAt_idx" ON "Trade"("sellerAddress", "status", "createdAt");

CREATE INDEX "TradeEvidence_tradeId_createdAt_idx" ON "TradeEvidence"("tradeId", "createdAt");

CREATE INDEX "AdminActionAudit_createdAt_idx" ON "AdminActionAudit"("createdAt");
