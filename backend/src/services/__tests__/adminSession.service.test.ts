import Redis from "ioredis";

jest.mock("ioredis", () => {
  const store = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const m = {
    set: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
      return "OK";
    }),
    get: jest.fn(async (k: string) => (store.has(k) ? store.get(k)! : null)),
    del: jest.fn(async (...ks: string[]) => {
      let n = 0;
      for (const k of ks) if (store.delete(k)) n++;
      return n;
    }),
    ttl: jest.fn(async (k: string) => (store.has(k) ? 600 : -2)),
    sadd: jest.fn(async (k: string, ...members: string[]) => {
      const s = sets.get(k) ?? new Set<string>();
      members.forEach((x) => s.add(x));
      sets.set(k, s);
      return members.length;
    }),
    srem: jest.fn(async (k: string, ...members: string[]) => {
      const s = sets.get(k);
      if (!s) return 0;
      let n = 0;
      members.forEach((x) => {
        if (s.delete(x)) n++;
      });
      return n;
    }),
    smembers: jest.fn(async (k: string) => Array.from(sets.get(k) ?? [])),
    expire: jest.fn(async () => 1),
    on: jest.fn(),
    __store: store,
    __sets: sets,
  };
  const ctor = jest.fn().mockImplementation(() => m);
  (ctor as unknown as { _instance: typeof m })._instance = m;
  return ctor;
});

import { AdminSessionService, type AdminSessionRecord } from "../adminSession.service";

const redisMock = (Redis as unknown as { _instance: Record<string, jest.Mock> })._instance;

function record(over: Partial<AdminSessionRecord> = {}): AdminSessionRecord {
  const now = Math.floor(Date.now() / 1000);
  return {
    jti: "jti-1",
    walletAddress: "GABC",
    deviceHash: "device-a",
    ipClass: "v4/203.0.113.0/24",
    userAgent: "UA",
    issuedAt: now,
    expiresAt: now + 900,
    lastSeenAt: now,
    ...over,
  };
}

beforeEach(() => {
  (redisMock.__store as unknown as Map<string, string>).clear();
  (redisMock.__sets as unknown as Map<string, Set<string>>).clear();
  jest.clearAllMocks();
});

describe("AdminSessionService", () => {
  it("registers a session and reads it back", async () => {
    const r = record();
    await AdminSessionService.register(r);

    expect(redisMock.set).toHaveBeenCalledWith(
      "admin_session:jti-1",
      expect.any(String),
      "EX",
      expect.any(Number),
    );
    expect(redisMock.sadd).toHaveBeenCalledWith("admin_sessions:gabc", "jti-1");

    const got = await AdminSessionService.get("jti-1");
    expect(got).toEqual(r);
  });

  it("returns null for an unknown session", async () => {
    expect(await AdminSessionService.get("nope")).toBeNull();
  });

  it("lists a wallet's sessions newest-first and prunes dead index entries", async () => {
    await AdminSessionService.register(record({ jti: "old", issuedAt: 100, expiresAt: 100 + 900 }));
    await AdminSessionService.register(record({ jti: "new", issuedAt: 200, expiresAt: 200 + 900 }));
    await AdminSessionService.register(record({ jti: "ghost", issuedAt: 150, expiresAt: 150 + 900 }));

    // Simulate the "ghost" record TTL-expiring while its index entry lingers.
    (redisMock.__store as unknown as Map<string, string>).delete("admin_session:ghost");

    const sessions = await AdminSessionService.listForWallet("GABC");
    expect(sessions.map((s) => s.jti)).toEqual(["new", "old"]);
    expect(redisMock.srem).toHaveBeenCalledWith("admin_sessions:gabc", "ghost");
  });

  it("revokes exactly one session by jti", async () => {
    await AdminSessionService.register(record({ jti: "a" }));
    await AdminSessionService.register(record({ jti: "b" }));

    const removed = await AdminSessionService.revoke("a");
    expect(removed?.jti).toBe("a");
    expect(await AdminSessionService.get("a")).toBeNull();
    expect(await AdminSessionService.get("b")).not.toBeNull();
  });

  it("revokes every session for a given device fingerprint", async () => {
    await AdminSessionService.register(record({ jti: "phone", deviceHash: "device-a" }));
    await AdminSessionService.register(record({ jti: "laptop", deviceHash: "device-b" }));

    const removed = await AdminSessionService.revokeDevice("GABC", "device-a");
    expect(removed.map((s) => s.jti)).toEqual(["phone"]);
    expect(await AdminSessionService.get("phone")).toBeNull();
    expect(await AdminSessionService.get("laptop")).not.toBeNull();
  });

  it("touch refreshes lastSeenAt without throwing", async () => {
    const past = Math.floor(Date.now() / 1000) - 500;
    await AdminSessionService.register(record({ jti: "t", lastSeenAt: past }));
    await AdminSessionService.touch("t");
    const got = await AdminSessionService.get("t");
    expect(got!.lastSeenAt).toBeGreaterThanOrEqual(past);
  });
});
