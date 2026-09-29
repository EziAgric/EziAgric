import { PrismaClient, TradeStatus } from "@prisma/client";

/**
 * Trust score calculation spec.
 *
 * The trust score is a bounded value in [0, 100] derived from four weighted
 * factors. Each factor is documented below with its weight and rationale.
 *
 * Base score: 50
 *
 * 1. Completed trades (weight: +5 per completed trade)
 *    Every trade that reaches COMPLETED status (as buyer or seller) adds 5
 *    points. This is the primary positive signal of reliable participation.
 *
 * 2. Disputes lost (weight: -8 per lost dispute)
 *    A dispute that was RESOLVED or CLOSED against the user subtracts 8
 *    points. Losing a dispute is a strong negative signal.
 *
 * 3. Disputes initiated (weight: -2 per initiated dispute)
 *    Every dispute the user initiated subtracts 2 points, discouraging
 *    frivolous disputes regardless of outcome.
 *
 * 4. Volume (tiered bonus on total trades)
 *    >= 50 trades: +15
 *    >= 25 trades: +8
 *    >= 10 trades: +5
 *    Rewards sustained activity and long-term participation.
 *
 * The final score is clamped to [0, 100].
 */
export const TRUST_SCORE_SPEC = {
  base: 50,
  weights: {
    completedTrade: 5,
    disputeLost: -8,
    disputeInitiated: -2,
  },
  volumeTiers: [
    { minTrades: 50, bonus: 15 },
    { minTrades: 25, bonus: 8 },
    { minTrades: 10, bonus: 5 },
  ],
  min: 0,
  max: 100,
} as const;

export interface TrustScoreFactors {
  completedTrades: number;
  disputesLost: number;
  disputesInitiated: number;
  totalTrades: number;
}

export interface TrustScoreBreakdown {
  base: number;
  completedTrades: number;
  disputesLost: number;
  disputesInitiated: number;
  volumeBonus: number;
  score: number;
}

export interface DriftReportEntry {
  walletAddress: string;
  storedScore: number;
  computedScore: number;
  drift: number;
}

export interface DriftReport {
  checked: number;
  drifted: number;
  entries: DriftReportEntry[];
}

export interface ReputationEvent {
  id: string;
  event: string;
  impact: number;
  impactLabel: string;
  timestamp: string;
  type: "trade_completed" | "trade_initiated" | "dispute_initiated" | "dispute_resolved" | "dispute_involved" | "account_created";
}

export interface ReputationResponse {
  trustScore: number;
  totalTrades: number;
  completedTrades: number;
  disputedTrades: number;
  successRate: number;
  history: ReputationEvent[];
}

