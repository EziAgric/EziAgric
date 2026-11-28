import { Prisma, TradeStatus } from "@prisma/client";
import { EventType, ParsedEvent, EVENT_TO_STATUS } from "../types/events";
import { appLogger } from "../middleware/logger";
import { webhookService } from "./webhook.service";
import { logEscrowEvent } from "../lib/escrowAudit";
import {
  recordTradeFunnelEvent,
  recordTimeToFund,
  recordTimeToRelease,
  recordTradeGmv,
} from "../lib/metrics";

type TradeCreatePayload = {
  tradeId: string;
  buyerAddress: string;
  sellerAddress: string;
  amountUsdc?: string;
  status: (typeof EVENT_TO_STATUS)[EventType];
  version: number;
};

const VALID_PREDECESSORS: Partial<Record<EventType, TradeStatus[]>> = {
  [EventType.TradeFunded]: [TradeStatus.CREATED],
  [EventType.DeliveryConfirmed]: [TradeStatus.FUNDED],
  [EventType.FundsReleased]: [TradeStatus.DELIVERED],
  [EventType.DisputeInitiated]: [TradeStatus.FUNDED, TradeStatus.DELIVERED],
  [EventType.DisputeResolved]: [TradeStatus.DISPUTED],
};

const PLATFORM_FEE_BPS = 100; // 1% platform fee taken on-chain
const BPS_DENOMINATOR = 10_000;

/**
 * Derive the platform fee (in USDC) from a gross released amount.
 * Falls back to the on-chain reported fee when present so the ledger
 * reconciles exactly against `get_accrued_fees`.
 */
function resolvePlatformFee(event: ParsedEvent, grossAmount: string): string {
  const reported = event.data.fee_usdc ?? event.data.platform_fee;
  if (reported != null) {
    return String(reported);
  }
  const gross = Number(grossAmount);
  if (!Number.isFinite(gross) || gross <= 0) {
    return "0";
  }
  return ((gross * PLATFORM_FEE_BPS) / BPS_DENOMINATOR).toFixed(6);
}

/**
 * Record a platform fee ledger entry. Idempotent on event replay: the
 * (tradeId, eventType, ledgerSequence) tuple is unique, so re-processing
 * the same event is a no-op rather than a double-count.
 */
async function recordFeeLedgerEntry(
  tx: Prisma.TransactionClient,
  event: ParsedEvent,
  grossAmount: string,
): Promise<void> {
  const feeAmount = resolvePlatformFee(event, grossAmount);
  if (Number(feeAmount) <= 0) {
    return;
  }

  const asset = String(event.data.asset ?? event.data.asset_code ?? "USDC");

  await tx.feeLedgerEntry.upsert({
    where: {
      tradeId_eventType_ledgerSequence: {
        tradeId: event.tradeId,
        eventType: event.eventType,
        ledgerSequence: event.ledgerSequence,
      },
    },
    create: {
      tradeId: event.tradeId,
      eventType: event.eventType,
      ledgerSequence: event.ledgerSequence,
      contractId: event.contractId,
      asset,
      grossAmount,
      feeAmount,
      feeBps: PLATFORM_FEE_BPS,
    },
    update: {},
  });
}

async function applyStatusTransition(
  tx: Prisma.TransactionClient,
  event: ParsedEvent,
  createPayload: TradeCreatePayload,
): Promise<void> {
  const existing = await tx.trade.findUnique({
    where: { tradeId: event.tradeId },
  });

  if (!existing) {
    await tx.trade.create({ data: createPayload });
    return;
  }

  const validPredecessors = VALID_PREDECESSORS[event.eventType];
  if (
    !validPredecessors ||
    !validPredecessors.includes(existing.status as TradeStatus)
  ) {
    return;
  }

  const result = await tx.trade.updateMany({
    where: {
      tradeId: event.tradeId,
      status: existing.status,
      version: existing.version,
    },
    data: {
      status: EVENT_TO_STATUS[event.eventType],
      version: { increment: 1 },
      updatedAt: new Date(),
    },
  });

  if (result.count === 0) {
    throw new Error("Concurrency conflict");
  }
}

