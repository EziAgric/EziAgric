import { render, screen } from "@testing-library/react";
import { FinancialSummary } from "../FinancialSummary";
import type { TradeDetail } from "@/types/trade";

const baseTrade: TradeDetail = {
  id: "TRD-12345",
  commodity: "Soybeans",
  quantity: "20 Tons",
  category: "Grains",
  status: "IN TRANSIT",
  initiatedAt: "Apr 20, 2026",
  buyer: {
    name: "Acme Buyer",
    walletAddress: "GBCBUYER000000000000000000000000000000000000000000000001",
    trustScore: 88,
  },
  seller: {
    name: "Delta Seller",
    walletAddress: "GBCSELLER00000000000000000000000000000000000000000000001",
    trustScore: 94,
  },
  vaultAmountLocked: 25000,
  assetValue: 1250000,
  platformFeePercent: 2,
  platformFee: 25000,
  networkGasEst: "0.013",
  contractId: "AMN-CTR-11",
  incoterms: "FOB",
  originPort: "Lagos",
  destinationPort: "Tema",
  eta: "May 1, 2026",
  carrier: "Swift Logistics",
  timeline: [],
};

describe("FinancialSummary", () => {
  it("renders the summary header and line item labels", () => {
    render(<FinancialSummary trade={baseTrade} />);

    expect(screen.getByRole("heading", { name: "Financial Summary" })).toBeInTheDocument();
    expect(screen.getByText("All amounts in cNGN")).toBeInTheDocument();
    expect(screen.getByText("Vault Amount Locked")).toBeInTheDocument();
    expect(screen.getByText("Asset Value")).toBeInTheDocument();
    expect(screen.getByText("Platform Fee (2%)")).toBeInTheDocument();
    expect(screen.getByText("Network Gas Est.")).toBeInTheDocument();
    expect(screen.getByText("SMART CONTRACT SECURED")).toBeInTheDocument();
  });

  it("formats the locked vault amount and its NGN equivalent", () => {
    render(<FinancialSummary trade={baseTrade} />);

    expect(screen.getByText("25,000")).toBeInTheDocument();
    // 25,000 cNGN × 1,600 = 40,000,000 NGN
    expect(screen.getByText("≈ ₦40,000,000 NGN")).toBeInTheDocument();
  });

  it("formats asset value, platform fee and gas estimate", () => {
    render(<FinancialSummary trade={baseTrade} />);

    expect(screen.getByText("1,250,000 cNGN")).toBeInTheDocument();
    expect(screen.getByText("25,000 cNGN")).toBeInTheDocument();
    expect(screen.getByText("0.013 ETH")).toBeInTheDocument();
  });

  it("formats fractional amounts and rounds the NGN equivalent", () => {
    render(
      <FinancialSummary
        trade={{
          ...baseTrade,
          vaultAmountLocked: 1234.56,
          assetValue: 9876.5,
          platformFeePercent: 1.5,
          platformFee: 148.15,
        }}
      />,
    );

    expect(screen.getByText("1,234.56")).toBeInTheDocument();
    // 1,234.56 × 1,600 = 1,975,296 NGN
    expect(screen.getByText("≈ ₦1,975,296 NGN")).toBeInTheDocument();
    expect(screen.getByText("Platform Fee (1.5%)")).toBeInTheDocument();
    expect(screen.getByText("9,876.5 cNGN")).toBeInTheDocument();
    expect(screen.getByText("148.15 cNGN")).toBeInTheDocument();
  });

  it("renders zero amounts without errors", () => {
    render(
      <FinancialSummary
        trade={{
          ...baseTrade,
          vaultAmountLocked: 0,
          assetValue: 0,
          platformFee: 0,
        }}
      />,
    );

    expect(screen.getByText("≈ ₦0 NGN")).toBeInTheDocument();
    expect(screen.getAllByText("0 cNGN")).toHaveLength(2);
  });
});
