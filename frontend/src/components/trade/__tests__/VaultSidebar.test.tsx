import { render, screen } from "@testing-library/react";
import { VaultSidebar } from "../VaultSidebar";
import type { TradeDetail } from "@/types/trade";

const trade = {
  id: "TRD-12345",
  vaultAmountLocked: 25000,
  assetValue: 24000,
  platformFeePercent: 2,
  platformFee: 480,
  networkGasEst: "0.013",
} as TradeDetail;

describe("VaultSidebar", () => {
  it("mounts the vault, breakdown, contract badge and dispute sections", () => {
    render(<VaultSidebar trade={trade} />);

    expect(screen.getByText("Vault Amount Locked")).toBeInTheDocument();
    expect(screen.getByText("Asset Value")).toBeInTheDocument();
    expect(screen.getByText("Platform Fee (2%)")).toBeInTheDocument();
    expect(screen.getByText("Network Gas Est.")).toBeInTheDocument();
    expect(screen.getByText("SMART CONTRACT SECURED")).toBeInTheDocument();
    expect(screen.getByText("Dispute Resolution")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Ticket" })).toBeInTheDocument();
  });

  it("renders the trade's financial values", () => {
    render(<VaultSidebar trade={trade} />);

    expect(screen.getByText((25000).toLocaleString())).toBeInTheDocument();
    expect(screen.getByText(`${(24000).toLocaleString()} cNGN`)).toBeInTheDocument();
    expect(screen.getByText(`${(480).toLocaleString()} cNGN`)).toBeInTheDocument();
    expect(screen.getByText("0.013 ETH")).toBeInTheDocument();
  });

  it("updates the displayed values when the trade state changes", () => {
    const { rerender } = render(<VaultSidebar trade={trade} />);
    expect(screen.getByText("Platform Fee (2%)")).toBeInTheDocument();

    rerender(
      <VaultSidebar
        trade={{ ...trade, vaultAmountLocked: 0, platformFeePercent: 5, platformFee: 1200 }}
      />,
    );

    expect(screen.queryByText("Platform Fee (2%)")).not.toBeInTheDocument();
    expect(screen.getByText("Platform Fee (5%)")).toBeInTheDocument();
    expect(screen.getByText(`${(1200).toLocaleString()} cNGN`)).toBeInTheDocument();
    expect(screen.queryByText(`${(480).toLocaleString()} cNGN`)).not.toBeInTheDocument();
    expect(screen.queryByText((25000).toLocaleString())).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
