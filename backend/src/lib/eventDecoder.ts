import * as StellarSdk from "@stellar/stellar-sdk";
import { EventType, ParsedEvent } from "../types/events";
import { appLogger } from "../middleware/logger";

/** Soroban event topic symbol -> our EventType enum. Covers `stream_clawback` and related events. */
const SYMBOL_TO_EVENT_TYPE: Record<string, EventType> = {
  TradeCreated: EventType.TradeCreated,
  trade_created: EventType.TradeCreated,
  TradeFunded: EventType.TradeFunded,
  trade_funded: EventType.TradeFunded,
  DeliveryConfirmed: EventType.DeliveryConfirmed,
  delivery_confirmed: EventType.DeliveryConfirmed,
  FundsReleased: EventType.FundsReleased,
  funds_released: EventType.FundsReleased,
  DisputeInitiated: EventType.DisputeInitiated,
  dispute_initiated: EventType.DisputeInitiated,
  DisputeResolved: EventType.DisputeResolved,
  dispute_resolved: EventType.DisputeResolved,
  StreamClawback: EventType.StreamClawback,
  stream_clawback: EventType.StreamClawback,
};

function extractSymbolValue(scVal: StellarSdk.xdr.ScVal): string | null {
  try {
    const nativeVal = StellarSdk.scValToNative(scVal);
    if (typeof nativeVal === "string") return nativeVal;
    return String(nativeVal);
  } catch {
    return null;
  }
}

function extractScalarValue(scVal: StellarSdk.xdr.ScVal): string {
  try {
    const nativeVal = StellarSdk.scValToNative(scVal);
    return String(nativeVal);
  } catch {
    return "unknown";
  }
}

/**
 * Decode a raw Soroban contract event (as returned by RPC `getEvents`) into
 * our internal `ParsedEvent` shape. Returns `null` for malformed payloads
 * (missing/empty topic, unrecognized event symbol) instead of throwing, so
 * callers can skip the event and continue processing the batch.
 */
export function decodeContractEvent(
  rawEvent: StellarSdk.rpc.Api.EventResponse,
  fallbackContractId: string,
): ParsedEvent | null {
  try {
    const topic = rawEvent.topic;
    if (!topic || topic.length === 0) return null;

    const eventSymbol = extractSymbolValue(topic[0]);
    if (!eventSymbol) return null;

    const eventType = SYMBOL_TO_EVENT_TYPE[eventSymbol];
    if (!eventType) {
      appLogger.warn({ eventSymbol }, "[EventDecoder] Unknown event symbol");
      return null;
    }

    const tradeId = topic.length > 1 ? extractScalarValue(topic[1]) : "unknown";

    const data: Record<string, unknown> = {};
    if (rawEvent.value) {
      data.raw = rawEvent.value;
      const val = rawEvent.value as unknown as {
        type?: string;
        value?: Array<{ key: { value: string }; val: { value: unknown } }>;
      };
      if (val?.type === "map" && Array.isArray(val.value)) {
        for (const entry of val.value) {
          if (entry?.key?.value) {
            data[entry.key.value] = entry.val?.value;
          }
        }
      }
    }

    return {
      eventType,
      tradeId: String(tradeId),
      ledgerSequence: rawEvent.ledger,
      contractId: String(rawEvent.contractId ?? fallbackContractId),
      eventId: rawEvent.id,
      data,
    };
  } catch (error) {
    appLogger.error({ error }, "[EventDecoder] Failed to decode event");
    return null;
  }
}
