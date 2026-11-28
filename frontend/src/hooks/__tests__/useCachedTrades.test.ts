/**
 * Tests for useCachedTrades hook.
 *
 * Strategy: mock the api module and the offlineCache module, then verify
 * the hook's state transitions through renderHook + act.
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useCachedTrades } from "../useCachedTrades";
import * as offlineCache from "@/lib/offlineCache";
import * as useOfflineModule from "@/hooks/useOffline";
import * as useAuthModule from "@/hooks/useAuth";
import * as apiModule from "@/lib/api";

// ─── Module mocks ─────────────────────────────────────────────────────────

jest.mock("@/lib/offlineCache", () => ({
  cacheRead: jest.fn(),
  cacheWrite: jest.fn(),
  cacheInvalidate: jest.fn(),
}));

jest.mock("@/hooks/useOffline", () => ({
  useOffline: jest.fn(),
}));

jest.mock("@/hooks/useAuth", () => ({
  useAuth: jest.fn(),
}));

jest.mock("@/lib/api", () => ({
  api: {
    trades: {
      list: jest.fn(),
    },
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────

const mockUseOffline = useOfflineModule.useOffline as jest.Mock;
const mockUseAuth = useAuthModule.useAuth as jest.Mock;
const mockCacheRead = offlineCache.cacheRead as jest.Mock;
const mockCacheWrite = offlineCache.cacheWrite as jest.Mock;
const mockCacheInvalidate = offlineCache.cacheInvalidate as jest.Mock;
const mockTradesList = (apiModule.api.trades.list) as jest.Mock;

const MOCK_TOKEN = "test-token";
const MOCK_TRADES = {
  items: [{ tradeId: "t1", status: "OPEN" }],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
};

function setupOnline() {
  mockUseOffline.mockReturnValue({ isOffline: false });
  mockUseAuth.mockReturnValue({ token: MOCK_TOKEN, isAuthenticated: true });
}

function setupOffline() {
  mockUseOffline.mockReturnValue({ isOffline: true });
  mockUseAuth.mockReturnValue({ token: MOCK_TOKEN, isAuthenticated: true });
}

function missResult() {
  return { entry: null, isStale: false, isMiss: true };
}

function hitResult(data: unknown, isStale = false) {
  return { entry: { data, cachedAt: Date.now(), isStale }, isStale, isMiss: false };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCacheRead.mockReturnValue(missResult());
  mockTradesList.mockResolvedValue(MOCK_TRADES);
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe("useCachedTrades — online, cache miss", () => {
  it("starts with isLoading=true on cache miss and fetches fresh data", async () => {
    setupOnline();
    mockCacheRead.mockReturnValue(missResult());

    const { result } = renderHook(() => useCachedTrades());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(MOCK_TRADES);
    expect(result.current.isStale).toBe(false);
    expect(mockCacheWrite).toHaveBeenCalledWith(
      "trades_list",
      expect.any(String),
      MOCK_TRADES,
    );
  });
});

describe("useCachedTrades — online, cache hit (fresh)", () => {
  it("seeds data from cache immediately and revalidates in background", async () => {
    setupOnline();
    const cachedData = {
      items: [{ tradeId: "cached-t1", status: "OPEN" }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };
    mockCacheRead.mockReturnValue(hitResult(cachedData, false));

    const { result } = renderHook(() => useCachedTrades());

    // Immediate: seeded from cache
    expect(result.current.data).toEqual(cachedData);
    expect(result.current.isLoading).toBe(false);

    // Background revalidation runs
    await waitFor(() => expect(mockTradesList).toHaveBeenCalledTimes(1));
  });
});

describe("useCachedTrades — online, cache hit (stale)", () => {
  it("seeds stale data and clears isStale after revalidation", async () => {
    setupOnline();
    const staleData = {
      items: [{ tradeId: "stale-t1", status: "OPEN" }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };
    mockCacheRead.mockReturnValue(hitResult(staleData, true));

    const { result } = renderHook(() => useCachedTrades());

    expect(result.current.isStale).toBe(true);
    expect(result.current.data).toEqual(staleData);

    await waitFor(() => expect(result.current.isStale).toBe(false));
    expect(result.current.data).toEqual(MOCK_TRADES);
  });
});

describe("useCachedTrades — offline", () => {
  it("serves cached data when offline and does not call the API", () => {
    setupOffline();
    const cachedData = {
      items: [{ tradeId: "offline-t1" }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };
    mockCacheRead.mockReturnValue(hitResult(cachedData, true));

    const { result } = renderHook(() => useCachedTrades());

    expect(result.current.data).toEqual(cachedData);
    expect(result.current.isStale).toBe(true);
    expect(mockTradesList).not.toHaveBeenCalled();
  });

  it("returns null data and isLoading when offline with no cache", () => {
    setupOffline();
    mockCacheRead.mockReturnValue(missResult());

    const { result } = renderHook(() => useCachedTrades());

    expect(result.current.data).toBeNull();
    expect(mockTradesList).not.toHaveBeenCalled();
  });
});

describe("useCachedTrades — invalidateAndRefetch", () => {
  it("clears cache, sets loading, and fetches fresh data", async () => {
    setupOnline();
    const cachedData = {
      items: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    };
    mockCacheRead.mockReturnValue(hitResult(cachedData));

    const { result } = renderHook(() => useCachedTrades());

    await act(async () => {
      result.current.invalidateAndRefetch();
    });

    expect(mockCacheInvalidate).toHaveBeenCalledWith(
      "trades_list",
      expect.any(String),
    );

    await waitFor(() =>
      expect(result.current.data).toEqual(MOCK_TRADES),
    );
  });
});

describe("useCachedTrades — fetch error", () => {
  it("sets error when API call fails", async () => {
    setupOnline();
    mockCacheRead.mockReturnValue(missResult());
    mockTradesList.mockRejectedValue(new Error("Network failure"));

    const { result } = renderHook(() => useCachedTrades());

    await waitFor(() =>
      expect(result.current.error).toBe("Network failure"),
    );
    expect(result.current.isLoading).toBe(false);
  });
});
