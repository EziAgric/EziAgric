import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../lib/db';
import { appLogger } from '../middleware/logger';

export interface DepositEvent {
  ledgerSeq: number;
  txHash: string;
  depositorAddress: string;
  amountRaw: string;
  assetId: string;
  contractTradeId?: string;
}

export interface OrphanScanResult {
  scanned: number;
  orphansDetected: number;
  alreadyKnown: number;
}

export class OrphanDepositService {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  /**
   * Accepts a batch of deposit events from the chain-event scanner and checks
   * each against the DB Trade table. Events with no matching Trade are recorded
   * as OrphanDeposit rows and trigger admin alerts.
   */
  async ingestDepositEvents(events: DepositEvent[]): Promise<OrphanScanResult> {
    const result: OrphanScanResult = { scanned: events.length, orphansDetected: 0, alreadyKnown: 0 };

    for (const event of events) {
      // Skip if already recorded
      const existing = await this.db.orphanDeposit.findUnique({ where: { txHash: event.txHash } });
      if (existing) {
        result.alreadyKnown++;
        continue;
      }

      // Check if a matching Trade row exists by contractTradeId
      const matched = event.contractTradeId
        ? await this.db.trade.findUnique({ where: { tradeId: event.contractTradeId } })
        : null;

      if (!matched) {
        await this.db.orphanDeposit.create({
          data: {
            ledgerSeq: event.ledgerSeq,
            txHash: event.txHash,
            depositorAddress: event.depositorAddress.toLowerCase(),
            amountRaw: event.amountRaw,
            assetId: event.assetId,
            contractTradeId: event.contractTradeId ?? null,
          },
        });
        result.orphansDetected++;
        appLogger.warn(
          { txHash: event.txHash, depositorAddress: event.depositorAddress, amountRaw: event.amountRaw },
          'Orphaned on-chain deposit detected',
        );
      }
    }

    return result;
  }

  /** Returns unresolved orphan deposits, newest first. */
  async listOrphans(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.db.orphanDeposit.findMany({
        where: { resolved: false },
        skip,
        take: limit,
        orderBy: { detectedAt: 'desc' },
      }),
      this.db.orphanDeposit.count({ where: { resolved: false } }),
    ]);
    return { items, total, page, limit };
  }

  /**
   * Links an orphan deposit to an existing Trade row. Writes an audit entry
   * and marks the orphan resolved.
   */
  async attachOrphanToTrade(
    orphanId: number,
    tradeId: string,
    adminAddress: string,
  ): Promise<void> {
    const trade = await this.db.trade.findUnique({ where: { tradeId } });
    if (!trade) throw new Error(`Trade ${tradeId} not found`);

    await this.db.$transaction([
      this.db.orphanDeposit.update({
        where: { id: orphanId },
        data: { resolved: true, resolvedTradeId: tradeId, resolvedAt: new Date() },
      }),
      this.db.adminActionAudit.create({
        data: {
          action: 'orphan_deposit_attached',
          actorAddress: adminAddress,
          targetReference: tradeId,
          note: `Orphan deposit #${orphanId} attached to trade ${tradeId}`,
        },
      }),
    ]);

    appLogger.info({ orphanId, tradeId, adminAddress }, 'Orphan deposit attached to trade');
  }
}

export const orphanDepositService = new OrphanDepositService();
