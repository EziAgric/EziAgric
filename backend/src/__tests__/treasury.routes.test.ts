import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import * as StellarSdk from "@stellar/stellar-sdk";
import { AuthService } from "../services/auth.service";
import { errorHandler } from "../middleware/errorHandler";

jest.mock("../services/auth.service", () => ({
  AuthService: {
    validateToken: jest.fn(async (token: string) => {
      const jwt = require("jsonwebtoken");
      return jwt.decode(token);
    }),
    isTokenRevoked: jest.fn().mockResolvedValue(false),
  },
}));

const mockTreasuryService = {
  withdraw: jest.fn().mockResolvedValue({ unsignedXdr: "test-xdr" }),
  getBalance: jest.fn().mockResolvedValue({ balance: "1000", asset: "USDC", contractId: "test" }),
  getConfig: jest.fn().mockReturnValue({ contractId: "test", network: "public", asset: "USDC" }),
};

jest.mock("../services/treasury.service", () => ({
  TreasuryService: jest.fn(() => mockTreasuryService),
  treasuryService: mockTreasuryService,
}));

const { createTreasuryRouter } = require("../routes/treasury.routes");

const app = express();
app.use(express.json());
app.use("/treasury", createTreasuryRouter());
app.use(errorHandler);

describe("Treasury Routes - POST /treasury/withdraw", () => {
  const adminAddress = StellarSdk.Keypair.random().publicKey();
  const nonAdminAddress = StellarSdk.Keypair.random().publicKey();
  const destinationAddress = StellarSdk.Keypair.random().publicKey();
  let adminToken: string;
  let nonAdminToken: string;

  function signToken(walletAddress: string, jti: string): string {
    const secret = process.env.JWT_SECRET || "test-secret-at-least-32-characters-long";
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
      {
        walletAddress,
        jti,
        iss: process.env.JWT_ISSUER,
        aud: process.env.JWT_AUDIENCE,
        nbf: now - 1,
      },
      secret,
      { algorithm: "HS256" },
    );
  }

  beforeAll(() => {
    process.env.ADMIN_STELLAR_PUBKEYS = adminAddress;
    adminToken = signToken(adminAddress, "withdraw-admin-jti");
    nonAdminToken = signToken(nonAdminAddress, "withdraw-nonadmin-jti");
  });

  beforeEach(() => {
    jest.spyOn(AuthService, "isTokenRevoked").mockResolvedValue(false);
    jest.clearAllMocks();
    mockTreasuryService.withdraw.mockResolvedValue({ unsignedXdr: "test-xdr" });
  });

  describe("authorization", () => {
    it("returns 401 without auth", async () => {
      const res = await request(app)
        .post("/treasury/withdraw")
        .send({ destination: destinationAddress, amount: "100" });

      expect(res.status).toBe(401);
    });

    it("returns 403 for non-admin users", async () => {
      const res = await request(app)
        .post("/treasury/withdraw")
        .set("Authorization", `Bearer ${nonAdminToken}`)
        .send({ destination: destinationAddress, amount: "100" });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/admin access required/i);
    });
  });

  describe("request validation", () => {
    it("returns 400 when amount is missing", async () => {
      const res = await request(app)
        .post("/treasury/withdraw")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ destination: destinationAddress });

      expect(res.status).toBe(400);
    });

    it("returns 400 when amount is negative", async () => {
      const res = await request(app)
        .post("/treasury/withdraw")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ destination: destinationAddress, amount: "-100" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("returns 400 when amount is zero", async () => {
      const res = await request(app)
        .post("/treasury/withdraw")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ destination: destinationAddress, amount: "0" });

      expect(res.status).toBe(400);
    });

    it("returns 400 when amount is non-numeric", async () => {
      const res = await request(app)
        .post("/treasury/withdraw")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ destination: destinationAddress, amount: "not-a-number" });

      expect(res.status).toBe(400);
    });

    // Issue #178: the cap used to be the float-safe range (~9.2e11), enforced
    // with `parseFloat` — itself lossy. The real bound is what the contract's
    // i128 argument can carry, so amounts between the two are now accepted.
    it("accepts an amount beyond the old float-safe cap", async () => {
      mockTreasuryService.withdraw.mockResolvedValue({ unsignedXdr: "test-xdr" });

      const res = await request(app)
        .post("/treasury/withdraw")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ destination: destinationAddress, amount: "999999999999999999.999" });

      expect(res.status).toBe(200);
      expect(mockTreasuryService.withdraw).toHaveBeenCalledWith(
        destinationAddress,
        "999999999999999999.9990000",
        adminAddress,
        undefined,
      );
    });

    it("returns 400 when amount exceeds the i128 range", async () => {
      const res = await request(app)
        .post("/treasury/withdraw")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          destination: destinationAddress,
          amount: "170141183460469231731687303715884105728",
        });

      expect(res.status).toBe(400);
    });

    it("returns 400 when amount has more than 7 decimal places", async () => {
      const res = await request(app)
        .post("/treasury/withdraw")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ destination: destinationAddress, amount: "100.12345678" });

      expect(res.status).toBe(400);
    });

    it("returns 400 when destination is invalid Stellar address", async () => {
      const res = await request(app)
        .post("/treasury/withdraw")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ destination: "not-a-stellar-address", amount: "100" });

      expect(res.status).toBe(400);
    });

    it("returns 400 when destination is missing", async () => {
      const res = await request(app)
        .post("/treasury/withdraw")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ amount: "100" });

      expect(res.status).toBe(400);
    });

    it("returns 400 when note exceeds 2000 characters", async () => {
      const res = await request(app)
        .post("/treasury/withdraw")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          destination: destinationAddress,
          amount: "100",
          note: "a".repeat(2001),
        });

      expect(res.status).toBe(400);
    });
  });

  describe("happy path", () => {
    it("processes a valid withdrawal request with string amount", async () => {
      mockTreasuryService.withdraw.mockResolvedValue({ unsignedXdr: "test-xdr" });

      const res = await request(app)
        .post("/treasury/withdraw")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ destination: destinationAddress, amount: "100.5" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ unsignedXdr: "test-xdr" });
      expect(mockTreasuryService.withdraw).toHaveBeenCalledWith(
        destinationAddress,
        "100.5000000",
        adminAddress,
        undefined,
      );
    });

    // Issue #178: money is a decimal string end to end. A JSON number cannot
    // hold a large stroop amount exactly, so it is rejected rather than coerced.
    it("rejects a withdrawal whose amount is a JSON number", async () => {
      mockTreasuryService.withdraw.mockResolvedValue({ unsignedXdr: "test-xdr" });

      const res = await request(app)
        .post("/treasury/withdraw")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ destination: destinationAddress, amount: 100.5 });

      expect(res.status).toBe(400);
      expect(mockTreasuryService.withdraw).not.toHaveBeenCalled();
    });

    it("carries an amount above 2^53 stroops through without rounding", async () => {
      mockTreasuryService.withdraw.mockResolvedValue({ unsignedXdr: "test-xdr" });

      const res = await request(app)
        .post("/treasury/withdraw")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ destination: destinationAddress, amount: "9007199254740993.9999999" });

      expect(res.status).toBe(200);
      expect(mockTreasuryService.withdraw).toHaveBeenCalledWith(
        destinationAddress,
        "9007199254740993.9999999",
        adminAddress,
        undefined,
      );
    });

    it("processes a withdrawal with a note", async () => {
      mockTreasuryService.withdraw.mockResolvedValue({ unsignedXdr: "test-xdr" });

      const res = await request(app)
        .post("/treasury/withdraw")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          destination: destinationAddress,
          amount: "100",
          note: "  Reclaiming expired escrow  ",
        });

      expect(res.status).toBe(200);
      expect(mockTreasuryService.withdraw).toHaveBeenCalledWith(
        destinationAddress,
        "100.0000000",
        adminAddress,
        "Reclaiming expired escrow",
      );
    });

    it("accepts maximum valid amount (922337203685.4775807)", async () => {
      mockTreasuryService.withdraw.mockResolvedValue({ unsignedXdr: "test-xdr" });

      const res = await request(app)
        .post("/treasury/withdraw")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          destination: destinationAddress,
          amount: "922337203685.4775807",
        });

      expect(res.status).toBe(200);
    });
  });
});
