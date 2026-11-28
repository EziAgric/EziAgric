import { render, screen } from "@testing-library/react";
import { VaultSidebar } from "../VaultSidebar";
import type { TradeDetail } from "@/types/trade";

const baseTrade = {
  id: "TRD-12345",
  status: "IN TRANSIT",
  vaultAmountLocked: 25000,
  assetValue: 24000,
  platformFeePercent: 2,
  platformFee: 480,
  networkGasEst: "0.013",
} as TradeDetail;

describe("VaultSidebar", () => {
  it("renders the vault sections for a trade", () => {
    render(<VaultSidebar trade={baseTrade} />);

    expect(screen.getByText("Vault Amount Locked")).toBeInTheDocument();
    expect(screen.getByText("25,000")).toBeInTheDocument();
    expect(screen.getByText("Asset Value")).toBeInTheDocument();
    expect(screen.getByText("24,000 cNGN")).toBeInTheDocument();
    expect(screen.getByText("Platform Fee (2%)")).toBeInTheDocument();
    expect(screen.getByText("480 cNGN")).toBeInTheDocument();
    expect(screen.getByText("Network Gas Est.")).toBeInTheDocument();
    expect(screen.getByText("0.013 ETH")).toBeInTheDocument();
    expect(screen.getByText("SMART CONTRACT SECURED")).toBeInTheDocument();
    expect(screen.getByText("Dispute Resolution")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Ticket" })).toBeInTheDocument();
  });

  it("updates amounts when the trade state changes", () => {
    const { rerender } = render(<VaultSidebar trade={baseTrade} />);
    expect(screen.getByText("25,000")).toBeInTheDocument();

    rerender(
      <VaultSidebar
        trade={{
          ...baseTrade,
          status: "SETTLED",
          vaultAmountLocked: 0,
          platformFeePercent: 5,
          platformFee: 1200,
        }}
      />,
    );

    expect(screen.queryByText("25,000")).not.toBeInTheDocument();
    expect(screen.getByText("Platform Fee (5%)")).toBeInTheDocument();
    expect(screen.getByText("1,200 cNGN")).toBeInTheDocument();
  });
});
