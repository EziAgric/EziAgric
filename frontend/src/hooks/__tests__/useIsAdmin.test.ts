import { renderHook } from "@testing-library/react";
import { useIsAdmin } from "../useIsAdmin";
import { useFreighterIdentity } from "../useFreighterIdentity";

jest.mock("../useFreighterIdentity");

const mockUseFreighterIdentity = useFreighterIdentity as jest.MockedFunction<
  typeof useFreighterIdentity
>;

const ADMIN_ADDRESS = "GADMIN123";
const USER_ADDRESS = "GUSER456";

type IdentityOverrides = Partial<ReturnType<typeof useFreighterIdentity>>;

function mockIdentity(overrides: IdentityOverrides = {}) {
  mockUseFreighterIdentity.mockReturnValue({
    address: null,
    shortAddress: null,
    isAuthorized: false,
    isWalletDetected: false,
    isLoading: false,
    connectWallet: jest.fn(),
    refreshIdentity: jest.fn(),
    ...overrides,
  });
}

const originalEnv = process.env;

describe("useIsAdmin", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, NEXT_PUBLIC_ADMIN_WALLETS: ADMIN_ADDRESS };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns true when the connected address is on the allowlist", () => {
    mockIdentity({ address: ADMIN_ADDRESS, isAuthorized: true });

    const { result } = renderHook(() => useIsAdmin());

    expect(result.current).toBe(true);
  });

  it("returns false when the connected address is not on the allowlist", () => {
    mockIdentity({ address: USER_ADDRESS, isAuthorized: true });

    const { result } = renderHook(() => useIsAdmin());

    expect(result.current).toBe(false);
  });

  it("returns false when no wallet address is available", () => {
    mockIdentity({ address: null });

    const { result } = renderHook(() => useIsAdmin());

    expect(result.current).toBe(false);
  });

  it("returns false when the address is undefined", () => {
    mockIdentity({ address: undefined as unknown as null });

    const { result } = renderHook(() => useIsAdmin());

    expect(result.current).toBe(false);
  });

  it("returns false when the allowlist is empty, even with an address", () => {
    delete process.env.NEXT_PUBLIC_ADMIN_WALLETS;
    mockIdentity({ address: ADMIN_ADDRESS, isAuthorized: true });

    const { result } = renderHook(() => useIsAdmin());

    expect(result.current).toBe(false);
  });

  it("returns false while the wallet identity is still loading", () => {
    mockIdentity({ isLoading: true });

    const { result } = renderHook(() => useIsAdmin());

    expect(result.current).toBe(false);
  });

  it("re-evaluates once the wallet identity resolves to an admin", () => {
    mockIdentity({ isLoading: true });

    const { result, rerender } = renderHook(() => useIsAdmin());

    expect(result.current).toBe(false);

    mockIdentity({ address: ADMIN_ADDRESS, isAuthorized: true });
    rerender();

    expect(result.current).toBe(true);
  });

  it("re-evaluates once the wallet identity resolves to a non-admin", () => {
    mockIdentity({ isLoading: true });

    const { result, rerender } = renderHook(() => useIsAdmin());

    mockIdentity({ address: USER_ADDRESS, isAuthorized: true });
    rerender();

    expect(result.current).toBe(false);
  });
});
