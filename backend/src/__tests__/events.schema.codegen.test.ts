/**
 * Event schema round-trip tests — Issue #190.
 *
 * Event parsing lived twice, once in Rust and once in TypeScript, with nothing
 * tying them together. These tests assert that what the contract publishes is
 * what the decoder dispatches on, using the generated schema as the reference.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as StellarSdk from "@stellar/stellar-sdk";

import { decodeContractEvent } from "../lib/eventDecoder";
import { EventType } from "../types/events";
import {
  EVENT_FIELDS,
  EVENT_SCHEMA_VERSION,
  EVENT_TOPICS,
  EVENT_TO_TRADE_STATUS,
  GeneratedEventType,
  TOPIC_TO_EVENT_TYPE,
} from "../types/generated/events.generated";

const REPO_ROOT = resolve(__dirname, "../../..");
const SCHEMA_PATH = resolve(REPO_ROOT, "schemas/events/amana_escrow.events.json");
const CONTRACT_SRC = resolve(REPO_ROOT, "contracts/amana_escrow/src/lib.rs");

interface SchemaFile {
  schemaVersion: number;
  events: Array<{
    name: string;
    rustStruct: string;
    topics: string[];
    fields: Array<{ name: string; type: string }>;
    tradeStatus?: string;
  }>;
}

const schema: SchemaFile = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
const contractSource = readFileSync(CONTRACT_SRC, "utf8");

/** Builds the RPC-shaped event a contract emission would produce. */
function emittedEvent(topics: string[], data: Record<string, unknown>) {
  return {
    id: "0000000000000000-0000000001",
    ledger: 12345,
    contractId: "CONTRACT_ID",
    topic: topics.map((topic) =>
      StellarSdk.nativeToScVal(topic, { type: "symbol" }),
    ),
    value: {
      type: "map",
      value: Object.entries(data).map(([key, value]) => ({
        key: { value: key },
        val: { value },
      })),
    },
  } as unknown as StellarSdk.rpc.Api.EventResponse;
}

describe("generated schema matches the canonical source", () => {
  it("covers every event in the schema file", () => {
    expect(Object.keys(GeneratedEventType)).toHaveLength(schema.events.length);
    for (const event of schema.events) {
      expect(GeneratedEventType[event.name as keyof typeof GeneratedEventType]).toBe(
        event.name,
      );
    }
  });

  it("carries the schema version", () => {
    expect(EVENT_SCHEMA_VERSION).toBe(schema.schemaVersion);
  });

  it("agrees with the contract's EVENT_SCHEMA_VERSION", () => {
    const match = contractSource.match(/pub const EVENT_SCHEMA_VERSION: u32 = (\d+);/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(EVENT_SCHEMA_VERSION);
  });

  it("maps every topic tuple exactly as the schema declares", () => {
    for (const event of schema.events) {
      const type = event.name as GeneratedEventType;
      expect(EVENT_TOPICS[type]).toEqual(event.topics);
      expect(EVENT_FIELDS[type]).toEqual(event.fields.map((f) => f.name));
    }
  });

  it("dispatches on a topic the contract actually publishes", () => {
    for (const event of schema.events) {
      // The contract source is the ground truth: the topic must appear in a
      // `#[contractevent(topics = [...])]` attribute.
      expect(contractSource).toContain(`"${event.topics[0]}"`);
      expect(TOPIC_TO_EVENT_TYPE[event.topics[0]]).toBe(event.name);
    }
  });

  it("gives every topic a single owner", () => {
    const firstTopics = schema.events.map((e) => e.topics[0]);
    expect(new Set(firstTopics).size).toBe(firstTopics.length);
  });

  it("only maps status-bearing events to a trade status", () => {
    for (const event of schema.events) {
      const type = event.name as GeneratedEventType;
      expect(EVENT_TO_TRADE_STATUS[type]).toBe(event.tradeStatus);
    }
  });
});

describe("emit -> decode round trip", () => {
  it("decodes the short topic the contract actually emits", () => {
    // The regression this issue is about: the decoder used to look for
    // "TradeCreated" while the contract publishes "TRDCRT", so nothing matched.
    const decoded = decodeContractEvent(
      emittedEvent(["TRDCRT", "42"], { trade_id: "42", amount: "1000000000" }),
      "FALLBACK",
    );

    expect(decoded).not.toBeNull();
    expect(decoded!.eventType).toBe(EventType.TradeCreated);
    expect(decoded!.tradeId).toBe("42");
    expect(decoded!.data.amount).toBe("1000000000");
  });

  it.each([
    ["TRDFND", EventType.TradeFunded],
    ["DELCNF", EventType.DeliveryConfirmed],
    ["RELSD", EventType.FundsReleased],
    ["DISINI", EventType.DisputeInitiated],
    ["DISRES", EventType.DisputeResolved],
    ["CLWBCK", EventType.StreamClawback],
  ])("decodes %s to %s", (topic, expected) => {
    const decoded = decodeContractEvent(emittedEvent([topic, "7"], {}), "FALLBACK");
    expect(decoded?.eventType).toBe(expected);
  });

  it("still decodes the legacy long-form symbols from older deployments", () => {
    const decoded = decodeContractEvent(
      emittedEvent(["trade_created", "9"], {}),
      "FALLBACK",
    );
    expect(decoded?.eventType).toBe(EventType.TradeCreated);
  });

  it("skips an event the backend does not react to rather than throwing", () => {
    // MEDADD is a real contract event with no backend handler.
    expect(decodeContractEvent(emittedEvent(["MEDADD"], {}), "FALLBACK")).toBeNull();
  });

  it("skips an unrecognised topic", () => {
    expect(decodeContractEvent(emittedEvent(["NOPE"], {}), "FALLBACK")).toBeNull();
  });

  it("skips an event with no topics", () => {
    expect(decodeContractEvent(emittedEvent([], {}), "FALLBACK")).toBeNull();
  });
});
