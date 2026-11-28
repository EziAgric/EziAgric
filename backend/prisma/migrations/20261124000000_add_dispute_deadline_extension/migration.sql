-- Allow the assigned mediator to extend the evidence submission deadline.
ALTER TABLE "User" ADD COLUMN "phoneNumber" VARCHAR(32);
ALTER TABLE "Dispute"
  ADD COLUMN "mediatorAddress" VARCHAR(255),
  ADD COLUMN "evidenceDeadline" TIMESTAMP(3),
  ADD COLUMN "deadlineExtensions" INTEGER NOT NULL DEFAULT 0;
