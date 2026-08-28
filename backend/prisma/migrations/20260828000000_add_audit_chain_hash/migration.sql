-- Hash-chain columns for tamper-evident AdminActionAudit (issue #214).
ALTER TABLE "AdminActionAudit" ADD COLUMN "prevHash" VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE "AdminActionAudit" ADD COLUMN "hash" VARCHAR(64) NOT NULL DEFAULT '';