export class ReputationService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Pure trust score calculation from pre-aggregated factors.
   * Kept side-effect free so it can be unit tested per factor and reused by
   * the recomputation job.
   */
  static calculateTrustScore(factors: TrustScoreFactors): TrustScoreBreakdown {
    const { base, weights, volumeTiers, min, max } = TRUST_SCORE_SPEC;

    const completedContribution = factors.completedTrades * weights.completedTrade;
    const lostContribution = factors.disputesLost * weights.disputeLost;
    const initiatedContribution = factors.disputesInitiated * weights.disputeInitiated;

    const tier = volumeTiers.find((t) => factors.totalTrades >= t.minTrades);
    const volumeBonus = tier ? tier.bonus : 0;

    const raw =
      base +
      completedContribution +
      lostContribution +
      initiatedContribution +
      volumeBonus;

    return {
      base,
      completedTrades: completedContribution,
      disputesLost: lostContribution,
      disputesInitiated: initiatedContribution,
      volumeBonus,
      score: Math.max(min, Math.min(max, raw)),
    };
  }

  /**
   * Gathers the raw factors for a wallet from the database.
   */
  private async getFactors(walletAddress: string): Promise<TrustScoreFactors> {
    const normalized = walletAddress.toLowerCase();

    const [buyerTrades, sellerTrades, disputesInitiated] = await Promise.all([
      this.prisma.trade.findMany({ where: { buyerAddress: normalized } }),
      this.prisma.trade.findMany({ where: { sellerAddress: normalized } }),
      this.prisma.dispute.findMany({ where: { initiator: normalized } }),
    ]);

    const allTrades = [...buyerTrades, ...sellerTrades];
    const completedTrades = allTrades.filter((t) => t.status === TradeStatus.COMPLETED).length;
    const disputesLost = disputesInitiated.filter(
      (d) => d.status === "RESOLVED" || d.status === "CLOSED",
    ).length;

    return {
      completedTrades,
      disputesLost,
      disputesInitiated: disputesInitiated.length,
      totalTrades: allTrades.length,
    };
  }

  /**
   * Recomputes and persists the trust score for a wallet. Intended to be
   * called on trade completion and dispute resolution events so the stored
   * score reflects the latest state within the 1-minute SLA.
   */
  async recomputeTrustScore(walletAddress: string): Promise<number> {
    const normalized = walletAddress.toLowerCase();
    const factors = await this.getFactors(normalized);
    const { score } = ReputationService.calculateTrustScore(factors);

    await this.prisma.reputation.upsert({
      where: { walletAddress: normalized },
      create: { walletAddress: normalized, trustScore: score },
      update: { trustScore: score },
    });

    return score;
  }

  /**
   * Nightly full recompute. Recomputes every stored reputation row and
   * returns a drift report of wallets whose stored score differs from the
   * freshly computed value.
   */
  async runNightlyRecompute(): Promise<DriftReport> {
    const rows = await this.prisma.reputation.findMany();
    const entries: DriftReportEntry[] = [];

    for (const row of rows) {
      const factors = await this.getFactors(row.walletAddress);
      const { score } = ReputationService.calculateTrustScore(factors);

      if (score !== row.trustScore) {
        entries.push({
          walletAddress: row.walletAddress,
          storedScore: row.trustScore,
          computedScore: score,
          drift: score - row.trustScore,
        });
      }

      await this.prisma.reputation.update({
        where: { walletAddress: row.walletAddress },
        data: { trustScore: score },
      });
    }

    return { checked: rows.length, drifted: entries.length, entries };
  }

  async getUserReputation(walletAddress: string): Promise<ReputationResponse> {
    const normalized = walletAddress.toLowerCase();

    const [buyerTrades, sellerTrades] = await Promise.all([
      this.prisma.trade.findMany({
        where: { buyerAddress: normalized },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.trade.findMany({
        where: { sellerAddress: normalized },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const allTrades = [...buyerTrades, ...sellerTrades];
    const completedTrades = allTrades.filter((t) => t.status === TradeStatus.COMPLETED);
    const disputedTrades = allTrades.filter((t) => t.status === TradeStatus.DISPUTED);
    const totalTrades = allTrades.length;
    const completedCount = completedTrades.length;
    const disputedCount = disputedTrades.length;

    const disputesInitiated = await this.prisma.dispute.findMany({
      where: { initiator: normalized },
      orderBy: { createdAt: "desc" },
    });

    const disputesLost =
      disputesInitiated.filter((d) => d.status === "RESOLVED" || d.status === "CLOSED").length;

    const { score: trustScore } = ReputationService.calculateTrustScore({
      completedTrades: completedCount,
      disputesLost,
      disputesInitiated: disputesInitiated.length,
      totalTrades,
    });

    const successRate =
      totalTrades > 0
        ? Math.round(((completedCount) / totalTrades) * 1000) / 10
        : 100;

    const history: ReputationEvent[] = [];

    for (const trade of completedTrades.slice(0, 5)) {
      const role = trade.buyerAddress === normalized ? "buyer" : "seller";
      history.push({
        id: `trade-${trade.tradeId}`,
        event: `Completed trade as ${role} (${trade.tradeId.slice(0, 8)}...)`,
        impact: 5,
        impactLabel: "+5",
        timestamp: trade.completedAt?.toISOString() ?? trade.createdAt.toISOString(),
        type: "trade_completed",
      });
    }

    for (const dispute of disputesInitiated.slice(0, 5)) {
      const resolved = dispute.status === "RESOLVED" || dispute.status === "CLOSED";
      history.push({
        id: `dispute-${dispute.id}`,
        event: resolved
          ? `Dispute on trade ${dispute.tradeId.slice(0, 8)}... was resolved`
          : `Initiated dispute on trade ${dispute.tradeId.slice(0, 8)}...`,
        impact: resolved ? -10 : -2,
        impactLabel: resolved ? "-10" : "-2",
        timestamp: dispute.createdAt.toISOString(),
        type: resolved ? "dispute_resolved" : "dispute_initiated",
      });
    }

    history.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      trustScore,
      totalTrades,
      completedTrades: completedCount,
      disputedTrades: disputedCount,
      successRate,
      history: history.slice(0, 20),
    };
  }
}
