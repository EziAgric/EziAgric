-- AlterTable: mark rotated refresh tokens as used instead of deleting, so reuse can be detected
ALTER TABLE "RefreshToken" ADD COLUMN "usedAt" TIMESTAMP(3);
