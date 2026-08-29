import * as StellarSdk from "@stellar/stellar-sdk";
import { decodeContractEvent } from "../eventDecoder";
import { EventType } from "../../types/events";

function symbolTopic(symbol: string): StellarSdk.xdr.ScVal {
  return StellarSdk.nativeToScVal(symbol, { type: "symbol" });
}

describe("decodeContractEvent", () => {
  const contractId = "CFALLBACK";

  it("decodes a stream_clawback event into a typed ParsedEvent", () => {
    const rawEvent = {
      topic: [symbolTopic("stream_clawback"), symbolTopic("trade-1")],
      value: undefined,
      ledger: 100,
      contractId,
      id: "evt-1",
    } as unknown as StellarSdk.rpc.Api.EventResponse;

    const parsed = decodeContractEvent(rawEvent, contractId);

    expect(parsed).not.toBeNull();
    expect(parsed?.eventType).toBe(EventType.StreamClawback);
    expect(parsed?.contractId).toBe(contractId);
    expect(parsed?.eventId).toBe("evt-1");
  });

  it("returns null for an event with an empty topic array", () => {
    const rawEvent = {
      topic: [],
      ledger: 1,
      contractId,
      id: "evt-2",
    } as unknown as StellarSdk.rpc.Api.EventResponse;

    expect(decodeContractEvent(rawEvent, contractId)).toBeNull();
  });

  it("returns null for an event with a missing topic", () => {
    const rawEvent = {
      ledger: 1,
      contractId,
      id: "evt-3",
    } as unknown as StellarSdk.rpc.Api.EventResponse;

    expect(decodeContractEvent(rawEvent, contractId)).toBeNull();
  });

  it("returns null for an unrecognized event symbol instead of throwing", () => {
    const rawEvent = {
      topic: [symbolTopic("SomeUnknownEvent")],
      ledger: 1,
      contractId,
      id: "evt-4",
    } as unknown as StellarSdk.rpc.Api.EventResponse;

    expect(decodeContractEvent(rawEvent, contractId)).toBeNull();
  });

  it("returns null instead of throwing when the topic value is malformed", () => {
    const rawEvent = {
      topic: [{ not: "a valid ScVal" }],
      ledger: 1,
      contractId,
      id: "evt-5",
    } as unknown as StellarSdk.rpc.Api.EventResponse;

    expect(decodeContractEvent(rawEvent, contractId)).toBeNull();
  });
});
