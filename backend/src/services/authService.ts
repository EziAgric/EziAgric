/**
 * Auth Service — JWT access tokens + rotating refresh tokens.
 *
 * Every refresh token is single-use. Using it marks it as used and issues a new
 * one. Presenting an already-used token means it was stolen (or replayed), so
 * all of that user's refresh tokens are revoked and a security audit event is logged.
 */

import crypto from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/db";
import { appLogger } from "../middleware/logger";

const ACCESS_TTL = "15m";
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class AuthError extends Error {}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const secret = (name: "JWT_SECRET" | "JWT_REFRESH_SECRET"): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

const hash = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

/** Issue a new access + refresh token pair and persist the refresh token hash. */
export async function issueTokens(userId: number): Promise<TokenPair> {
  const jti = crypto.randomUUID();
  const accessToken = jwt.sign({ sub: String(userId) }, secret("JWT_SECRET"), {
    expiresIn: ACCESS_TTL,
  });
  const refreshToken = jwt.sign({ sub: String(userId), jti }, secret("JWT_REFRESH_SECRET"), {
    expiresIn: Math.floor(REFRESH_TTL_MS / 1000),
  });
  await prisma.refreshToken.create({
    data: {
      tokenHash: hash(refreshToken),
      jti,
      userId,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  return { accessToken, refreshToken };
}

/** Revoke every refresh token belonging to the user. */
export async function revokeAllUserTokens(userId: number): Promise<number> {
  const { count } = await prisma.refreshToken.deleteMany({ where: { userId } });
  return count;
}

/** Exchange a refresh token for a new pair; the presented token is invalidated. */
export async function rotateRefreshToken(refreshToken: string): Promise<TokenPair> {
  try {
    jwt.verify(refreshToken, secret("JWT_REFRESH_SECRET"));
  } catch {
    throw new AuthError("Invalid refresh token");
  }

  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hash(refreshToken) },
  });
  if (!record || record.expiresAt <= new Date()) {
    throw new AuthError("Invalid refresh token");
  }

  // Atomic claim: of N concurrent requests with the same token only one gets count === 1.
  const claimed = await prisma.refreshToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  if (claimed.count === 0) {
    const revoked = await revokeAllUserTokens(record.userId);
    appLogger.warn(
      {
        event: "security.refresh_token_family_revoked",
        userId: record.userId,
        jti: record.jti,
        tokensRevoked: revoked,
        reason: "refresh_token_reuse",
      },
      "Refresh token reuse detected; all user refresh tokens revoked",
    );
    throw new AuthError("Invalid refresh token");
  }

  return issueTokens(record.userId);
}
