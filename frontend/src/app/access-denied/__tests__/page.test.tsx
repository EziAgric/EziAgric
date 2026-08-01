import { render, screen } from "@testing-library/react";
import AccessDeniedPage from "../page";

describe("AccessDeniedPage", () => {
  it("renders the forbidden state for a redirected caller", () => {
    render(<AccessDeniedPage />);

    expect(screen.getByTestId("access-denied-page")).toBeInTheDocument();
    expect(screen.getByTestId("forbidden-state")).toBeInTheDocument();
    expect(screen.getByText("Access Denied")).toBeInTheDocument();
  });
});
