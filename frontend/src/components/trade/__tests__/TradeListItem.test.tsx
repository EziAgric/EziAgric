import { fireEvent, render, screen } from "@testing-library/react";
import { TradeListItem, type TradeListItemProps } from "../TradeListItem";
import type { TradeStatus } from "@/types/trade";

const COUNTERPARTY_ADDRESS =
  "GBCSELLER00000000000000000000000000000000000000000000XYZ9";

function renderItem(overrides: Partial<TradeListItemProps> = {}) {
  const props: TradeListItemProps = {
    tradeId: "TRD-12345",
    commodity: "Soybeans",
    counterparty: { role: "Seller", address: COUNTERPARTY_ADDRESS },
    amountCngn: "25,000",
    status: "IN TRANSIT",
    createdAt: "Apr 20, 2026",
    onView: jest.fn(),
    ...overrides,
  };

  render(<TradeListItem {...props} />);
  return props;
}

function getRow() {
  return screen.getByRole("button", { name: /^View trade TRD-12345 —/ });
}

describe("TradeListItem", () => {
  it("renders trade details with a truncated counterparty address", () => {
    renderItem();

    expect(screen.getByText("Soybeans")).toBeInTheDocument();
    expect(screen.getByText("Seller")).toBeInTheDocument();
    expect(screen.getByText("TRD-12345")).toBeInTheDocument();
    expect(screen.getByText("GBCSEL…XYZ9")).toBeInTheDocument();
    expect(screen.queryByText(COUNTERPARTY_ADDRESS)).not.toBeInTheDocument();
  });

  it("does not truncate short addresses", () => {
    renderItem({ counterparty: { role: "Buyer", address: "GSHORT123" } });

    expect(screen.getByText("GSHORT123")).toBeInTheDocument();
  });

  describe("onView", () => {
    it("fires when the row is clicked", () => {
      const { onView } = renderItem();

      fireEvent.click(getRow());

      expect(onView).toHaveBeenCalledTimes(1);
    });

    it.each(["Enter", " "])("fires on %p keydown", (key) => {
      const { onView } = renderItem();

      fireEvent.keyDown(getRow(), { key });

      expect(onView).toHaveBeenCalledTimes(1);
    });

    it("ignores other keys", () => {
      const { onView } = renderItem();

      fireEvent.keyDown(getRow(), { key: "Tab" });
      fireEvent.keyDown(getRow(), { key: "a" });

      expect(onView).not.toHaveBeenCalled();
    });

    it("fires once when the view icon button is clicked", () => {
      const { onView } = renderItem();

      fireEvent.click(screen.getByRole("button", { name: "View trade TRD-12345" }));

      expect(onView).toHaveBeenCalledTimes(1);
    });
  });

  describe("deposit and withdraw actions", () => {
    it("does not render deposit or withdraw buttons without handlers", () => {
      renderItem();

      expect(
        screen.queryByRole("button", { name: "Deposit for trade TRD-12345" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Withdraw for trade TRD-12345" }),
      ).not.toBeInTheDocument();
    });

    it("renders only the deposit button when only onDeposit is passed", () => {
      const onDeposit = jest.fn();
      const { onView } = renderItem({ onDeposit });

      fireEvent.click(
        screen.getByRole("button", { name: "Deposit for trade TRD-12345" }),
      );

      expect(onDeposit).toHaveBeenCalledTimes(1);
      expect(onView).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("button", { name: "Withdraw for trade TRD-12345" }),
      ).not.toBeInTheDocument();
    });

    it("renders only the withdraw button when only onWithdraw is passed", () => {
      const onWithdraw = jest.fn();
      const { onView } = renderItem({ onWithdraw });

      fireEvent.click(
        screen.getByRole("button", { name: "Withdraw for trade TRD-12345" }),
      );

      expect(onWithdraw).toHaveBeenCalledTimes(1);
      expect(onView).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("button", { name: "Deposit for trade TRD-12345" }),
      ).not.toBeInTheDocument();
    });

    it("renders both buttons when both handlers are passed", () => {
      renderItem({ onDeposit: jest.fn(), onWithdraw: jest.fn() });

      expect(
        screen.getByRole("button", { name: "Deposit for trade TRD-12345" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Withdraw for trade TRD-12345" }),
      ).toBeInTheDocument();
    });
  });

  describe("status styling", () => {
    it("applies the style for a known status", () => {
      renderItem({ status: "DISPUTED" });

      expect(screen.getByText("DISPUTED")).toHaveClass("bg-status-danger/10");
    });

    it("falls back to the DRAFT style for an unknown status without throwing", () => {
      const unknownStatus = "ARCHIVED" as TradeStatus;

      expect(() => renderItem({ status: unknownStatus })).not.toThrow();

      const badge = screen.getByText("ARCHIVED");
      expect(badge).toHaveClass("bg-status-draft/10", "text-status-draft");
      expect(badge.className).not.toContain("undefined");
    });
  });
});
