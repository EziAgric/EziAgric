import express, { Response } from "express";
import request from "supertest";
import {
  createAdminQuotaMiddleware,
  resetAdminQuotas,
} from "../middleware/adminQuota.middleware";
import { AuthRequest } from "../services/auth.service";
import { ErrorCode } from "../errors/errorCodes";

function buildApp(max: number, windowMs: number) {
  const app = express();
  app.use((req, _res, next) => {
    (req as AuthRequest).user = { walletAddress: "GADMIN123" } as AuthRequest["user"];
    next();
  });
  app.post(
    "/op",
    createAdminQuotaMiddleware("test.op", { windowMs, max, message: "Quota exceeded, try again later." }),
    (_req, res: Response) => {
      res.status(200).json({ ok: true });
    },
  );
  return app;
}

describe("adminQuota middleware", () => {
  beforeEach(() => {
    resetAdminQuotas();
    jest.useRealTimers();
  });

  it("allows requests up to the configured max", async () => {
    const app = buildApp(3, 60_000);
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post("/op");
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 with a clear message once the quota is exceeded", async () => {
    const app = buildApp(2, 60_000);
    await request(app).post("/op");
    await request(app).post("/op");

    const res = await request(app).post("/op");

    expect(res.status).toBe(429);
    expect(res.body.code).toBe(ErrorCode.ADMIN_QUOTA_EXCEEDED);
    expect(res.body.message).toMatch(/quota exceeded/i);
    expect(res.body.details).toMatchObject({ operation: "test.op", limit: 2 });
    expect(res.headers["retry-after"]).toBeDefined();
  });

  it("tracks quota separately per admin identity", async () => {
    const app = express();
    app.use((req, _res, next) => {
      const wallet = req.headers["x-wallet"] as string;
      (req as AuthRequest).user = { walletAddress: wallet } as AuthRequest["user"];
      next();
    });
    app.post(
      "/op",
      createAdminQuotaMiddleware("test.op", { windowMs: 60_000, max: 1, message: "Quota exceeded" }),
      (_req, res: Response) => res.status(200).json({ ok: true }),
    );

    const first = await request(app).post("/op").set("x-wallet", "GADMIN_A");
    const second = await request(app).post("/op").set("x-wallet", "GADMIN_A");
    const third = await request(app).post("/op").set("x-wallet", "GADMIN_B");

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(third.status).toBe(200);
  });

  it("keys by x-api-key header when present instead of wallet address", async () => {
    const app = express();
    app.use((req, _res, next) => {
      (req as AuthRequest).user = { walletAddress: "GSHARED" } as AuthRequest["user"];
      next();
    });
    app.post(
      "/op",
      createAdminQuotaMiddleware("test.op", { windowMs: 60_000, max: 1, message: "Quota exceeded" }),
      (_req, res: Response) => res.status(200).json({ ok: true }),
    );

    const first = await request(app).post("/op").set("x-api-key", "key-1");
    const second = await request(app).post("/op").set("x-api-key", "key-1");
    const third = await request(app).post("/op").set("x-api-key", "key-2");

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(third.status).toBe(200);
  });

  it("resets the quota once the window elapses", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick"] });
    const app = buildApp(1, 1_000);

    const withinWindow = await request(app).post("/op");
    expect(withinWindow.status).toBe(200);

    const stillBlocked = await request(app).post("/op");
    expect(stillBlocked.status).toBe(429);

    jest.advanceTimersByTime(1_001);

    const afterReset = await request(app).post("/op");
    expect(afterReset.status).toBe(200);

    jest.useRealTimers();
  });

  it("resetAdminQuotas clears counters for tests/tooling", async () => {
    const app = buildApp(1, 60_000);
    await request(app).post("/op");
    const blocked = await request(app).post("/op");
    expect(blocked.status).toBe(429);

    resetAdminQuotas();

    const afterManualReset = await request(app).post("/op");
    expect(afterManualReset.status).toBe(200);
  });
});
