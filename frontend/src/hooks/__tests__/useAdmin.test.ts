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

  it("returns isAdmin true when user address is in admin list", () => {
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
    expect(result.current.adminAddresses).toContain(adminAddress);
  });

  it("returns isAdmin false when user address is not in admin list", () => {
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
    expect(result.current.adminAddresses).toContain(adminAddress);
    expect(result.current.adminAddresses).not.toContain(userAddress);
  });

  it("returns isAdmin false when user is not authenticated", () => {
    const adminAddress = "GADMIN123";
    process.env.NEXT_PUBLIC_ADMIN_WALLETS = adminAddress;

    mockUseAuth.mockReturnValue({
      address: null,
      shortAddress: null,
      token: null,
      isAuthenticated: false,
      isWalletConnected: false,
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
  });

  it("handles multiple admin addresses", () => {
    const admin1 = "GADMIN123";
    const admin2 = "GADMIN456";
    const admin3 = "GADMIN789";
    process.env.NEXT_PUBLIC_ADMIN_WALLETS = `${admin1},${admin2},${admin3}`;

    mockUseAuth.mockReturnValue({
      address: admin2,
      shortAddress: "GADMIN...456",
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
    expect(result.current.adminAddresses).toEqual([admin1, admin2, admin3]);
  });

  it("handles empty admin addresses list", () => {
    process.env.NEXT_PUBLIC_ADMIN_WALLETS = "";

    mockUseAuth.mockReturnValue({
      address: "GUSER123",
      shortAddress: "GUSER...123",
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
    expect(result.current.adminAddresses).toEqual([]);
  });

  it("handles undefined admin addresses environment variable", () => {
    delete process.env.NEXT_PUBLIC_ADMIN_WALLETS;

    mockUseAuth.mockReturnValue({
      address: "GUSER123",
      shortAddress: "GUSER...123",
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
    expect(result.current.adminAddresses).toEqual([]);
  });

  it("trims whitespace from admin addresses", () => {
    const admin1 = "GADMIN123";
    const admin2 = "GADMIN456";
    process.env.NEXT_PUBLIC_ADMIN_WALLETS = `  ${admin1}  ,  ${admin2}  `;

    mockUseAuth.mockReturnValue({
      address: admin1,
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
    expect(result.current.adminAddresses).toEqual([admin1, admin2]);
  });
});
