import { render, screen } from "@testing-library/react";
import { ForbiddenState } from "../ForbiddenState";

describe("ForbiddenState", () => {
  it("renders default admin-access-denied copy", () => {
    render(<ForbiddenState />);
    expect(screen.getByText("Admin Access Required")).toBeInTheDocument();
    expect(screen.getByText("You don't have permission to view this page.")).toBeInTheDocument();
  });

  it("directs the user to contact support by default", () => {
    render(<ForbiddenState />);
    expect(screen.getByText(/contact support/i)).toBeInTheDocument();
  });

  it("includes a support contact when provided", () => {
    render(<ForbiddenState supportContact="support@example.com" />);
    expect(screen.getByText(/support@example\.com/)).toBeInTheDocument();
  });

  it("renders custom title and message", () => {
    render(<ForbiddenState title="Nope" message="Not for you" />);
    expect(screen.getByText("Nope")).toBeInTheDocument();
    expect(screen.getByText("Not for you")).toBeInTheDocument();
  });

  it("exposes an alert role for accessibility", () => {
    render(<ForbiddenState />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
