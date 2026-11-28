import { render, screen } from "@testing-library/react";
import { Breadcrumb } from "../Breadcrumb";

describe("Breadcrumb", () => {
  const mockItems = [
    { label: "Home", path: "/" },
    { label: "Streams", path: "/streams" },
    { label: "stream-123" },
  ];

  it("renders breadcrumb items correctly", () => {
    render(<Breadcrumb items={mockItems} />);

    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Streams")).toBeInTheDocument();
    expect(screen.getByText("stream-123")).toBeInTheDocument();
  });

  it("renders links for items with paths", () => {
    render(<Breadcrumb items={mockItems} />);

    const homeLink = screen.getByText("Home").closest("a");
    expect(homeLink).toHaveAttribute("href", "/");

    const streamsLink = screen.getByText("Streams").closest("a");
    expect(streamsLink).toHaveAttribute("href", "/streams");
  });

  it("does not render link for last item", () => {
    render(<Breadcrumb items={mockItems} />);

    const lastItem = screen.getByText("stream-123");
    expect(lastItem.tagName).not.toBe("A");
    expect(lastItem).toHaveAttribute("aria-current", "page");
  });

  it("renders admin action when provided", () => {
    const adminAction = {
      label: "Manage Stream",
      href: "/admin/streams/stream-123",
      icon: <svg data-testid="admin-icon" />,
    };

    render(<Breadcrumb items={mockItems} adminAction={adminAction} />);

    expect(screen.getByText("Manage Stream")).toBeInTheDocument();
    expect(screen.getByTestId("admin-icon")).toBeInTheDocument();

    const adminLink = screen.getByText("Manage Stream").closest("a");
    expect(adminLink).toHaveAttribute("href", "/admin/streams/stream-123");
  });

  it("does not render admin action when not provided", () => {
    render(<Breadcrumb items={mockItems} />);

    expect(screen.queryByText("Manage Stream")).not.toBeInTheDocument();
  });

  it("renders separators between breadcrumb items", () => {
    render(<Breadcrumb items={mockItems} />);

    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    const svgElements = nav.querySelectorAll("svg");

    // Should have separators between items (n-1 separators for n items)
    // Plus potentially one for admin action icon if present
    expect(svgElements.length).toBeGreaterThanOrEqual(mockItems.length - 1);
  });

  it("applies correct accessibility attributes", () => {
    render(<Breadcrumb items={mockItems} />);

    const nav = screen.getByRole("navigation");
    expect(nav).toHaveAttribute("aria-label", "Breadcrumb");

    const list = nav.querySelector("ol");
    expect(list).toBeInTheDocument();
  });
});
