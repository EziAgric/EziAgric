import { render, screen, fireEvent } from "@testing-library/react";
import { AppSidebar } from "../AppSidebar";
import { useFreighterIdentity } from "@/hooks/useFreighterIdentity";

let mockPathname = "/dashboard";

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

jest.mock("@/hooks/useFreighterIdentity");

const mockUseFreighterIdentity = useFreighterIdentity as jest.MockedFunction<
  typeof useFreighterIdentity
>;
const connectWallet = jest.fn();

describe("AppSidebar", () => {
  beforeEach(() => {
    mockPathname = "/dashboard";
    connectWallet.mockReset();
    localStorage.clear();
    mockUseFreighterIdentity.mockReturnValue({
      address: null,
      isAuthorized: false,
      connectWallet,
    } as unknown as ReturnType<typeof useFreighterIdentity>);
  });

  it("highlights the nav item for the current route", () => {
    mockPathname = "/vault";
    render(<AppSidebar />);

    expect(screen.getByRole("link", { name: "Vault" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("renders nothing on routes that provide their own sidebar", () => {
    mockPathname = "/assets/abc";
    const { container } = render(<AppSidebar />);

    expect(container).toBeEmptyDOMElement();
  });

  it("slides the drawer in when open and out when closed", () => {
    const { rerender } = render(<AppSidebar isOpen={false} />);
    const drawer = screen.getByLabelText("Primary sidebar").parentElement as HTMLElement;
    expect(drawer).toHaveClass("-translate-x-full");

    rerender(<AppSidebar isOpen />);
    expect(drawer).toHaveClass("translate-x-0");
    expect(drawer).not.toHaveClass("-translate-x-full");
  });

  it("calls onClose when the mobile overlay is clicked", () => {
    const onClose = jest.fn();
    const { container } = render(<AppSidebar isOpen onClose={onClose} />);

    const overlay = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(overlay);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render the overlay while closed", () => {
    const { container } = render(<AppSidebar isOpen={false} />);

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();
  });

  it("connects the wallet and closes the drawer", () => {
    const onClose = jest.fn();
    render(<AppSidebar isOpen onClose={onClose} />);

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Connect Wallet" }));

    expect(connectWallet).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the connected wallet address", () => {
    mockUseFreighterIdentity.mockReturnValue({
      address: "GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12",
      isAuthorized: true,
      connectWallet,
    } as unknown as ReturnType<typeof useFreighterIdentity>);
    render(<AppSidebar />);

    expect(screen.getByText("GABCDE...CDEF12")).toBeInTheDocument();
  });
});
