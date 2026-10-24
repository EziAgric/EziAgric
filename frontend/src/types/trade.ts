// src/types/trade.ts

/**
 * Canonical, UI-facing trade status. This is the single source of truth for
 * status strings in the frontend — components must import it from here rather
 * than redeclaring their own union. Raw backend values are converted with
 * `toTradeStatus`.
 */
export type TradeStatus =
  | "IN TRANSIT"
  | "PENDING"
  | "SETTLED"
  | "DISPUTED"
  | "DRAFT";

export const TRADE_STATUSES: readonly TradeStatus[] = [
  "IN TRANSIT",
  "PENDING",
  "SETTLED",
  "DISPUTED",
  "DRAFT",
];

/** Status values as returned by the backend trade API. */
export type ApiTradeStatus =
  | "PENDING_SIGNATURE"
  | "CREATED"
  | "FUNDED"
  | "DELIVERED"
  | "SETTLED"
  | "DISPUTED"
  | "CANCELLED";

const API_TO_TRADE_STATUS: Record<ApiTradeStatus, TradeStatus> = {
  PENDING_SIGNATURE: "PENDING",
  CREATED: "PENDING",
  FUNDED: "IN TRANSIT",
  DELIVERED: "IN TRANSIT",
  SETTLED: "SETTLED",
  DISPUTED: "DISPUTED",
  CANCELLED: "DRAFT",
};

/**
 * Map a raw backend status (any casing) to the canonical `TradeStatus`.
 * Values that are already canonical pass through; unknown values fall back to
 * "PENDING" so the UI never renders an unstyled status.
 */
export function toTradeStatus(status: string): TradeStatus {
  const normalized = status.trim().toUpperCase();
  if ((TRADE_STATUSES as readonly string[]).includes(normalized)) {
    return normalized as TradeStatus;
  }
  return API_TO_TRADE_STATUS[normalized as ApiTradeStatus] ?? "PENDING";
}

/** Filter buckets offered on the trades list (`?status=` query param). */
export type TradeStatusFilter =
  | "all"
  | "active"
  | "pending"
  | "completed"
  | "disputed";

export interface TradeParty {
  name: string;
  walletAddress: string;
  trustScore: number;
  avatar?: string;
}

export interface TimelineEvent {
  id: string;
  type: "escrow_funded" | "inspection_passed" | "dispatched" | "settlement";
  title: string;
  description?: string;
  timestamp?: string;
  status: "completed" | "current" | "pending";
  tracking?: {
    trackingNumber: string;
    imageUrl?: string;
  };
}

export type TransactionEventStatus = "completed" | "active" | "pending";

export type TransactionEventActor = "system" | "buyer" | "seller" | "driver";

export interface TransactionEvent {
  id: string;
  title: string;
  actor: TransactionEventActor;
  status?: TransactionEventStatus;
  timestamp?: string;
  description?: string;
}

export interface LossRatio {
  label: string;
  value: number; // percentage 0-100
}

export interface TradeDetail {
  id: string;
  commodity: string;
  quantity: string; // e.g. "20 Tons Non-GMO"
  category: string; // e.g. "Grains / Legumes"
  status: TradeStatus;
  initiatedAt: string;

  buyer: TradeParty;
  seller: TradeParty;

  // Financials
  vaultAmountLocked: number;
  assetValue: number;
  platformFeePercent: number;
  platformFee: number;
  networkGasEst: string;

  // Contract
  contractId: string;
  incoterms: string;
  originPort: string;
  destinationPort: string;
  eta: string;
  etaLabel?: string;
  carrier: string;

  // Timeline
  timeline: TimelineEvent[];

  // Chronological transaction timeline
  transactionTimeline?: TransactionEvent[];
  currentTransactionIndex?: number;

  // Optional loss ratios
  lossRatios?: LossRatio[];
}
