import { act, renderHook } from "@testing-library/react";
import { useTracedFetch } from "../useTracedFetch";

const CORRELATION_STORAGE_KEY = "amana-correlation-id";

function mockResponse(
  body: unknown,
  { status = 200, statusText = "OK" }: { status?: number; statusText?: string } = {},
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: new Map([["content-type", "application/json"]]),
    json: jest.fn().mockResolvedValue(body),
  };
}

const fetchMock = jest.fn();

function lastRequestHeaders(): Record<string, string> {
  const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return init.headers as Record<string, string>;
}

describe("useTracedFetch", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    sessionStorage.clear();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("attaches the provided correlation ID to the request and exposes it in state", async () => {
    fetchMock.mockResolvedValue(mockResponse({ id: "T-001" }));
    const { result } = renderHook(() => useTracedFetch<{ id: string }>());

    let data = undefined as { id: string } | undefined;
    await act(async () => {
      data = await result.current.get("/api/trades/T-001", { correlationId: "corr-123" });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/trades/T-001");
    expect(init.method).toBe("GET");

    const headers = lastRequestHeaders();
    expect(headers["X-Correlation-Id"]).toBe("corr-123");
    expect(headers["X-Request-Id"]).toEqual(expect.any(String));

    expect(data).toEqual({ id: "T-001" });
    expect(result.current.data).toEqual({ id: "T-001" });
    expect(result.current.correlationId).toBe("corr-123");
    expect(result.current.requestId).toBe(headers["X-Request-Id"]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("generates a session correlation ID and reuses it across requests", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(mockResponse({ ok: true })));
    const { result } = renderHook(() => useTracedFetch());

    await act(async () => {
      await result.current.get("/api/one");
    });
    const firstId = lastRequestHeaders()["X-Correlation-Id"];

    await act(async () => {
      await result.current.post("/api/two", { value: 1 });
    });
    const secondId = lastRequestHeaders()["X-Correlation-Id"];

    expect(firstId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(secondId).toBe(firstId);
    expect(sessionStorage.getItem(CORRELATION_STORAGE_KEY)).toBe(firstId);
    expect(result.current.correlationId).toBe(firstId);
  });

  it("surfaces HTTP errors through the rejected promise, state and onError callback", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({ message: "boom" }, { status: 500, statusText: "Internal Server Error" }),
    );
    const onError = jest.fn();
    const { result } = renderHook(() => useTracedFetch({ onError }));

    let caught = undefined as (Error & { status?: number }) | undefined;
    await act(async () => {
      await result.current.get("/api/fail", { correlationId: "corr-err" }).catch((err) => {
        caught = err;
      });
    });

    expect(caught).toBeInstanceOf(Error);
    expect(caught?.message).toBe("HTTP 500: Internal Server Error - boom");
    expect(caught?.status).toBe(500);
    expect(lastRequestHeaders()["X-Correlation-Id"]).toBe("corr-err");

    expect(result.current.error).toBe(caught);
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(onError).toHaveBeenCalledWith(caught);
  });

  it("surfaces network failures as errors", async () => {
    fetchMock.mockRejectedValue(new Error("Network down"));
    const { result } = renderHook(() => useTracedFetch());

    let caught = undefined as Error | undefined;
    await act(async () => {
      await result.current.get("/api/offline").catch((err) => {
        caught = err;
      });
    });

    expect(caught?.message).toBe("Network down");
    expect(result.current.error?.message).toBe("Network down");
    expect(result.current.loading).toBe(false);
  });
});
