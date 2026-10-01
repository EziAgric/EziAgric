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
  type: "trade_completed" | "trade_initiated" | "dispute_initiated" | "dispute_resolved" | "dispute_involved" | "account_created" | "trade_review";
}

export interface ReputationResponse {
  trustScore: number;
  totalTrades: number;
  completedTrades: number;
  disputedTrades: number;
  successRate: number;
  history: ReputationEvent[];
}

export interface TradeReviewInput {
  tradeId: string;
  reviewerAddress: string;
  rating: number;
  comment?: string;
}

export interface TradeReviewResult {
  id: string;
  tradeId: string;
  reviewerAddress: string;
  revieweeAddress: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

const MAX_COMMENT_LENGTH = 500;
const REVIEW_WEIGHT = 2;

const PROFANITY_PATTERNS: RegExp[] = [
  /\bf+u+c+k+\w*/gi,
  /\bs+h+i+t+\w*/gi,
  /\bb+i+t+c+h+\w*/gi,
  /\ba+s+s+h+o+l+e+\w*/gi,
  /\bb+a+s+t+a+r+d+\w*/gi,
  /\bd+a+m+n+\w*/gi,
];

const PII_PATTERNS: RegExp[] = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  /\b(?:\+?\d[\s-]?){7,}\b/g,
  /\b0x[a-fA-F0-9]{40}\b/g,
  /\bG[A-Z2-7]{55}\b/g,
];

export function sanitizeReviewComment(comment: string): string {
  let sanitized = comment;
  for (const pattern of PII_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[redacted]");
  }
  for (const pattern of PROFANITY_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => "*".repeat(match.length));
  }
  sanitized = sanitized.replace(/\s+/g, " ").trim();
  return sanitized.slice(0, MAX_COMMENT_LENGTH);
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

    const reviewsReceived = await this.prisma.tradeReview.findMany({
      where: { revieweeAddress: normalized },
      orderBy: { createdAt: "desc" },
    });

    const breakdown = ReputationService.calculateTrustScore({
      completedTrades: completedCount,
      disputesLost,
      disputesInitiated: disputesInitiated.length,
      totalTrades,
    });

    // Reviews adjust the unclamped total so the final clamp applies once.
    let trustScore =
      breakdown.base +
      breakdown.completedTrades +
      breakdown.disputesLost +
      breakdown.disputesInitiated +
      breakdown.volumeBonus;

    for (const review of reviewsReceived) {
      trustScore += (review.rating - 3) * REVIEW_WEIGHT;
    }

    trustScore = Math.max(TRUST_SCORE_SPEC.min, Math.min(TRUST_SCORE_SPEC.max, trustScore));

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

    for (const review of reviewsReceived.slice(0, 5)) {
      const impact = (review.rating - 3) * REVIEW_WEIGHT;
      history.push({
        id: `review-${review.id}`,
        event: `Received ${review.rating}-star review on trade ${review.tradeId.slice(0, 8)}...`,
        impact,
        impactLabel: impact >= 0 ? `+${impact}` : `${impact}`,
        timestamp: review.createdAt.toISOString(),
        type: "trade_review",
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

  async submitTradeReview(input: TradeReviewInput): Promise<TradeReviewResult> {
    const reviewerAddress = input.reviewerAddress.toLowerCase();

    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw new Error("Rating must be an integer between 1 and 5");
    }

    const trade = await this.prisma.trade.findUnique({
      where: { tradeId: input.tradeId },
    });

    if (!trade) {
      throw new Error("Trade not found");
    }

    const isBuyer = trade.buyerAddress === reviewerAddress;
    const isSeller = trade.sellerAddress === reviewerAddress;

    if (!isBuyer && !isSeller) {
      throw new Error("Only trade counterparties may submit a review");
    }

    const dispute = await this.prisma.dispute.findFirst({
      where: { tradeId: input.tradeId },
    });
    const disputeResolved =
      dispute !== null && (dispute.status === "RESOLVED" || dispute.status === "CLOSED");

    if (trade.status !== TradeStatus.COMPLETED && !disputeResolved) {
      throw new Error("Reviews are only allowed after completion or a resolved dispute");
    }

    const existing = await this.prisma.tradeReview.findUnique({
      where: {
        tradeId_reviewerAddress: {
          tradeId: input.tradeId,
          reviewerAddress,
        },
      },
    });

    if (existing) {
      throw new Error("A review has already been submitted for this trade");
    }

    const revieweeAddress = isBuyer ? trade.sellerAddress : trade.buyerAddress;
    const comment = input.comment ? sanitizeReviewComment(input.comment) : null;

    const review = await this.prisma.tradeReview.create({
      data: {
        tradeId: input.tradeId,
        reviewerAddress,
        revieweeAddress,
        rating: input.rating,
        comment,
      },
    });

    return {
      id: review.id,
      tradeId: review.tradeId,
      reviewerAddress: review.reviewerAddress,
      revieweeAddress: review.revieweeAddress,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt.toISOString(),
    };
  }
}
