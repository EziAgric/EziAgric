import { disputesApi } from "../disputes";

function mockFetchOnce(body: unknown, status = 200) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe("disputesApi.list", () => {
  beforeEach(() => {
    mockFetchOnce({ items: [], pagination: { totalPages: 1 } });
  });

  it("builds the request payload with status, page, and limit", async () => {
    await disputesApi.list("test-token", { status: "OPEN", page: 2, limit: 10 });

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("http://localhost:4000/disputes?status=OPEN&page=2&limit=10");
    expect(options.headers.Authorization).toBe("Bearer test-token");
  });

  it("omits filters that are not provided", async () => {
    await disputesApi.list("test-token");

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("http://localhost:4000/disputes");
  });

  it("always forwards the caller's token for authentication", async () => {
    await disputesApi.list("another-token", { page: 1 });

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer another-token");
  });
});
