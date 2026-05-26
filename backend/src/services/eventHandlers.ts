import { Prisma } from "@prisma/client";
import { EventType, ParsedEvent, EVENT_TO_STATUS } from "../types/events";
import { appLogger } from "../middleware/logger";

type TradeCreatePayload = {
  tradeId: string;
  buyerAddress: string;
  sellerAddress: string;
  amountUsdc?: string;
  status: (typeof EVENT_TO_STATUS)[EventType];
  version: number;
};

async function applyStatusTransition(
  tx: Prisma.TransactionClient,
  event: ParsedEvent,
  createPayload: TradeCreatePayload,
): Promise<void> {
  const status = EVENT_TO_STATUS[event.eventType];
  await tx.trade.upsert({
    where: { tradeId: event.tradeId },
    update: {
      status,
      updatedAt: new Date(),
    },
    create: createPayload,
  });
}

export async function handleTradeCreated(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void> {
  await applyStatusTransition(tx, event, {
    tradeId: event.tradeId,
    buyerAddress: (event.data.buyer as string) || "",
    sellerAddress: (event.data.seller as string) || "",
    amountUsdc: String(event.data.amount_usdc ?? "0"),
    status: EVENT_TO_STATUS[EventType.TradeCreated],
    version: 1,
  });
  appLogger.debug({ tradeId: event.tradeId, ledger: event.ledgerSequence }, "[EventHandler] TradeCreated");
}

export async function handleTradeFunded(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void> {
  await applyStatusTransition(tx, event, {
    tradeId: event.tradeId,
    buyerAddress: "",
    sellerAddress: "",
    status: EVENT_TO_STATUS[EventType.TradeFunded],
    version: 1,
  });
  appLogger.debug({ tradeId: event.tradeId, ledger: event.ledgerSequence }, "[EventHandler] TradeFunded");
}

export async function handleDeliveryConfirmed(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void> {
  await applyStatusTransition(tx, event, {
    tradeId: event.tradeId,
    buyerAddress: "",
    sellerAddress: "",
    status: EVENT_TO_STATUS[EventType.DeliveryConfirmed],
    version: 1,
  });
  appLogger.debug({ tradeId: event.tradeId, ledger: event.ledgerSequence }, "[EventHandler] DeliveryConfirmed");
}

export async function handleFundsReleased(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void> {
  await applyStatusTransition(tx, event, {
    tradeId: event.tradeId,
    buyerAddress: "",
    sellerAddress: "",
    status: EVENT_TO_STATUS[EventType.FundsReleased],
    version: 1,
  });
  appLogger.debug({ tradeId: event.tradeId, ledger: event.ledgerSequence }, "[EventHandler] FundsReleased");
}

export async function handleDisputeInitiated(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void> {
  await applyStatusTransition(tx, event, {
    tradeId: event.tradeId,
    buyerAddress: "",
    sellerAddress: "",
    status: EVENT_TO_STATUS[EventType.DisputeInitiated],
    version: 1,
  });
  appLogger.debug({ tradeId: event.tradeId, ledger: event.ledgerSequence }, "[EventHandler] DisputeInitiated");
}

export async function handleDisputeResolved(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void> {
  await applyStatusTransition(tx, event, {
    tradeId: event.tradeId,
    buyerAddress: "",
    sellerAddress: "",
    status: EVENT_TO_STATUS[EventType.DisputeResolved],
    version: 1,
  });
  appLogger.debug({ tradeId: event.tradeId, ledger: event.ledgerSequence }, "[EventHandler] DisputeResolved");
}

/** Dispatch a parsed event to the correct handler */
export async function dispatchEvent(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void> {
  const handlers: Record<EventType, (t: Prisma.TransactionClient, e: ParsedEvent) => Promise<void>> = {
    [EventType.TradeCreated]: handleTradeCreated,
    [EventType.TradeFunded]: handleTradeFunded,
    [EventType.DeliveryConfirmed]: handleDeliveryConfirmed,
    [EventType.FundsReleased]: handleFundsReleased,
    [EventType.DisputeInitiated]: handleDisputeInitiated,
    [EventType.DisputeResolved]: handleDisputeResolved,
  };

  const handler = handlers[event.eventType];
  if (handler) {
    await handler(tx, event);
  } else {
    appLogger.warn({ eventType: event.eventType }, "[EventHandler] Unknown event type");
  }
}
