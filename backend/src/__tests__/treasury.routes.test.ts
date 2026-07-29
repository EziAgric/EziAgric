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
      expect(res.body.error).toMatch(/admin access required/i);
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

    it("returns 400 when amount exceeds safe range", async () => {
      const res = await request(app)
        .post("/treasury/withdraw")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ destination: destinationAddress, amount: "999999999999999999.999" });

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
        "100.5",
        adminAddress,
        undefined,
      );
    });

    it("processes a valid withdrawal request with numeric amount", async () => {
      mockTreasuryService.withdraw.mockResolvedValue({ unsignedXdr: "test-xdr" });

      const res = await request(app)
        .post("/treasury/withdraw")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ destination: destinationAddress, amount: 100.5 });

      expect(res.status).toBe(200);
      expect(mockTreasuryService.withdraw).toHaveBeenCalledWith(
        destinationAddress,
        "100.5",
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
        "100",
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
