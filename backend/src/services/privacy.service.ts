import { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../lib/db";
import { AppError, ErrorCode } from "../errors/errorCodes";

function normalize(address: string): string {
  return address.trim().toLowerCase();
}

export async function exportUserData(address: string, prisma: PrismaClient = defaultPrisma) {
  const walletAddress = normalize(address);
  const user = await prisma.user.findUnique({
    where: { walletAddress },
    include: {
      tradesBought: true,
      tradesSold: true,
      initiatedDisputes: true,
      vaults: true,
      goals: true,
      tradeTemplates: true,
      watchlist: true,
      refreshTokens: true,
      wallets: true,
      webhooks: { include: { deliveryAttempts: true } },
      webhookSubscriptions: true,
      notifications: true,
      notificationPreference: true,
    },
  });

  if (!user) {
    throw new AppError(ErrorCode.NOT_FOUND, "User not found", 404);
  }
  return { exportedAt: new Date().toISOString(), user };
}

export async function eraseUserData(address: string, prisma: PrismaClient = defaultPrisma) {
  const walletAddress = normalize(address);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { walletAddress }, select: { id: true } });
    if (!user) throw new AppError(ErrorCode.NOT_FOUND, "User not found", 404);

    await tx.tradeEvidence.deleteMany({ where: { uploadedBy: walletAddress } });
    await tx.trade.deleteMany({ where: { OR: [{ buyerAddress: walletAddress }, { sellerAddress: walletAddress }] } });
    await tx.user.delete({ where: { walletAddress } });
    return { erased: true, walletAddress };
  });
}