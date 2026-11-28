import crypto from "crypto";

const mockFindMany = jest.fn();
const mockDeliveryCreate = jest.fn();

jest.mock("../../lib/db", () => ({
  prisma: {
    webhookSubscription: { findMany: (...a: unknown[]) => mockFindMany(...a) },
    webhookDelivery: { create: (...a: unknown[]) => mockDeliveryCreate(...a) },
  },
}));
jest.mock("../../config/env", () => ({
  env: { WEBHOOK_MAX_ATTEMPTS: 4, WEBHOOK_RETRY_BASE_MS: 1000, WEBHOOK_RETRY_MAX_MS: 30000 },
}));
jest.mock("../../middleware/logger", () => ({
  appLogger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { TradeStatus } from "@prisma/client";
import { WebhookService } from "../webhook.service";

const SECRET = "s".repeat(32);

function makeService() {
  const service = new WebhookService();
  const sleeps: number[] = [];
  jest.spyOn(service as unknown as { sleep: (ms: number) => Promise<void> }, "sleep")
    .mockImplementation(async (ms: number) => { sleeps.push(ms); });
  return { service, sleeps };
}

describe("WebhookService delivery", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    mockFindMany.mockResolvedValue([{ id: 7, url: "https://coop.example/hook", secret: SECRET }]);
    mockDeliveryCreate.mockResolvedValue({});
  });

  it.each([
    [TradeStatus.FUNDED, "trade.funded"],
    [TradeStatus.COMPLETED, "trade.settled"],
    [TradeStatus.DISPUTED, "trade.disputed"],
  ])("routes %s to subscribers of %s", async (status, event) => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const { service } = makeService();

    await service.dispatch("trade-1", status);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true, events: { has: event } } }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).event).toBe(event);
  });

  it("signs the body with HMAC-SHA256 of the registration secret", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const { service } = makeService();

    await service.dispatch("trade-1", TradeStatus.FUNDED);

    const { headers, body } = fetchMock.mock.calls[0][1];
    const expected = crypto
      .createHmac("sha256", SECRET)
      .update(`${headers["X-Webhook-Timestamp"]}.${body}`)
      .digest("hex");
    expect(headers["X-Webhook-Signature"]).toBe(expected);
  });

  it("retries non-2xx up to 3 times with exponential backoff and logs each attempt", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400 });
    const { service, sleeps } = makeService();

    await service.dispatch("trade-1", TradeStatus.FUNDED);

    expect(fetchMock).toHaveBeenCalledTimes(4); // 1 attempt + 3 retries
    expect(sleeps).toEqual([1000, 2000, 4000]);
    expect(mockDeliveryCreate).toHaveBeenCalledTimes(4);
    expect(mockDeliveryCreate).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ subscriptionId: 7, attempt: 4, statusCode: 400, success: false }),
    });
  });

  it("stops retrying once a 2xx arrives and records network errors", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce({ ok: true, status: 204 });
    const { service, sleeps } = makeService();

    await service.dispatch("trade-1", TradeStatus.DISPUTED);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([1000]);
    expect(mockDeliveryCreate.mock.calls.map(([a]) => a.data)).toEqual([
      expect.objectContaining({ attempt: 1, statusCode: null, success: false, error: "ECONNRESET" }),
      expect.objectContaining({ attempt: 2, statusCode: 204, success: true }),
    ]);
  });

  it("does not fail delivery when the history write fails", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    mockDeliveryCreate.mockRejectedValue(new Error("db down"));
    const { service } = makeService();

    await expect(service.dispatch("trade-1", TradeStatus.FUNDED)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
