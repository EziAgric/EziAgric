import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { createTrustlineRouter } from "../routes/stellar.trustline.js";

vi.mock("@stellar/stellar-sdk", () => {
  const mockAccount = {
    accountId: () => "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    sequenceNumber: () => "1",
    incrementSequenceNumber: () => {},
  };

  const mockTransactionBuilder = {
    addOperation: vi.fn().mockReturnThis(),
    addMemo: vi.fn().mockReturnThis(),
    setTimeout: vi.fn().mockReturnThis(),
    build: () => ({
      toEnvelope: () => ({
        toXDR: () => ({
          toString: () => "bW9ja2VkLXhlci1kYXRh",
        }),
      }),
    }),
  };

  return {
    Networks: {
      PUBLIC: "Public Global Stellar Network ; September 2015",
      TESTNET: "Test SDF Network ; September 2015",
    },
    BASE_FEE: "100",
    Asset: class MockAsset {
      constructor(public code: string, public issuer: string) {}
    },
    Operation: {
      changeTrust: vi.fn(({ asset, limit }) => ({
        type: "changeTrust",
        asset,
        limit,
      })),
    },
    TransactionBuilder: vi.fn(() => mockTransactionBuilder),
    Horizon: {
      Server: vi.fn(() => ({
        loadAccount: vi.fn().mockResolvedValue(mockAccount),
      })),
    },
  };
});

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/stellar", createTrustlineRouter());
  return app;
}

describe("POST /stellar/trustline", () => {
  const VALID_KEY = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const VALID_KEY2 = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

  const validBody = {
    sourceAccount: VALID_KEY,
    asset: { code: "USDC", issuer: VALID_KEY2 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns unsigned envelope for valid add trustline request", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/stellar/trustline")
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("envelopeXDR");
    expect(res.body).toHaveProperty("networkPassphrase");
    expect(typeof res.body.envelopeXDR).toBe("string");
    expect(res.body.envelopeXDR.length).toBeGreaterThan(0);
  });

  it("returns unsigned envelope when limit is provided", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/stellar/trustline")
      .send({ ...validBody, limit: "5000" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("envelopeXDR");
  });

  it("returns 400 for invalid sourceAccount", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/stellar/trustline")
      .send({ ...validBody, sourceAccount: "invalid" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error", "Validation failed");
    expect(res.body).toHaveProperty("details");
  });

  it("returns 400 for invalid asset code", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/stellar/trustline")
      .send({ ...validBody, asset: { code: "", issuer: VALID_KEY2 } });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error", "Validation failed");
  });

  it("returns 400 for invalid asset issuer", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/stellar/trustline")
      .send({ ...validBody, asset: { code: "USDC", issuer: "bad-key" } });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error", "Validation failed");
  });

  it("returns 400 for missing required fields", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/stellar/trustline")
      .send({ sourceAccount: VALID_KEY });

    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid limit format", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/stellar/trustline")
      .send({ ...validBody, limit: "abc" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error", "Validation failed");
  });
});

describe("DELETE /stellar/trustline", () => {
  const VALID_KEY = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const VALID_KEY2 = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

  const validBody = {
    sourceAccount: VALID_KEY,
    asset: { code: "USDC", issuer: VALID_KEY2 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns unsigned envelope for remove trustline request", async () => {
    const app = createApp();
    const res = await request(app)
      .delete("/stellar/trustline")
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("envelopeXDR");
    expect(typeof res.body.envelopeXDR).toBe("string");
    expect(res.body.envelopeXDR.length).toBeGreaterThan(0);
  });

  it("returns 400 for invalid sourceAccount", async () => {
    const app = createApp();
    const res = await request(app)
      .delete("/stellar/trustline")
      .send({ ...validBody, sourceAccount: "invalid" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error", "Validation failed");
  });

  it("returns 400 for invalid asset", async () => {
    const app = createApp();
    const res = await request(app)
      .delete("/stellar/trustline")
      .send({ ...validBody, asset: { code: "", issuer: "bad" } });

    expect(res.status).toBe(400);
  });
});
