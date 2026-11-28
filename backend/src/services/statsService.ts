import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const prisma = new PrismaClient();

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const CACHE_KEY = 'stats:trade_overview';
const CACHE_TTL_SECONDS = 300; // 5 minutes

export interface TradeStats {
  total_trades: number;
  trades_by_state: Record<string, number>;
  total_volume_cngn: number;
  avg_settlement_hours: number;
  dispute_rate_pct: number;
}

/**
 * Compute aggregate trade statistics for the admin dashboard.
 * Runs the aggregation queries directly against the database.
 */
async function computeTradeStats(): Promise<TradeStats> {
  const [totalTrades, stateGroups, volumeAgg, settledTrades, disputedCount] =
    await Promise.all([
      prisma.trade.count(),
      prisma.trade.groupBy({
        by: ['state'],
        _count: { _all: true },
      }),
      prisma.trade.aggregate({
        _sum: { amountCngn: true },
      }),
      prisma.trade.findMany({
        where: {
          state: 'SETTLED',
          settledAt: { not: null },
          createdAt: { not: null },
        },
        select: { createdAt: true, settledAt: true },
      }),
      prisma.trade.count({
        where: { state: 'DISPUTED' },
      }),
    ]);

  const tradesByState: Record<string, number> = {};
  for (const group of stateGroups) {
    tradesByState[String(group.state)] = group._count._all;
  }

  const totalVolume = Number(volumeAgg._sum.amountCngn ?? 0);

  let avgSettlementHours = 0;
  if (settledTrades.length > 0) {
    const totalHours = settledTrades.reduce((sum, trade) => {
      const created = new Date(trade.createdAt).getTime();
      const settled = new Date(trade.settledAt as Date).getTime();
      return sum + (settled - created) / (1000 * 60 * 60);
    }, 0);
    avgSettlementHours = totalHours / settledTrades.length;
  }

  const disputeRatePct =
    totalTrades > 0 ? (disputedCount / totalTrades) * 100 : 0;

  return {
    total_trades: totalTrades,
    trades_by_state: tradesByState,
    total_volume_cngn: totalVolume,
    avg_settlement_hours: Number(avgSettlementHours.toFixed(2)),
    dispute_rate_pct: Number(disputeRatePct.toFixed(2)),
  };
}

/**
 * Return trade statistics, served from Redis cache when available.
 * Results are cached for 5 minutes.
 */
export async function getTradeStats(): Promise<TradeStats> {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as TradeStats;
    }
  } catch {
    // Cache read failure should not break the endpoint; fall through to compute.
  }

  const stats = await computeTradeStats();

  try {
    await redis.set(CACHE_KEY, JSON.stringify(stats), 'EX', CACHE_TTL_SECONDS);
  } catch {
    // Cache write failure is non-fatal.
  }

  return stats;
}
