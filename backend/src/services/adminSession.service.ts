/**
 * Redis-backed registry of device-bound admin sessions (issue #198).
 *
 * One record per admin token JTI, plus a per-wallet index so an operator can
 * list their active devices and revoke exactly one of them. Records expire
 * with the token (plus a small grace) so the registry self-cleans.
 *
 * Layout:
 *   admin_session:<jti>      -> JSON AdminSessionRecord (EX = token remaining life + grace)
 *   admin_sessions:<wallet>  -> SET of jti (EX = max session TTL)
 */

import { redis } from "../lib/redis";
import { appLogger } from "../middleware/logger";

const RECORD_PREFIX = "admin_session:";
const INDEX_PREFIX = "admin_sessions:";
const GRACE_SECONDS = 60;
const INDEX_TTL_SECONDS = 24 * 60 * 60;

export interface AdminSessionRecord {
  jti: string;
  walletAddress: string;
  deviceHash: string;
  ipClass: string;
  userAgent: string;
  issuedAt: number;
  expiresAt: number;
  lastSeenAt: number;
}

function recordKey(jti: string): string {
  return `${RECORD_PREFIX}${jti}`;
}

function indexKey(walletAddress: string): string {
  return `${INDEX_PREFIX}${walletAddress.toLowerCase()}`;
}

export class AdminSessionService {
  /** Register a freshly issued device-bound admin token. */
  static async register(record: AdminSessionRecord): Promise<void> {
    const ttl = Math.max(1, record.expiresAt - Math.floor(Date.now() / 1000) + GRACE_SECONDS);
    const key = recordKey(record.jti);
    const idx = indexKey(record.walletAddress);
    try {
      await redis.set(key, JSON.stringify(record), "EX", ttl);
      await redis.sadd(idx, record.jti);
      await redis.expire(idx, INDEX_TTL_SECONDS);
    } catch (err) {
      appLogger.error({ err, jti: record.jti }, "Failed to register admin session");
      throw err;
    }
  }

  /** Fetch a session record. Returns null when missing or expired. */
  static async get(jti: string): Promise<AdminSessionRecord | null> {
    const raw = await redis.get(recordKey(jti));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AdminSessionRecord;
    } catch {
      return null;
    }
  }

  /** Best-effort update of `lastSeenAt` without extending the TTL. */
  static async touch(jti: string): Promise<void> {
    try {
      const key = recordKey(jti);
      const ttl = await redis.ttl(key);
      if (ttl <= 0) return;
      const raw = await redis.get(key);
      if (!raw) return;
      const record = JSON.parse(raw) as AdminSessionRecord;
      record.lastSeenAt = Math.floor(Date.now() / 1000);
      await redis.set(key, JSON.stringify(record), "EX", ttl);
    } catch (err) {
      appLogger.debug({ err, jti }, "admin session touch failed (non-fatal)");
    }
  }

  /** List a wallet's live sessions, pruning any stale index entries. */
  static async listForWallet(walletAddress: string): Promise<AdminSessionRecord[]> {
    const idx = indexKey(walletAddress);
    const jtis = await redis.smembers(idx);
    if (jtis.length === 0) return [];

    const records: AdminSessionRecord[] = [];
    const dead: string[] = [];
    for (const jti of jtis) {
      const record = await AdminSessionService.get(jti);
      if (record) records.push(record);
      else dead.push(jti);
    }
    if (dead.length > 0) {
      await redis.srem(idx, ...dead);
    }
    return records.sort((a, b) => b.issuedAt - a.issuedAt);
  }

  /** Revoke exactly one session by JTI. Returns the removed record, or null. */
  static async revoke(jti: string): Promise<AdminSessionRecord | null> {
    const record = await AdminSessionService.get(jti);
    await redis.del(recordKey(jti));
    if (record) {
      await redis.srem(indexKey(record.walletAddress), jti);
    }
    return record;
  }

  /**
   * Revoke every session for `walletAddress` that matches `deviceHash`
   * (normally exactly one). Returns the removed records.
   */
  static async revokeDevice(
    walletAddress: string,
    deviceHash: string,
  ): Promise<AdminSessionRecord[]> {
    const sessions = await AdminSessionService.listForWallet(walletAddress);
    const matches = sessions.filter((s) => s.deviceHash === deviceHash);
    for (const s of matches) {
      await redis.del(recordKey(s.jti));
      await redis.srem(indexKey(walletAddress), s.jti);
    }
    return matches;
  }
}

export const adminSessionService = AdminSessionService;
