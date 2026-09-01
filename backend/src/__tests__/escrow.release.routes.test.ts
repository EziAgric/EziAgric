import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import * as StellarSdk from "@stellar/stellar-sdk";
import { createEscrowReleaseRouter } from "../routes/escrow.release.routes";
import { AuthService } from "../services/auth.service";
import { errorHandler } from "../middleware/errorHandler";
import { DuplicatePayoutError } from "../services/payoutIntent.service";

jest.mock("../services/auth.service", () => ({
  AuthService: {
    validateToken: jest.fn(async (token: string) => {
      const jwt = require("jsonwebtoken");
      return jwt.decode(token);
    }),
    isTokenRevoked: jest.fn().mockResolvedValue(false),
  },
}));

describe("Escrow milestone release route", () => {
  const buyerAddress = StellarSdk.Keypair.random().publicKey();
  const sellerAddress = StellarSdk.Keypair.random().publicKey();
  let token: string;

  const mockPrisma = {
    trade: { findFirst: jest.fn() },
    escrowReleaseMilestone: { findMany: jest.fn() },
  } as any;
  const contractService = {
    buildReleaseMilestoneTx: jest.fn(),
  };
  // Issue #179: the route claims a payout intent before building anything, so
  // the release path needs one injected rather than the live service.
  const payoutIntents = {
    claim: jest.fn(),
  };

  const app = express();
  app.use(express.json());
  app.use(
    "/trades",
    createEscrowReleaseRouter(mockPrisma, contractService as any, payoutIntents as any),
  );
  app.use(errorHandler);

  beforeAll(() => {
    const now = Math.floor(Date.now() / 1000);
    token = jwt.sign(
      {
        walletAddress: buyerAddress,
        jti: "escrow-release-jti",
        iss: process.env.JWT_ISSUER,
        aud: process.env.JWT_AUDIENCE,
        nbf: now - 1,
      },
      process.env.JWT_SECRET!,
      { algorithm: "HS256" },
    );
  });

  beforeEach(() => {
    jest.spyOn(AuthService, "isTokenRevoked").mockResolvedValue(false);
    jest.clearAllMocks();
    mockPrisma.trade.findFirst.mockResolvedValue({
      tradeId: "4294967297",
      buyerAddress,
      sellerAddress,
      status: "FUNDED",
    });
    payoutIntents.claim.mockResolvedValue({
      intent: { idempotencyKey: "intent-key-1", status: "PENDING", txHash: null },
      duplicate: false,
    });
  });

  it("returns unsigned XDR for a due milestone", async () => {
    mockPrisma.escrowReleaseMilestone.findMany.mockResolvedValue([
      {
        milestoneIndex: 0,
        amountUsdc: "100.0000000",
        dueAt: new Date(Date.now() - 60_000),
        releasedAt: null,
      },
    ]);
    contractService.buildReleaseMilestoneTx.mockResolvedValue({ unsignedXdr: "AAAA-partial-xdr" });

    const res = await request(app)
      .post("/trades/4294967297/release/milestone")
      .set("Authorization", `Bearer ${token}`)
      .send({ milestoneIndex: 0 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      unsignedXdr: "AAAA-partial-xdr",
      idempotencyKey: "intent-key-1",
    });
    expect(contractService.buildReleaseMilestoneTx).toHaveBeenCalledWith({
      tradeId: "4294967297",
      sourceAddress: buyerAddress,
      milestoneIndex: 0,
    });
  });

  it("rejects an early milestone with a clear error", async () => {
    mockPrisma.escrowReleaseMilestone.findMany.mockResolvedValue([
      {
        milestoneIndex: 0,
        amountUsdc: "100.0000000",
        dueAt: new Date(Date.now() + 60_000),
        releasedAt: null,
      },
    ]);

    const res = await request(app)
      .post("/trades/4294967297/release/milestone")
      .set("Authorization", `Bearer ${token}`)
      .send({ milestoneIndex: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Milestone is not due yet");
    expect(contractService.buildReleaseMilestoneTx).not.toHaveBeenCalled();
  });

  it("does not build a second transaction when an intent is already in flight", async () => {
    mockPrisma.escrowReleaseMilestone.findMany.mockResolvedValue([
      {
        milestoneIndex: 0,
        amountUsdc: "100.0000000",
        dueAt: new Date(Date.now() - 60_000),
        releasedAt: null,
      },
    ]);
    payoutIntents.claim.mockResolvedValue({
      intent: { idempotencyKey: "intent-key-1", status: "SUBMITTED", txHash: "tx-1" },
      duplicate: true,
    });

    const res = await request(app)
      .post("/trades/4294967297/release/milestone")
      .set("Authorization", `Bearer ${token}`)
      .send({ milestoneIndex: 0 });

    expect(res.status).toBe(409);
    expect(res.body.txHash).toBe("tx-1");
    expect(contractService.buildReleaseMilestoneTx).not.toHaveBeenCalled();
  });

  it("refuses a retry for a milestone that already settled on-chain", async () => {
    mockPrisma.escrowReleaseMilestone.findMany.mockResolvedValue([
      {
        milestoneIndex: 0,
        amountUsdc: "100.0000000",
        dueAt: new Date(Date.now() - 60_000),
        releasedAt: null,
      },
    ]);
    payoutIntents.claim.mockRejectedValue(
      new DuplicatePayoutError({
        idempotencyKey: "intent-key-1",
        txHash: "tx-1",
      } as never),
    );

    const res = await request(app)
      .post("/trades/4294967297/release/milestone")
      .set("Authorization", `Bearer ${token}`)
      .send({ milestoneIndex: 0 });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("This milestone has already been released");
    expect(contractService.buildReleaseMilestoneTx).not.toHaveBeenCalled();
  });

  it("passes a caller-supplied Idempotency-Key through to the claim", async () => {
    mockPrisma.escrowReleaseMilestone.findMany.mockResolvedValue([
      {
        milestoneIndex: 0,
        amountUsdc: "100.0000000",
        dueAt: new Date(Date.now() - 60_000),
        releasedAt: null,
      },
    ]);
    contractService.buildReleaseMilestoneTx.mockResolvedValue({ unsignedXdr: "x" });

    await request(app)
      .post("/trades/4294967297/release/milestone")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "client-supplied-key")
      .send({ milestoneIndex: 0 });

    expect(payoutIntents.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "client-supplied-key",
        kind: "MILESTONE_RELEASE",
        tradeId: "4294967297",
        milestoneIndex: 0,
        amountUsdc: "100.0000000",
        destination: sellerAddress,
      }),
    );
  });

  it("rejects a completed schedule", async () => {
    mockPrisma.escrowReleaseMilestone.findMany.mockResolvedValue([
      {
        milestoneIndex: 0,
        dueAt: new Date(Date.now() - 60_000),
        releasedAt: new Date(),
      },
      {
        milestoneIndex: 1,
        dueAt: new Date(Date.now() - 60_000),
        releasedAt: new Date(),
      },
    ]);

    const res = await request(app)
      .post("/trades/4294967297/release/milestone")
      .set("Authorization", `Bearer ${token}`)
      .send({ milestoneIndex: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Release schedule is already completed");
    expect(contractService.buildReleaseMilestoneTx).not.toHaveBeenCalled();
  });
});