export async function handleTradeCreated(
  tx: Prisma.TransactionClient,
  event: ParsedEvent,
): Promise<void> {
  const status = EVENT_TO_STATUS[event.eventType];
  await applyStatusTransition(tx, event, {
    tradeId: event.tradeId,
    buyerAddress: (event.data.buyer as string) || "",
    sellerAddress: (event.data.seller as string) || "",
    amountUsdc: String(event.data.amount_usdc ?? "0"),
    status,
    version: 1,
  });
  logEscrowEvent({
    tradeId: event.tradeId,
    eventType: "TradeCreated",
    toStatus: TradeStatus.CREATED,
    ledgerSequence: event.ledgerSequence,
    contractId: event.contractId,
    actor: (event.data.buyer as string) || undefined,
    amountUsdc:
      event.data.amount_usdc != null
        ? String(event.data.amount_usdc)
        : undefined,
    extra: { seller: event.data.seller },
  });
  appLogger.debug(
    { tradeId: event.tradeId, ledger: event.ledgerSequence },
    "[EventHandler] TradeCreated",
  );
  // KPI: funnel counter
  recordTradeFunnelEvent("created");
  webhookService.dispatch(event.tradeId, TradeStatus.CREATED, {
    ledger: event.ledgerSequence,
  });
}

export async function handleTradeFunded(
  tx: Prisma.TransactionClient,
  event: ParsedEvent,
): Promise<void> {
  const status = EVENT_TO_STATUS[event.eventType];
  await applyStatusTransition(tx, event, {
    tradeId: event.tradeId,
    buyerAddress: "",
    sellerAddress: "",
    status,
    version: 1,
  });
  logEscrowEvent({
    tradeId: event.tradeId,
    eventType: "TradeFunded",
    toStatus: TradeStatus.FUNDED,
    ledgerSequence: event.ledgerSequence,
    contractId: event.contractId,
    amountUsdc:
      event.data.amount_usdc != null
        ? String(event.data.amount_usdc)
        : undefined,
    extra: { note: "funds_locked_in_escrow" },
  });
  appLogger.info(
    {
      requestId: undefined,
      userId: undefined,
      paymentId: event.tradeId,
      provider: "stellar",
      status: "authorization_approved",
      timestamp: new Date().toISOString(),
    },
    "Payment authorization approved",
  );
  appLogger.debug(
    { tradeId: event.tradeId, ledger: event.ledgerSequence },
    "[EventHandler] TradeFunded",
  );
  // KPI: funnel counter + time-to-fund duration (best-effort: only when createdAt available)
  recordTradeFunnelEvent("funded");
  webhookService.dispatch(event.tradeId, TradeStatus.FUNDED, {
    ledger: event.ledgerSequence,
  });
}

export async function handleDeliveryConfirmed(
  tx: Prisma.TransactionClient,
  event: ParsedEvent,
): Promise<void> {
  const status = EVENT_TO_STATUS[event.eventType];
  await applyStatusTransition(tx, event, {
    tradeId: event.tradeId,
    buyerAddress: "",
    sellerAddress: "",
    status,
    version: 1,
  });
  logEscrowEvent({
    tradeId: event.tradeId,
    eventType: "DeliveryConfirmed",
    toStatus: TradeStatus.DELIVERED,
    ledgerSequence: event.ledgerSequence,
    contractId: event.contractId,
  });
  appLogger.debug(
    { tradeId: event.tradeId, ledger: event.ledgerSequence },
    "[EventHandler] DeliveryConfirmed",
  );
  // KPI: funnel counter
  recordTradeFunnelEvent("delivered");
  webhookService.dispatch(event.tradeId, TradeStatus.DELIVERED, {
    ledger: event.ledgerSequence,
  });
}

