import { render, screen, within, fireEvent } from "@testing-library/react";
import { SideNavBar } from "../SideNavBar";

const NAV_LABELS = ["Dashboard", "Trades", "Vault", "Reputation", "Settings"];

function renderSideNav(props: Partial<React.ComponentProps<typeof SideNavBar>> = {}) {
  return render(
    <SideNavBar
      activePath="/dashboard"
      isConnected={false}
      onConnectWallet={jest.fn()}
      {...props}
    />,
  );
}

describe("SideNavBar", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders every primary nav item", () => {
    renderSideNav();

    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    NAV_LABELS.forEach((label) => {
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
    });
  });

  it("marks only the nav item matching the current route as active", () => {
    renderSideNav({ activePath: "/trades" });

    expect(screen.getByRole("link", { name: "Trades" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Vault" })).not.toHaveAttribute("aria-current");
  });

  it("treats nested routes as active for their parent item", () => {
    renderSideNav({ activePath: "/trades/42" });

    expect(screen.getByRole("link", { name: "Trades" })).toHaveAttribute("aria-current", "page");
  });

  it("hides labels and narrows the sidebar when collapsed", () => {
    renderSideNav({ collapsed: true });

    const aside = screen.getByLabelText("Primary sidebar");
    expect(aside).toHaveClass("w-20");
    expect(screen.queryByText("Amana")).not.toBeInTheDocument();
    expect(screen.queryByText("Trades")).not.toBeInTheDocument();
    expect(screen.getByTitle("Trades")).toBeInTheDocument();
  });

  it("shows labels and the full width when expanded", () => {
    renderSideNav({ collapsed: false });

    expect(screen.getByLabelText("Primary sidebar")).toHaveClass("w-64");
    expect(screen.getByText("Amana")).toBeInTheDocument();
    expect(screen.getByText("Trades")).toBeInTheDocument();
  });

  it("shows the truncated wallet address when connected", () => {
    renderSideNav({
      isConnected: true,
      walletAddress: "GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12",
    });

    expect(screen.getByText("GABCDE...CDEF12")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect Wallet" })).not.toBeInTheDocument();
  });

  it("requires legal consent before connecting a wallet", () => {
    const onConnectWallet = jest.fn();
    renderSideNav({ onConnectWallet });

    const connect = screen.getByRole("button", { name: "Connect Wallet" });
    expect(connect).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(connect).toBeEnabled();

    fireEvent.click(connect);
    expect(onConnectWallet).toHaveBeenCalledTimes(1);
  });

  it("renders a close button only when onClose is provided", () => {
    const onClose = jest.fn();
    const { unmount } = renderSideNav();
    expect(screen.queryByRole("button", { name: "Close menu" })).not.toBeInTheDocument();
    unmount();

    renderSideNav({ onClose });
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
