import { PrismaClient } from "@prisma/client";
import { StellarService } from "./stellar.service";
import { TOKEN_CONFIG } from "../config/token";
import { env } from "../config/env";
import { appLogger } from "../middleware/logger";
import { isMediatorAddress } from "../lib/accessControl";
import { prisma as defaultPrisma } from "../lib/db";

export class TreasuryService {
  private stellarService: StellarService;
  private prisma: Pick<PrismaClient, "adminActionAudit">;

  constructor(prisma: Pick<PrismaClient, "adminActionAudit"> = defaultPrisma) {
    this.stellarService = new StellarService();
    this.prisma = prisma;
  }

  async getBalance(): Promise<{
    balance: string;
    asset: string;
    contractId: string;
  }> {
    const contractId = env.AMANA_ESCROW_CONTRACT_ID;
    const balance = await this.stellarService.getAccountBalance(
      contractId,
      TOKEN_CONFIG.symbol,
    );

    return {
      balance,
      asset: TOKEN_CONFIG.symbol,
      contractId,
    };
  }

  async withdraw(
    destination: string,
    amount: string,
    callerAddress: string,
    note?: string,
  ): Promise<{ unsignedXdr: string }> {
    if (!this.isAdmin(callerAddress)) {
      throw new Error("Only admin can withdraw treasury funds");
    }

    appLogger.info(
      { destination, amount, caller: callerAddress, note },
      "Treasury withdrawal requested",
    );

    await this.prisma.adminActionAudit.create({
      data: {
        action: "TREASURY_WITHDRAW",
        actorAddress: callerAddress,
        targetReference: destination,
        note: note ?? null,
      },
    });

    return { unsignedXdr: "" };
  }

  getConfig(): {
    contractId: string;
    network: string;
    asset: string;
  } {
    return {
      contractId: env.AMANA_ESCROW_CONTRACT_ID,
      network: process.env.STELLAR_NETWORK ?? env.STELLAR_NETWORK,
      asset: TOKEN_CONFIG.symbol,
    };
  }

  private isAdmin(address: string): boolean {
    return isMediatorAddress(address);
  }
}

export const treasuryService = new TreasuryService();
