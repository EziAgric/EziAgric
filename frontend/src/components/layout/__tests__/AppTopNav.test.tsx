import { act, fireEvent, render, screen } from "@testing-library/react";
import { AppTopNav, truncateAddress } from "../AppTopNav";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useFreighterIdentity } from "@/hooks/useFreighterIdentity";

jest.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

jest.mock("@/hooks/useIsAdmin");
jest.mock("@/hooks/useFreighterIdentity");

const mockUseIsAdmin = useIsAdmin as jest.MockedFunction<typeof useIsAdmin>;
const mockUseFreighterIdentity = useFreighterIdentity as jest.MockedFunction<typeof useFreighterIdentity>;

const ADDRESS = "GCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUX7F2";
const connectWallet = jest.fn();

function mockWallet(address: string | null) {
  mockUseFreighterIdentity.mockReturnValue({
    address,
    connectWallet,
  } as unknown as ReturnType<typeof useFreighterIdentity>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseIsAdmin.mockReturnValue(false);
  mockWallet(null);
});

describe("AppTopNav admin role indicator", () => {
  it("shows an Admin badge when the connected wallet is an admin", () => {
    mockUseIsAdmin.mockReturnValue(true);

    render(<AppTopNav />);

    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("hides the Admin badge for non-admin users", () => {
    render(<AppTopNav />);

    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });
});

describe("AppTopNav wallet address (#937)", () => {
  it("truncates to the first and last 4 characters", () => {
    expect(truncateAddress(ADDRESS)).toBe("GCDE...X7F2");
    expect(truncateAddress("GABC")).toBe("GABC");
  });

  it("shows the truncated address when connected", () => {
    mockWallet(ADDRESS);
    render(<AppTopNav />);

    expect(screen.getByRole("button", { name: `Copy wallet address ${ADDRESS}` })).toHaveTextContent("GCDE...X7F2");
    expect(screen.queryByText("Connect Wallet")).not.toBeInTheDocument();
  });

  it("copies the full address to the clipboard on click", async () => {
    mockWallet(ADDRESS);
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<AppTopNav />);

    await act(async () => {
      fireEvent.click(screen.getByText("GCDE...X7F2"));
    });

    expect(writeText).toHaveBeenCalledWith(ADDRESS);
    expect(screen.getByText("Copied")).toBeInTheDocument();
  });

  it("shows a Connect Wallet button when disconnected", () => {
    render(<AppTopNav />);

    fireEvent.click(screen.getByRole("button", { name: "Connect Wallet" }));

    expect(connectWallet).toHaveBeenCalledTimes(1);
  });
});
