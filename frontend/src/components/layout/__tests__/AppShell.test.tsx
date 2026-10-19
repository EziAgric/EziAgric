import { render, screen, within, fireEvent } from "@testing-library/react";
import { AppShell } from "../AppShell";
import { useFreighterIdentity } from "@/hooks/useFreighterIdentity";
import { useIsAdmin } from "@/hooks/useIsAdmin";

let mockPathname = "/trades";

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

jest.mock("@/hooks/useFreighterIdentity");
jest.mock("@/hooks/useIsAdmin");
jest.mock("@/components/ui/ConnectivityBanner", () => ({
  ConnectivityBanner: () => <div data-testid="connectivity-banner" />,
}));

const mockUseFreighterIdentity = useFreighterIdentity as jest.MockedFunction<
  typeof useFreighterIdentity
>;
const mockUseIsAdmin = useIsAdmin as jest.MockedFunction<typeof useIsAdmin>;

describe("AppShell", () => {
  beforeEach(() => {
    mockPathname = "/trades";
    localStorage.clear();
    mockUseIsAdmin.mockReturnValue(false);
    mockUseFreighterIdentity.mockReturnValue({
      address: null,
      isAuthorized: false,
      connectWallet: jest.fn(),
    } as unknown as ReturnType<typeof useFreighterIdentity>);
  });

  it("renders children inside the main region", () => {
    render(
      <AppShell>
        <p>Page content</p>
      </AppShell>,
    );

    expect(within(screen.getByRole("main")).getByText("Page content")).toBeInTheDocument();
  });

  it("renders the connectivity banner, top nav and sidebar nav", () => {
    render(
      <AppShell>
        <p>Page content</p>
      </AppShell>,
    );

    expect(screen.getByTestId("connectivity-banner")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByLabelText("Primary sidebar")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
  });

  it("marks the current route as active in the sidebar", () => {
    render(
      <AppShell>
        <p>Page content</p>
      </AppShell>,
    );

    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).getByRole("link", { name: "Trades" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("opens and closes the mobile sidebar from the top nav menu button", () => {
    render(
      <AppShell>
        <p>Page content</p>
      </AppShell>,
    );

    const drawer = screen.getByLabelText("Primary sidebar").parentElement as HTMLElement;
    expect(drawer).toHaveClass("-translate-x-full");

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(drawer).toHaveClass("translate-x-0");

    fireEvent.click(screen.getAllByRole("button", { name: "Close menu" })[0]);
    expect(drawer).toHaveClass("-translate-x-full");
  });
});
