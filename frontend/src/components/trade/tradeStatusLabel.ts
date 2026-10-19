import type { MessageKey } from "@/lib/i18n";
import type { TradeStatus } from "@/types/trade";

/** Catalog key holding the display label for each canonical trade status. */
export const TRADE_STATUS_MESSAGE_KEYS: Record<TradeStatus, MessageKey> = {
  "IN TRANSIT": "tradeStatus.inTransit",
  PENDING: "tradeStatus.pending",
  SETTLED: "tradeStatus.settled",
  DISPUTED: "tradeStatus.disputed",
  DRAFT: "tradeStatus.draft",
};
