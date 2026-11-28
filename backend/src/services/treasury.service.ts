import { PrismaClient } from "@prisma/client";
import { StellarService } from "./stellar.service";
import { TOKEN_CONFIG } from "../config/token";
import { env } from "../config/env";
import { appLogger } from "../middleware/logger";
import { isMediatorAddress } from "../lib/accessControl";
import { prisma as defaultPrisma } from "../lib/db";

export interface FeeLedgerEntry {
  eventId: string;
  tradeId: string;
  asset: string;
  amount: string;
  source: "FUNDS_RELEASED" | "DISPUTE_RESOLVED";
  occurredAt: string;
}

export interface FeeLedgerReport {
  period: { from: string; to: string };
  asset: string;
  totalFees: string;
  entryCount: number;
  entries: FeeLedgerEntry[];
}

export interface FeeReconciliation {
  asset: string;
  ledgerTotal: string;
  accruedFees: string;
  difference: string;
  reconciled: boolean;
}

export class TreasuryService {
  private stellarService: StellarService;
  private prisma: Pick<PrismaClient, "adminActionAudit">;
  private feeLedger: Map<string, FeeLedgerEntry> = new Map();

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

  /**
   * Record a platform fee ledger entry. Idempotent on event replay: entries are
   * keyed by their on-chain event identity, so re-processing the same event is a
   * no-op rather than a duplicate write.
   */
  recordFee(entry: FeeLedgerEntry): FeeLedgerEntry {
    const existing = this.feeLedger.get(entry.eventId);
    if (existing) {
      return existing;
    }

    this.feeLedger.set(entry.eventId, entry);
    appLogger.info(
      { eventId: entry.eventId, tradeId: entry.tradeId, amount: entry.amount },
      "Platform fee ledger entry recorded",
    );
    return entry;
  }

  /**
   * Admin report aggregating ledger entries by period and asset.
   */
  getFeeReport(params: {
    from: string;
    to: string;
    asset?: string;
  }): FeeLedgerReport {
    const asset = params.asset ?? TOKEN_CONFIG.symbol;
    const from = new Date(params.from).getTime();
    const to = new Date(params.to).getTime();

    const entries = Array.from(this.feeLedger.values()).filter((entry) => {
      if (entry.asset !== asset) return false;
      const at = new Date(entry.occurredAt).getTime();
      return at >= from && at <= to;
    });

    const totalFees = entries
      .reduce((sum, entry) => sum + Number(entry.amount), 0)
      .toString();

    return {
      period: { from: params.from, to: params.to },
      asset,
      totalFees,
      entryCount: entries.length,
      entries,
    };
  }

  /**
   * Reconcile the off-chain ledger total against on-chain accrued fees.
   */
  async reconcileAccruedFees(asset: string = TOKEN_CONFIG.symbol): Promise<FeeReconciliation> {
    const accruedFees = await this.stellarService.getAccruedFees(
      env.AMANA_ESCROW_CONTRACT_ID,
      asset,
    );

    const ledgerTotal = Array.from(this.feeLedger.values())
      .filter((entry) => entry.asset === asset)
      .reduce((sum, entry) => sum + Number(entry.amount), 0)
      .toString();

    const difference = (Number(ledgerTotal) - Number(accruedFees)).toString();

    return {
      asset,
      ledgerTotal,
      accruedFees,
      difference,
      reconciled: difference === "0",
    };
  }

  private isAdmin(address: string): boolean {
    return isMediatorAddress(address);
  }
}

export const treasuryService = new TreasuryService();
