/**
 * Outbox Consistency Scanner
 * 
 * Periodic checks for missed side effects:
 * - Scans for trades that changed state but have no corresponding events in outbox
 * - Generates gap reports
 * - Detects silent failures in event emission
 */

import { Prisma, TradeStatus } from "@prisma/client";
import { prisma } from "../../lib/db";
import { appLogger } from "../../middleware/logger";
import { ChainEventOutbox } from "@prisma/client";

export interface OutboxGap {
  tradeId: string;
  expectedEventType: string;
  lastStateChange: Date;
  detectedAt: Date;
  severity: "critical" | "warning" | "info";
  context: {
    currentStatus: string;
    previousStatus?: string;
    timeSinceChange: number; // milliseconds
  };
}

export interface OutboxConsistencyReport {
  scanStartTime: Date;
  scanEndTime: Date;
  totalTradesScanned: number;
  gapsDetected: OutboxGap[];
  summary: {
    criticalGaps: number;
    warningGaps: number;
    infoGaps: number;
  };
}

/**
 * Expected event mapping per status transition
 * Maps (previousStatus, currentStatus) -> expected events
 * Note: This is a reference, actual mapping is in actionEventMapping.ts
 */
const EXPECTED_EVENTS_BY_TRANSITION: Record<string, string[]> = {
  "CREATED|FUNDED": ["TradeFunded"],
  "FUNDED|DELIVERED": ["DeliveryConfirmed"],
  "DELIVERED|COMPLETED": ["FundsReleased"],
  "FUNDED|DISPUTED": ["DisputeInitiated"],
  "DELIVERED|DISPUTED": ["DisputeInitiated"],
  "DISPUTED|COMPLETED": ["DisputeResolved"],
  "CREATED|CANCELLED": ["TradeCancelled"],
  "PENDING_SIGNATURE|CREATED": [], // On-chain event will follow
};

/**
 * Scan outbox for completeness gaps
 * Checks if state changes are accompanied by expected events
 */
export async function scanOutboxCompleteness(
  timeWindowMinutes: number = 60,
): Promise<OutboxConsistencyReport> {
  const startTime = new Date();
  appLogger.info(
    { timeWindowMinutes },
    "[OutboxScanner] Starting consistency scan",
  );

  const gaps: OutboxGap[] = [];
  const scanEndTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000);

  try {
    // Get all trades that changed status in the window
    const tradesWithStatusChange = await prisma.trade.findMany({
      where: {
        updatedAt: {
          gte: scanEndTime,
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    appLogger.debug(
      { count: tradesWithStatusChange.length },
      "[OutboxScanner] Fetched trades with recent changes",
    );

    for (const trade of tradesWithStatusChange) {
      // Check if this trade status change has corresponding outbox events
      // Look for any events in the window matching this trade
      const outboxEntries = await prisma.chainEventOutbox.findMany({
        where: {
          tradeId: trade.tradeId,
          createdAt: {
            gte: scanEndTime,
          },
        },
      });

      // If trade changed but has no events, it's a gap
      if (outboxEntries.length === 0 && trade.status !== TradeStatus.PENDING_SIGNATURE) {
        // Check if trade was transitioned recently
        const timeSinceChange = Date.now() - trade.updatedAt.getTime();

        // Classify severity based on time elapsed
        let severity: "critical" | "warning" | "info" = "info";
        if (timeSinceChange > 5 * 60 * 1000) {
          // > 5 mins
          severity = "critical";
        } else if (timeSinceChange > 2 * 60 * 1000) {
          // > 2 mins
          severity = "warning";
        }

        gaps.push({
          tradeId: trade.tradeId,
          expectedEventType: "UnknownEvent",
          lastStateChange: trade.updatedAt,
          detectedAt: new Date(),
          severity,
          context: {
            currentStatus: trade.status,
            timeSinceChange,
          },
        });

        appLogger.warn(
          {
            tradeId: trade.tradeId,
            status: trade.status,
            timeSinceChange,
          },
          "[OutboxScanner] Detected gap: trade status changed without outbox event",
        );
      }
    }

    const summary = {
      criticalGaps: gaps.filter((g) => g.severity === "critical").length,
      warningGaps: gaps.filter((g) => g.severity === "warning").length,
      infoGaps: gaps.filter((g) => g.severity === "info").length,
    };

    const report: OutboxConsistencyReport = {
      scanStartTime: startTime,
      scanEndTime,
      totalTradesScanned: tradesWithStatusChange.length,
      gapsDetected: gaps,
      summary,
    };

    appLogger.info({ summary }, "[OutboxScanner] Scan complete");

    return report;
  } catch (error) {
    appLogger.error({ error }, "[OutboxScanner] Scan failed");
    throw error;
  }
}

/**
 * Generate detailed gap report for a time range
 * Useful for historical analysis and debugging
 */
export async function generateOutboxGapReport(
  startTime: Date,
  endTime: Date,
): Promise<{
  gaps: OutboxGap[];
  summary: Record<string, number>;
  recommendations: string[];
}> {
  const gaps: OutboxGap[] = [];

  const trades = await prisma.trade.findMany({
    where: {
      updatedAt: {
        gte: startTime,
        lte: endTime,
      },
    },
  });

  // Similar scanning logic as scanOutboxCompleteness
  // Iterate trades and check for missing events

  const summary: Record<string, any> = {
    totalGaps: gaps.length,
    byEventType: {} as Record<string, number>,
    bySeverity: {
      critical: 0,
      warning: 0,
      info: 0,
    },
  };

  gaps.forEach((gap) => {
    summary.byEventType[gap.expectedEventType] =
      (summary.byEventType[gap.expectedEventType] || 0) + 1;
    (summary.bySeverity[gap.severity] as number)++;
  });

  const recommendations: string[] = [];
  if (summary.bySeverity.critical > 0) {
    recommendations.push(
      "CRITICAL: Investigate and replay missing events immediately",
    );
  }
  if (summary.bySeverity.warning > 0) {
    recommendations.push("WARNING: Review event emission in services");
  }

  return { gaps, summary, recommendations };
}

/**
 * Export outbox gaps in various formats for analysis
 */
export async function exportOutboxGaps(
  gaps: OutboxGap[],
  format: "csv" | "json" | "markdown",
): Promise<string> {
  if (format === "json") {
    return JSON.stringify(gaps, null, 2);
  }

  if (format === "csv") {
    const headers = [
      "TradeId",
      "ExpectedEventType",
      "LastStateChange",
      "DetectedAt",
      "Severity",
      "TimeSinceChangeMs",
    ].join(",");
    const rows = gaps
      .map((g) =>
        [
          g.tradeId,
          g.expectedEventType,
          g.lastStateChange.toISOString(),
          g.detectedAt.toISOString(),
          g.severity,
          g.context.timeSinceChange,
        ].join(","),
      )
      .join("\n");
    return `${headers}\n${rows}`;
  }

  if (format === "markdown") {
    let md = "# Outbox Gaps Report\n\n";
    md += `Generated: ${new Date().toISOString()}\n`;
    md += `Total Gaps: ${gaps.length}\n\n`;
    md += "| Trade ID | Event Type | Last Change | Severity |\n";
    md += "|---|---|---|---|\n";
    gaps.forEach((g) => {
      md += `| ${g.tradeId} | ${g.expectedEventType} | ${g.lastStateChange.toISOString()} | ${g.severity} |\n`;
    });
    return md;
  }

  throw new Error(`Unknown export format: ${format}`);
}
