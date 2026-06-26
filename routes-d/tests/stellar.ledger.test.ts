import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

const mockLedgerRecord = {
  sequence: 123456,
  hash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  closed_at: "2026-06-26T12:00:00Z",
  total_operations: 42,
  protocol_version: 22,
  successful_transaction_count: 15,
};

const { mockCall } = vi.hoisted(() => {
  const mockCall = vi.fn().mockResolvedValue({ records: [mockLedgerRecord] });
  return { mockCall };
});

vi.mock("@stellar/stellar-sdk", () => ({
  Horizon: {
    Server: vi.fn(() => ({
      ledgers: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      call: mockCall,
    })),
  },
}));

import { createLedgerRouter } from "../routes/stellar.ledger.js";

function createApp() {
  const app = express();
  app.use("/stellar", createLedgerRouter());
  return app;
}

describe("GET /stellar/ledger/latest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns latest ledger data", async () => {
    const app = createApp();
    const res = await request(app).get("/stellar/ledger/latest");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      sequence: 123456,
      hash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      closedAt: "2026-06-26T12:00:00Z",
      totalOps: 42,
      protocolVersion: 22,
      txCount: 15,
    });
  });

  it("returns 502 when network error occurs", async () => {
    mockCall.mockRejectedValueOnce(new Error("Network timeout"));

    const app = createApp();
    const res = await request(app).get("/stellar/ledger/latest");

    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      error: "Failed to fetch latest ledger from Stellar network",
      details: "Network timeout",
    });
  });

  it("returns 503 when no ledgers are available", async () => {
    mockCall.mockResolvedValueOnce({ records: [] });

    const app = createApp();
    const res = await request(app).get("/stellar/ledger/latest");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "No ledger data available" });
  });
});
