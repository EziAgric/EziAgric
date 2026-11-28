-- AddTradeAuditLog migration
-- Append-only evidence trail of trade state transitions for dispute resolution.

-- CreateTable
CREATE TABLE "trade_audit_log" (
    "id" SERIAL NOT NULL,
    "trade_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "actor_id" VARCHAR(255),
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "trade_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trade_audit_log_trade_id_timestamp_idx" ON "trade_audit_log"("trade_id", "timestamp");

-- Immutability: UPDATE, DELETE and TRUNCATE are rejected for every role, including the table owner
-- (RLS alone does not stop the owner, so a trigger is used).
CREATE OR REPLACE FUNCTION trade_audit_log_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'trade_audit_log is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trade_audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON "trade_audit_log"
  FOR EACH ROW EXECUTE FUNCTION trade_audit_log_reject_mutation();

CREATE TRIGGER trade_audit_log_no_truncate
  BEFORE TRUNCATE ON "trade_audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION trade_audit_log_reject_mutation();

-- Row-level security: no UPDATE/DELETE policy exists, so those are denied for non-owner roles.
-- INSERT is granted to service_role when that role exists (Supabase).
ALTER TABLE "trade_audit_log" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE POLICY trade_audit_log_insert_service_role ON "trade_audit_log"
      FOR INSERT TO service_role WITH CHECK (true);
  END IF;
END;
$$;
