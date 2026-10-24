import { render, screen } from "@testing-library/react";
import { TradeHeader } from "../TradeHeader";
import type { TradeDetail, TradeStatus } from "@/types/trade";

const baseTrade = {
  id: "TRD-12345",
  commodity: "Soybeans",
  quantity: "20 Tons",
  category: "Grains",
  status: "IN TRANSIT",
  initiatedAt: "Apr 20, 2026",
} as TradeDetail;

<<<<<<< HEAD
describe("TradeHeader", () => {
  it("renders trade id, status and commodity", () => {
    render(<TradeHeader trade={baseTrade} />);

    expect(screen.getByText("TRD-12345")).toBeInTheDocument();
    expect(screen.getByText("IN TRANSIT")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "20 Tons Soybeans" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Grains")).toBeInTheDocument();
    expect(screen.getByText("Initiated Apr 20, 2026")).toBeInTheDocument();
  });

  it("renders distinct styles for different statuses", () => {
    const badgeClass = (status: TradeStatus) => {
      const { unmount } = render(<TradeHeader trade={{ ...baseTrade, status }} />);
      const className = screen.getByText(status).className;
      unmount();
      return className;
    };

    const inTransit = badgeClass("IN TRANSIT");
    const disputed = badgeClass("DISPUTED");

    expect(inTransit).toContain("text-emerald");
    expect(disputed).toContain("text-status-danger");
    expect(inTransit).not.toEqual(disputed);
=======
function renderHeader(status: TradeStatus) {
  render(<TradeHeader trade={{ ...baseTrade, status }} />);
  return screen.getByText(status).closest("span") as HTMLElement;
}

describe("TradeHeader", () => {
  it("renders trade id, quantity, commodity, status, date and category", () => {
    renderHeader("IN TRANSIT");

    expect(screen.getByText("TRD-12345")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "20 Tons Soybeans" }),
    ).toBeInTheDocument();
    expect(screen.getByText("IN TRANSIT")).toBeInTheDocument();
    expect(screen.getByText(/Initiated Apr 20, 2026/)).toBeInTheDocument();
    expect(screen.getByText("Grains")).toBeInTheDocument();
  });

  it("renders the action buttons", () => {
    renderHeader("IN TRANSIT");

    expect(screen.getByRole("button", { name: /View Contract/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirm Delivery/ })).toBeInTheDocument();
  });

  it("renders distinct styles for different statuses", () => {
    const inTransit = renderHeader("IN TRANSIT");
    expect(inTransit).toHaveClass("text-emerald");
    document.body.innerHTML = "";

    const disputed = renderHeader("DISPUTED");
    expect(disputed).toHaveClass("text-status-danger");
    expect(disputed).not.toHaveClass("text-emerald");
    document.body.innerHTML = "";

    const settled = renderHeader("SETTLED");
    expect(settled).toHaveClass("text-status-info");
    expect(settled).not.toHaveClass("text-status-danger");
>>>>>>> pr-765
  });
});
