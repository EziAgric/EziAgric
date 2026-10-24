import { act, renderHook, waitFor } from "@testing-library/react";
import { useWallet } from "../useWallet";
import { useAuth } from "../useAuth";
import { api, ApiError } from "@/lib/api";

jest.mock("../useAuth");
jest.mock("@/lib/api", () => {
  const { ApiError: RealApiError } = jest.requireActual("@/lib/api/client");
  return {
    api: {
      wallet: {
        getBalance: jest.fn(),
      },
    },
    ApiError: RealApiError,
  };
});

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockGetBalance = api.wallet.getBalance as jest.MockedFunction<
  typeof api.wallet.getBalance
>;

type AuthOverrides = Partial<ReturnType<typeof useAuth>>;

function mockAuth(overrides: AuthOverrides = {}) {
  mockUseAuth.mockReturnValue({
    address: "GWALLET123",
    shortAddress: "GWALLE...T123",
    token: "mock-token",
    isAuthenticated: true,
    isWalletConnected: true,
    isWalletDetected: true,
    isLoading: false,
    error: null,
    connectWallet: jest.fn(),
    authenticate: jest.fn(),
    logout: jest.fn(),
    refreshAuth: jest.fn(),
    ...overrides,
  });
}

const disconnectedAuth: AuthOverrides = {
  address: null,
  shortAddress: null,
  token: null,
  isAuthenticated: false,
  isWalletConnected: false,
};

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe("useWallet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("connected wallet", () => {
    it("loads the balance and asset on success", async () => {
      mockAuth();
      mockGetBalance.mockResolvedValueOnce({ balance: "1500.50", asset: "cNGN" });

      const { result } = renderHook(() => useWallet());

      await waitFor(() => expect(result.current.balance).toBe("1500.50"));

      expect(mockGetBalance).toHaveBeenCalledWith("mock-token");
      expect(result.current.asset).toBe("cNGN");
      expect(result.current.error).toBeNull();
      expect(result.current.loading).toBe(false);
    });

    it("reports loading while the balance request is in flight", async () => {
      mockAuth();
      const deferred = createDeferred<{ balance: string; asset: string }>();
      mockGetBalance.mockReturnValueOnce(deferred.promise);

      const { result } = renderHook(() => useWallet());

      await waitFor(() => expect(result.current.loading).toBe(true));
      expect(result.current.balance).toBeNull();

      await act(async () => {
        deferred.resolve({ balance: "10", asset: "cNGN" });
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.balance).toBe("10");
    });

    it("surfaces the message from an ApiError", async () => {
      mockAuth();
      mockGetBalance.mockRejectedValueOnce(new ApiError(503, "Horizon unavailable"));

      const { result } = renderHook(() => useWallet());

      await waitFor(() => expect(result.current.error).toBe("Horizon unavailable"));

      expect(result.current.balance).toBeNull();
      expect(result.current.asset).toBeNull();
      expect(result.current.loading).toBe(false);
    });

    it("surfaces the message from a generic Error", async () => {
      mockAuth();
      mockGetBalance.mockRejectedValueOnce(new Error("Network down"));

      const { result } = renderHook(() => useWallet());

      await waitFor(() => expect(result.current.error).toBe("Network down"));
      expect(result.current.loading).toBe(false);
    });

    it("falls back to a default message for non-Error rejections", async () => {
      mockAuth();
      mockGetBalance.mockRejectedValueOnce("boom");

      const { result } = renderHook(() => useWallet());

      await waitFor(() =>
        expect(result.current.error).toBe("Failed to load wallet balance"),
      );
      expect(result.current.loading).toBe(false);
    });

    it("clears a previous error when refetch succeeds", async () => {
      mockAuth();
      mockGetBalance.mockRejectedValueOnce(new Error("Network down"));

      const { result } = renderHook(() => useWallet());

      await waitFor(() => expect(result.current.error).toBe("Network down"));

      mockGetBalance.mockResolvedValueOnce({ balance: "42", asset: "cNGN" });

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.balance).toBe("42");
      expect(result.current.asset).toBe("cNGN");
      expect(mockGetBalance).toHaveBeenCalledTimes(2);
    });
  });

  describe("disconnected wallet", () => {
    it("does not request a balance and keeps empty state", async () => {
      mockAuth(disconnectedAuth);

      const { result } = renderHook(() => useWallet());

      await act(async () => {
        await result.current.refetch();
      });

      expect(mockGetBalance).not.toHaveBeenCalled();
      expect(result.current.balance).toBeNull();
      expect(result.current.asset).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.loading).toBe(false);
    });

    it("does not request a balance when authenticated without a token", async () => {
      mockAuth({ token: null });

      const { result } = renderHook(() => useWallet());

      await act(async () => {
        await result.current.refetch();
      });

      expect(mockGetBalance).not.toHaveBeenCalled();
      expect(result.current.balance).toBeNull();
    });

    it("stops fetching after the wallet disconnects", async () => {
      mockAuth();
      mockGetBalance.mockResolvedValueOnce({ balance: "1500.50", asset: "cNGN" });

      const { result, rerender } = renderHook(() => useWallet());

      await waitFor(() => expect(result.current.balance).toBe("1500.50"));
      expect(mockGetBalance).toHaveBeenCalledTimes(1);

      mockAuth(disconnectedAuth);
      rerender();

      await act(async () => {
        await result.current.refetch();
      });

      expect(mockGetBalance).toHaveBeenCalledTimes(1);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });
});