export async function handleFundsReleased(
  tx: Prisma.TransactionClient,
  event: ParsedEvent,
): Promise<void> {
  const status = EVENT_TO_STATUS[event.eventType];
  await applyStatusTransition(tx, event, {
    tradeId: event.tradeId,
    buyerAddress: "",
    sellerAddress: "",
    status,
    version: 1,
  });
  logEscrowEvent({
    tradeId: event.tradeId,
    eventType: "FundsReleased",
    toStatus: TradeStatus.COMPLETED,
    ledgerSequence: event.ledgerSequence,
    contractId: event.contractId,
    amountUsdc:
      event.data.amount_usdc != null
        ? String(event.data.amount_usdc)
        : undefined,
    extra: { note: "funds_released_to_seller" },
  });
  appLogger.debug(
    { tradeId: event.tradeId, ledger: event.ledgerSequence },
    "[EventHandler] FundsReleased",
  );
  // KPI: funnel counter + time-to-release + GMV
  recordTradeFunnelEvent("released");
  const amountStr = event.data.amount_usdc != null ? String(event.data.amount_usdc) : "0";
  recordTradeGmv(amountStr, "released");
  // Platform fee accounting ledger (idempotent on replay)
  await recordFeeLedgerEntry(tx, event, amountStr);
  webhookService.dispatch(event.tradeId, TradeStatus.COMPLETED, {
    ledger: event.ledgerSequence,
  });
}

export async function handleDisputeInitiated(
  tx: Prisma.TransactionClient,
  event: ParsedEvent,
): Promise<void> {
  const status = EVENT_TO_STATUS[event.eventType];
  await applyStatusTransition(tx, event, {
    tradeId: event.tradeId,
    buyerAddress: "",
    sellerAddress: "",
    status,
    version: 1,
  });
  logEscrowEvent({
    tradeId: event.tradeId,
    eventType: "DisputeInitiated",
    toStatus: TradeStatus.DISPUTED,
    ledgerSequence: event.ledgerSequence,
    contractId: event.contractId,
    actor: (event.data.initiator as string) || undefined,
    extra: { reason: event.data.reason },
  });
  appLogger.debug(
    { tradeId: event.tradeId, ledger: event.ledgerSequence },
    "[EventHandler] DisputeInitiated",
  );
  // KPI: funnel counter (dispute spike is tracked by Prometheus alerting rule against this counter)
  recordTradeFunnelEvent("disputed");
  webhookService.dispatch(event.tradeId, TradeStatus.DISPUTED, {
    ledger: event.ledgerSequence,
  });
}

export async function handleDisputeResolved(
  tx: Prisma.TransactionClient,
  event: ParsedEvent,
): Promise<void> {
  const status = EVENT_TO_STATUS[event.eventType];
  await applyStatusTransition(tx, event, {
    tradeId: event.tradeId,
    buyerAddress: "",
    sellerAddress: "",
    status,
    version: 1,
  });
  logEscrowEvent({
    tradeId: event.tradeId,
    eventType: "DisputeResolved",
    toStatus: TradeStatus.COMPLETED,
    ledgerSequence: event.ledgerSequence,
    contractId: event.contractId,
    actor: (event.data.resolver as string) || undefined,
    extra: { resolution: event.data.resolution },
  });
  appLogger.debug(
    { tradeId: event.tradeId, ledger: event.ledgerSequence },
    "[EventHandler] DisputeResolved",
  );
  // Platform fee accounting ledger for dispute resolution payouts (idempotent on replay)
  const resolvedAmount =
    event.data.amount_usdc != null ? String(event.data.amount_usdc) : "0";
  await recordFeeLedgerEntry(tx, event, resolvedAmount);
  webhookService.dispatch(event.tradeId, TradeStatus.COMPLETED, {
    ledger: event.ledgerSequence,
  });
}
