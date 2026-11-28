import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import * as StellarSdk from "@stellar/stellar-sdk";

const mockRevokedJtis = new Set<string>();

jest.mock("../services/auth.service", () => ({
  AuthService: {
    validateToken: jest.fn(async (token: string) => {
      const jwt = require("jsonwebtoken");
      const decoded = jwt.decode(token);
      if (!decoded) {
        throw new (require("../errors/errorCodes").AppError)("AUTH_ERROR", "Invalid token", 401);
      }
      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp && now >= decoded.exp) {
        throw new (require("../errors/errorCodes").AppError)("AUTH_ERROR", "Token expired", 401);
      }
      if (decoded.jti && mockRevokedJtis.has(decoded.jti)) {
        throw new (require("../errors/errorCodes").AppError)("AUTH_ERROR", "Unauthorized: session has been revoked", 401);
      }
      return decoded;
    }),
    isTokenRevoked: jest.fn(async (jti: string) => mockRevokedJtis.has(jti)),
    revokeToken: jest.fn(async (jti: string) => {
      mockRevokedJtis.add(jti);
    }),
  },
}));

import { createAdminAuthRouter } from "../routes/admin.auth.routes";
import { errorHandler } from "../middleware/errorHandler";

const app = express();
app.use(express.json());
app.use("/", createAdminAuthRouter());
app.use(errorHandler);

describe("Admin Session Revocation Route & Health Guard (Issues #45, #49)", () => {
  const adminAddress = StellarSdk.Keypair.random().publicKey();

  function signToken(walletAddress: string, jti: string, expiresAtSeconds?: number): string {
    const secret = process.env.JWT_SECRET || "test-secret-at-least-32-characters-long";
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
      {
        walletAddress,
        jti,
        iss: process.env.JWT_ISSUER ?? "amana",
        aud: process.env.JWT_AUDIENCE ?? "amana-api",
        nbf: now - 1,
        iat: now - 1,
        exp: expiresAtSeconds ?? now + 3600,
      },
      secret,
      { algorithm: "HS256" }
    );
  }

  beforeAll(() => {
    process.env.ADMIN_STELLAR_PUBKEYS = adminAddress;
  });

  beforeEach(() => {
    mockRevokedJtis.clear();
  });

  describe("POST /api/admin/sessions/revoke (Issue #49)", () => {
    it("revokes an active admin session and returns 200", async () => {
      const adminToken = signToken(adminAddress, "admin-jti-789");

      const res = await request(app)
        .post("/api/admin/sessions/revoke")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ jti: "target-session-jti-456" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("message", "Session revoked successfully");
      expect(res.body).toHaveProperty("jti", "target-session-jti-456");
      expect(res.body).toHaveProperty("revokedAt");
      expect(mockRevokedJtis.has("target-session-jti-456")).toBe(true);
    });

    it("defaults to revoking caller's JTI if body jti is omitted", async () => {
      const adminToken = signToken(adminAddress, "self-revoke-jti-111");

      const res = await request(app)
        .post("/api/admin/sessions/revoke")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("jti", "self-revoke-jti-111");
      expect(mockRevokedJtis.has("self-revoke-jti-111")).toBe(true);
    });
  });

  describe("adminAuth health guard revocation check (Issue #45)", () => {
    it("rejects request with 401 when admin token JTI is revoked", async () => {
      const revokedAdminToken = signToken(adminAddress, "revoked-jti-123");
      mockRevokedJtis.add("revoked-jti-123");

      const res = await request(app)
        .get("/api/admin/auth/claims")
        .set("Authorization", `Bearer ${revokedAdminToken}`);

      expect(res.status).toBe(401);
    });

    it("rejects request with 401 when admin token is expired", async () => {
      const pastTimeInSeconds = Math.floor(Date.now() / 1000) - 600;
      const expiredAdminToken = signToken(adminAddress, "expired-jti-999", pastTimeInSeconds);

      const res = await request(app)
        .get("/api/admin/auth/claims")
        .set("Authorization", `Bearer ${expiredAdminToken}`);

      expect(res.status).toBe(401);
    });
  });
});
