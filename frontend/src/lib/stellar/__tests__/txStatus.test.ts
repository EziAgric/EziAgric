import { request, ApiError } from "@/lib/api/client";
import {
  fetchTransactionStatus,
  networkFromPassphrase,
  pollTransactionStatus,
  stellarExpertTxUrl,
  submitSignedTransaction,
} from "../txStatus";

jest.mock("@/lib/api/client", () => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  }
  return { request: jest.fn(), ApiError: MockApiError };
});

const mockRequest = request as jest.MockedFunction<typeof request>;

beforeEach(() => {
  mockRequest.mockReset();
});

describe("stellarExpertTxUrl", () => {
  it("builds a testnet explorer URL", () => {
    expect(stellarExpertTxUrl("abc123", "testnet")).toBe(
      "https://stellar.expert/explorer/testnet/tx/abc123",
    );
  });

  it("builds a mainnet ('public') explorer URL", () => {
    expect(stellarExpertTxUrl("abc123", "public")).toBe(
      "https://stellar.expert/explorer/public/tx/abc123",
    );
  });

  it("maps a passphrase to a network", () => {
    expect(networkFromPassphrase("Test SDF Network ; September 2015")).toBe(
      "testnet",
    );
    expect(networkFromPassphrase("Public Global Stellar Network ; September 2015")).toBe(
      "public",
    );
  });
});

describe("fetchTransactionStatus", () => {
  it("returns the backend status payload", async () => {
    mockRequest.mockResolvedValue({
      status: "success",
      hash: "abc",
      ledger: 42,
    });

    await expect(fetchTransactionStatus("abc")).resolves.toEqual({
      status: "success",
      hash: "abc",
      ledger: 42,
    });

    expect(mockRequest).toHaveBeenCalledWith(
      "/stellar/tx/abc/status",
      expect.objectContaining({ skipAuth: true }),
    );
  });

  it("maps a 404 to pending instead of throwing", async () => {
    mockRequest.mockRejectedValue(new ApiError(404, "not found"));
    await expect(fetchTransactionStatus("abc")).resolves.toEqual({
      status: "pending",
      hash: "abc",
    });
  });

  it("rethrows non-404 errors", async () => {
    mockRequest.mockRejectedValue(new ApiError(502, "horizon down"));
    await expect(fetchTransactionStatus("abc")).rejects.toThrow("horizon down");
  });
});

describe("pollTransactionStatus", () => {
  it("keeps polling while pending, then resolves on success", async () => {
    const fetchStatus = jest
      .fn()
      .mockResolvedValueOnce({ status: "pending", hash: "abc" })
      .mockResolvedValueOnce({ status: "pending", hash: "abc" })
      .mockResolvedValueOnce({ status: "success", hash: "abc", ledger: 7 });

    const result = await pollTransactionStatus("abc", {
      fetchStatus,
      intervalMs: 1,
    });

    expect(result.status).toBe("success");
    expect(fetchStatus).toHaveBeenCalledTimes(3);
  });

  it("resolves with failed as soon as the network reports it", async () => {
    const fetchStatus = jest
      .fn()
      .mockResolvedValue({ status: "failed", hash: "abc" });

    await expect(
      pollTransactionStatus("abc", { fetchStatus, intervalMs: 1 }),
    ).resolves.toMatchObject({ status: "failed" });
  });

  it("returns pending once the timeout elapses", async () => {
    const fetchStatus = jest
      .fn()
      .mockResolvedValue({ status: "pending", hash: "abc" });
    const onUpdate = jest.fn();

    const result = await pollTransactionStatus("abc", {
      fetchStatus,
      timeoutMs: 0,
      onUpdate,
    });

    expect(result.status).toBe("pending");
    expect(onUpdate).toHaveBeenCalledWith({ status: "pending", hash: "abc" });
  });

  it("rejects with an AbortError when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      pollTransactionStatus("abc", {
        signal: controller.signal,
        fetchStatus: jest.fn(),
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("submitSignedTransaction", () => {
  it("submits the signed XDR and returns the hash", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      json: async () => ({ result: { hash: "deadbeef" } }),
    });

    await expect(
      submitSignedTransaction("signed-xdr", {
        rpcUrl: "https://rpc.example",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toBe("deadbeef");

    const [, init] = fetchImpl.mock.calls[0];
    expect(JSON.parse(init.body).params.transaction).toBe("signed-xdr");
  });

  it("throws when the RPC returns an error", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      json: async () => ({ error: { message: "tx_bad_seq" } }),
    });

    await expect(
      submitSignedTransaction("signed-xdr", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow("tx_bad_seq");
  });

  it("throws when no hash is returned", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      json: async () => ({ result: {} }),
    });

    await expect(
      submitSignedTransaction("signed-xdr", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/no hash/);
  });
});
