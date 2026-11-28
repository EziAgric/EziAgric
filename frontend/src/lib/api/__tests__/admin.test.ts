/**
 * Tests for the guarded admin API helpers (#22).
 */

import { adminApi, adminRequest, AdminApiError } from "../admin";

jest.mock("../env", () => ({
  getApiBaseUrl: () => "https://api.test",
}));

jest.mock("@/lib/analytics", () => ({
  trackApiFailure: jest.fn(),
}));

const TOKEN = "admin-jwt";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status ${status}`,
    json: async () => body,
  } as unknown as Response;
}

const fetchMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
});

/** The URL and init the last fetch was called with. */
function lastCall(): [string, RequestInit] {
  const call = fetchMock.mock.calls.at(-1);
  return [call[0] as string, call[1] as RequestInit];
}

function headersOf(init: RequestInit): Record<string, string> {
  return init.headers as Record<string, string>;
}

describe("admin token guard", () => {
  it.each([
    ["an empty string", ""],
    ["whitespace only", "   "],
  ])("refuses to send a request with %s as the token", async (_label, token) => {
    await expect(adminApi.features.list(token)).rejects.toBeInstanceOf(AdminApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("classifies a missing token as unauthenticated without a round trip", async () => {
    await expect(adminApi.features.list("")).rejects.toMatchObject({
      reason: "unauthenticated",
      status: 401,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("injects the admin token as a bearer header", async () => {
    await adminApi.features.list(TOKEN);

    const [, init] = lastCall();
    expect(headersOf(init).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("does not fall back to the browser-stored session token", async () => {
    await adminApi.audit.list(TOKEN, { page: 2 });

    const [, init] = lastCall();
    expect(headersOf(init).Authorization).toBe(`Bearer ${TOKEN}`);
  });
});

describe("endpoint construction", () => {
  it("posts an add-mediator body", async () => {
    await adminApi.contract.addMediator(TOKEN, { mediatorAddress: "GABC" });

    const [url, init] = lastCall();
    expect(url).toBe("https://api.test/admin/contract/mediators");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ mediatorAddress: "GABC" }));
  });

  it("deletes a mediator by address", async () => {
    await adminApi.contract.removeMediator(TOKEN, "GABC");

    const [url, init] = lastCall();
    expect(url).toBe("https://api.test/admin/contract/mediators/GABC");
    expect(init.method).toBe("DELETE");
  });

  it("url-encodes identifiers placed in the path", async () => {
    await adminApi.features.update(TOKEN, "beta/flag", { enabled: true });

    const [url] = lastCall();
    expect(url).toBe("https://api.test/admin/features/beta%2Fflag");
  });

  it("patches the fee in basis points", async () => {
    await adminApi.contract.updateFeeBps(TOKEN, { feeBps: 250 });

    const [url, init] = lastCall();
    expect(url).toBe("https://api.test/admin/contract/fee");
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ feeBps: 250 }));
  });

  it("builds an audit query string from pagination params", async () => {
    await adminApi.audit.list(TOKEN, { page: 3, limit: 50 });

    const [url] = lastCall();
    expect(url).toBe("https://api.test/admin/audit?page=3&limit=50");
  });

  it("omits the query string when no pagination is given", async () => {
    await adminApi.audit.list(TOKEN);

    const [url] = lastCall();
    expect(url).toBe("https://api.test/admin/audit");
  });

  it("posts a batch of trade status updates", async () => {
    await adminApi.trades.batchStatus(TOKEN, {
      updates: [{ tradeId: "t-1", status: "FUNDED" }],
    });

    const [url, init] = lastCall();
    expect(url).toBe("https://api.test/admin/trades/batch/status");
    expect(JSON.parse(init.body as string).updates).toHaveLength(1);
  });

  it("reads the admin auth claims endpoint", async () => {
    await adminApi.auth.claims(TOKEN);

    const [url] = lastCall();
    expect(url).toBe("https://api.test/api/admin/auth/claims");
  });
});

describe("correlation ID forwarding", () => {
  it("forwards a supplied correlation ID", async () => {
    await adminApi.contract.updateFeeBps(TOKEN, { feeBps: 100 }, { correlationId: "trace-1" });

    const [, init] = lastCall();
    expect(headersOf(init)["x-correlation-id"]).toBe("trace-1");
  });

  it("omits the header when no correlation ID is given", async () => {
    await adminApi.contract.updateFeeBps(TOKEN, { feeBps: 100 });

    const [, init] = lastCall();
    expect(headersOf(init)["x-correlation-id"]).toBeUndefined();
  });
});

describe("error mapping", () => {
  it.each([
    [400, "validation"],
    [401, "unauthenticated"],
    [403, "forbidden"],
    [404, "not_found"],
    [409, "conflict"],
    [422, "validation"],
    [429, "rate_limited"],
    [500, "server"],
    [503, "server"],
  ])("maps HTTP %s to reason %s", async (status, reason) => {
    fetchMock.mockResolvedValue(jsonResponse(status, { error: "nope" }));

    await expect(adminApi.features.list(TOKEN)).rejects.toMatchObject({ reason, status });
  });

  it("maps a thrown network failure to the network reason", async () => {
    fetchMock.mockRejectedValue(new Error("connection refused"));

    await expect(adminApi.features.list(TOKEN)).rejects.toMatchObject({
      reason: "network",
      status: 0,
    });
  });

  it("surfaces the backend's error message", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { error: "feeBps: Number must be less than or equal to 500" }),
    );

    await expect(adminApi.contract.updateFeeBps(TOKEN, { feeBps: 9999 })).rejects.toThrow(
      /feeBps/,
    );
  });

  it("falls back to the structured message field", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { message: "Internal server error" }));

    await expect(adminApi.features.list(TOKEN)).rejects.toThrow("Internal server error");
  });

  it("keeps the backend correlation ID on the error", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(500, { message: "boom", correlationId: "trace-from-server" }),
    );

    await expect(adminApi.features.list(TOKEN)).rejects.toMatchObject({
      correlationId: "trace-from-server",
    });
  });

  it("falls back to the supplied correlation ID when the body has none", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { error: "Forbidden" }));

    await expect(
      adminApi.features.list(TOKEN, { correlationId: "trace-local" }),
    ).rejects.toMatchObject({ correlationId: "trace-local" });
  });

  it("always throws AdminApiError rather than the raw ApiError", async () => {
    fetchMock.mockResolvedValue(jsonResponse(418, { error: "teapot" }));

    const error = await adminApi.features.list(TOKEN).catch((e) => e);
    expect(error).toBeInstanceOf(AdminApiError);
    expect(error.name).toBe("AdminApiError");
  });
});

describe("adminRequest", () => {
  it("is reusable for endpoints not yet on adminApi", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));

    await adminRequest("/admin/future", TOKEN, { method: "POST" });

    const [url, init] = lastCall();
    expect(url).toBe("https://api.test/admin/future");
    expect(headersOf(init).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("returns the parsed response body", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { flags: [{ enabled: true }] }));

    await expect(adminApi.features.list(TOKEN)).resolves.toEqual({
      flags: [{ enabled: true }],
    });
  });
});
