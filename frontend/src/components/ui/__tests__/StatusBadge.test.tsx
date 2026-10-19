import { render, screen } from "@testing-library/react";
import { StatusBadge } from "../StatusBadge";
import { TRADE_STATUSES, toTradeStatus } from "@/types/trade";

describe("StatusBadge", () => {
  it.each([
    ["IN TRANSIT", "In Transit"],
    ["PENDING", "Pending"],
    ["SETTLED", "Settled"],
    ["DISPUTED", "Disputed"],
    ["DRAFT", "Draft"],
  ] as const)("renders the canonical %s status as %s", (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("renders every canonical status without crashing", () => {
    TRADE_STATUSES.forEach((status) => {
      const { unmount } = render(<StatusBadge status={status} size="sm" showIcon={false} />);
      unmount();
    });
  });

  it("renders backend statuses once mapped through toTradeStatus", () => {
    render(<StatusBadge status={toTradeStatus("FUNDED")} />);
    expect(screen.getByText("In Transit")).toBeInTheDocument();
  });
});
