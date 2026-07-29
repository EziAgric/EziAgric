import { render, screen } from "@testing-library/react";
import { AppTopNav } from "../AppTopNav";
import { useIsAdmin } from "@/hooks/useIsAdmin";

jest.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

jest.mock("@/hooks/useIsAdmin");

const mockUseIsAdmin = useIsAdmin as jest.MockedFunction<typeof useIsAdmin>;

describe("AppTopNav admin role indicator", () => {
  it("shows an Admin badge when the connected wallet is an admin", () => {
    mockUseIsAdmin.mockReturnValue(true);

    render(<AppTopNav />);

    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("hides the Admin badge for non-admin users", () => {
    mockUseIsAdmin.mockReturnValue(false);

    render(<AppTopNav />);

    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });
});
