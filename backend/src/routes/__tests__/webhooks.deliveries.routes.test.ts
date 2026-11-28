import express from "express";
import request from "supertest";

const db = {
  user: { findUnique: jest.fn() },
  webhookSubscription: { create: jest.fn(), findUnique: jest.fn() },
  webhookDelivery: { findMany: jest.fn() },
};

jest.mock("../../lib/db", () => ({ prisma: db }));
jest.mock("../../middleware/logger", () => ({ appLogger: { error: jest.fn() } }));
jest.mock("../../middleware/auth.middleware", () => ({
  authMiddleware: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { walletAddress: "gowner" };
    next();
  },
}));

import { webhooksRoutes } from "../webhooks.routes";

const app = express().use(express.json()).use("/webhooks", webhooksRoutes);

describe("webhooks routes (#934)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.user.findUnique.mockResolvedValue({ id: 1 });
  });

  it("POST /webhooks stores the raw signing secret with the event filter", async () => {
    db.webhookSubscription.create.mockImplementation(async ({ data }) => ({
      id: 3, isActive: true, createdAt: new Date(), ...data,
    }));
    const secret = "x".repeat(32);

    const res = await request(app)
      .post("/webhooks")
      .send({ url: "https://coop.example/hook", events: ["trade.funded", "trade.settled"], secret });

    expect(res.status).toBe(201);
    expect(res.body.secret).toBe(secret);
    expect(db.webhookSubscription.create).toHaveBeenCalledWith({
      data: { url: "https://coop.example/hook", events: ["trade.funded", "trade.settled"], secret, userId: 1 },
    });
  });

  it("POST /webhooks rejects unknown event types and short secrets", async () => {
    const bad = await request(app).post("/webhooks").send({ url: "https://a.example", events: ["trade.nope"] });
    const short = await request(app)
      .post("/webhooks")
      .send({ url: "https://a.example", events: ["trade.funded"], secret: "short" });
    expect(bad.status).toBe(400);
    expect(short.status).toBe(400);
    expect(db.webhookSubscription.create).not.toHaveBeenCalled();
  });

  it("GET /webhooks/:id/deliveries returns recent history for the owner", async () => {
    db.webhookSubscription.findUnique.mockResolvedValue({ userId: 1 });
    db.webhookDelivery.findMany.mockResolvedValue([{ id: 9, event: "trade.funded", success: true }]);

    const res = await request(app).get("/webhooks/3/deliveries");

    expect(res.status).toBe(200);
    expect(res.body.deliveries).toHaveLength(1);
    expect(db.webhookDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { subscriptionId: 3 }, orderBy: { createdAt: "desc" }, take: 50 }),
    );
  });

  it("GET /webhooks/:id/deliveries hides other users' webhooks", async () => {
    db.webhookSubscription.findUnique.mockResolvedValue({ userId: 2 });
    const res = await request(app).get("/webhooks/3/deliveries");
    expect(res.status).toBe(404);
    expect(db.webhookDelivery.findMany).not.toHaveBeenCalled();
  });
});
