import { renderHook } from "@testing-library/react";
import { useAdmin } from "../useAdmin";
import { useAuth } from "../useAuth";

jest.mock("../useAuth");

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

// Mock environment variable
const originalEnv = process.env;

describe("useAdmin", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("with feature flag enabled", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_ENABLE_ADMIN_UI = "true";
    });

    it("returns canAccessAdmin true when user is admin and feature is enabled", () => {
      const adminAddress = "GADMIN123";
      process.env.NEXT_PUBLIC_ADMIN_WALLETS = adminAddress;

      mockUseAuth.mockReturnValue({
        address: adminAddress,
        shortAddress: "GADMIN...123",
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
      });

      const { result } = renderHook(() => useAdmin());

      expect(result.current.isAdmin).toBe(true);
      expect(result.current.isAdminUIEnabled).toBe(true);
      expect(result.current.canAccessAdmin).toBe(true);
    });

    it("returns canAccessAdmin false when user is not admin even if feature is enabled", () => {
      const adminAddress = "GADMIN123";
      const userAddress = "GUSER456";
      process.env.NEXT_PUBLIC_ADMIN_WALLETS = adminAddress;

      mockUseAuth.mockReturnValue({
        address: userAddress,
        shortAddress: "GUSER...456",
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
      });

      const { result } = renderHook(() => useAdmin());

      expect(result.current.isAdmin).toBe(false);
      expect(result.current.isAdminUIEnabled).toBe(true);
      expect(result.current.canAccessAdmin).toBe(false);
    });
  });

  describe("with feature flag disabled", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_ENABLE_ADMIN_UI = "false";
    });

    it("returns canAccessAdmin false even when user is admin", () => {
      const adminAddress = "GADMIN123";
      process.env.NEXT_PUBLIC_ADMIN_WALLETS = adminAddress;

      mockUseAuth.mockReturnValue({
        address: adminAddress,
        shortAddress: "GADMIN...123",
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
      });

      const { result } = renderHook(() => useAdmin());

      expect(result.current.isAdmin).toBe(true);
      expect(result.current.isAdminUIEnabled).toBe(false);
      expect(result.current.canAccessAdmin).toBe(false);
    });

    it("returns canAccessAdmin false for non-admin user", () => {
      const adminAddress = "GADMIN123";
      const userAddress = "GUSER456";
      process.env.NEXT_PUBLIC_ADMIN_WALLETS = adminAddress;

      mockUseAuth.mockReturnValue({
        address: userAddress,
        shortAddress: "GUSER...456",
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
      });

      const { result } = renderHook(() => useAdmin());

      expect(result.current.isAdmin).toBe(false);
      expect(result.current.isAdminUIEnabled).toBe(false);
      expect(result.current.canAccessAdmin).toBe(false);
    });
  });

  describe("default behavior (feature flag not set)", () => {
    beforeEach(() => {
      delete process.env.NEXT_PUBLIC_ENABLE_ADMIN_UI;
    });

    it("defaults to feature flag disabled for safety", () => {
      const adminAddress = "GADMIN123";
      process.env.NEXT_PUBLIC_ADMIN_WALLETS = adminAddress;

      mockUseAuth.mockReturnValue({
        address: adminAddress,
        shortAddress: "GADMIN...123",
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
      });

      const { result } = renderHook(() => useAdmin());

      expect(result.current.isAdmin).toBe(true);
      expect(result.current.isAdminUIEnabled).toBe(false);
      expect(result.current.canAccessAdmin).toBe(false);
    });
  });

  describe("backwards compatibility", () => {
    it("maintains isAdmin property independent of feature flag", () => {
      const adminAddress = "GADMIN123";
      process.env.NEXT_PUBLIC_ADMIN_WALLETS = adminAddress;
      process.env.NEXT_PUBLIC_ENABLE_ADMIN_UI = "false";

      mockUseAuth.mockReturnValue({
        address: adminAddress,
        shortAddress: "GADMIN...123",
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
      });

      const { result } = renderHook(() => useAdmin());

      // isAdmin should still be true even if feature is disabled
      expect(result.current.isAdmin).toBe(true);
      // but canAccessAdmin should be false
      expect(result.current.canAccessAdmin).toBe(false);
    });
  });

  describe("all return values", () => {
    it("returns all expected properties", () => {
      process.env.NEXT_PUBLIC_ADMIN_WALLETS = "GADMIN123";
      process.env.NEXT_PUBLIC_ENABLE_ADMIN_UI = "true";

      mockUseAuth.mockReturnValue({
        address: "GADMIN123",
        shortAddress: "GADMIN...123",
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
      });

      const { result } = renderHook(() => useAdmin());

      expect(result.current).toHaveProperty("isAdmin");
      expect(result.current).toHaveProperty("isAdminUIEnabled");
      expect(result.current).toHaveProperty("canAccessAdmin");
      expect(result.current).toHaveProperty("adminAddresses");
    });
  });
});
