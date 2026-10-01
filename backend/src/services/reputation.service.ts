import { PrismaClient, TradeStatus } from "@prisma/client";

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

    let trustScore = 50;
    trustScore += completedCount * 5;
    trustScore -= disputesLost * 8;
    trustScore -= disputesInitiated.length * 2;
    if (totalTrades >= 50) trustScore += 15;
    else if (totalTrades >= 25) trustScore += 8;
    else if (totalTrades >= 10) trustScore += 5;

    for (const review of reviewsReceived) {
      trustScore += (review.rating - 3) * REVIEW_WEIGHT;
    }

    trustScore = Math.max(0, Math.min(100, trustScore));

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
