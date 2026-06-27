import { PrismaClient, TradeStatus } from "@prisma/client";

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

    let trustScore = 50;
    trustScore += completedCount * 5;
    trustScore -= disputesLost * 8;
    trustScore -= disputesInitiated.length * 2;
    if (totalTrades >= 50) trustScore += 15;
    else if (totalTrades >= 25) trustScore += 8;
    else if (totalTrades >= 10) trustScore += 5;
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
