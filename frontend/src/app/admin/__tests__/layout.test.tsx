import { render, screen, waitFor } from "@testing-library/react";
import AdminLayout from "../layout";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";

const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock("@/hooks/useAuth");
jest.mock("@/hooks/useIsAdmin");

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseIsAdmin = useIsAdmin as jest.MockedFunction<typeof useIsAdmin>;

describe("AdminLayout route guard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders nothing and does not redirect while auth is still loading", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: true } as ReturnType<typeof useAuth>);
    mockUseIsAdmin.mockReturnValue(false);

    const { container } = render(
      <AdminLayout>
        <div>admin content</div>
      </AdminLayout>,
    );

    expect(container).toBeEmptyDOMElement();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("redirects to /access-denied when the caller is not authenticated", async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false } as ReturnType<typeof useAuth>);
    mockUseIsAdmin.mockReturnValue(false);

    render(
      <AdminLayout>
        <div>admin content</div>
      </AdminLayout>,
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/access-denied");
    });
    expect(screen.queryByText("admin content")).not.toBeInTheDocument();
  });

  it("redirects to /access-denied when authenticated but not an admin", async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false } as ReturnType<typeof useAuth>);
    mockUseIsAdmin.mockReturnValue(false);

    render(
      <AdminLayout>
        <div>admin content</div>
      </AdminLayout>,
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/access-denied");
    });
    expect(screen.queryByText("admin content")).not.toBeInTheDocument();
  });

  it("renders children without redirecting for an authenticated admin", async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false } as ReturnType<typeof useAuth>);
    mockUseIsAdmin.mockReturnValue(true);

    render(
      <AdminLayout>
        <div>admin content</div>
      </AdminLayout>,
    );

    expect(screen.getByText("admin content")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
