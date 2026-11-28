import { render, screen } from "@testing-library/react";
import { ContractInfo } from "../ContractInfo";
import type { TradeDetail } from "@/types/trade";

const fullTrade: TradeDetail = {
  id: "TRD-90001",
  commodity: "Cocoa Beans",
  quantity: "10 Tons",
  category: "Cash Crops",
  status: "IN TRANSIT",
  initiatedAt: "May 2, 2026",
  buyer: {
    name: "Kano Buyers Ltd",
    walletAddress: "GBUYERWALLET0000000000000000000000000000000000000000001",
    trustScore: 90,
  },
  seller: {
    name: "Ondo Cocoa Co",
    walletAddress: "GSELLERWALLET000000000000000000000000000000000000000001",
    trustScore: 85,
  },
  vaultAmountLocked: 50000,
  assetValue: 49000,
  platformFeePercent: 1,
  platformFee: 490,
  networkGasEst: "0.010",
  contractId: "AMN-CTR-42",
  incoterms: "CIF",
  originPort: "Apapa",
  destinationPort: "Rotterdam",
  eta: "Jun 10, 2026",
  etaLabel: "14 days",
  carrier: "Atlantic Freight",
  timeline: [],
  lossRatios: [
    { label: "Spoilage risk", value: 25 },
    { label: "Transit risk", value: 70 },
  ],
};

describe("ContractInfo", () => {
  const originalNetwork = process.env.NEXT_PUBLIC_STELLAR_NETWORK;

  afterEach(() => {
    if (originalNetwork === undefined) {
      delete process.env.NEXT_PUBLIC_STELLAR_NETWORK;
    } else {
      process.env.NEXT_PUBLIC_STELLAR_NETWORK = originalNetwork;
    }
  });

  function expectContractLink(href: string) {
    const link = screen.getByRole("link", { name: fullTrade.contractId });
    expect(link).toHaveAttribute("href", href);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }

  it("links the contract ID to the public Stellar Expert explorer by default", () => {
    delete process.env.NEXT_PUBLIC_STELLAR_NETWORK;

    render(<ContractInfo trade={fullTrade} />);

    expectContractLink(
      "https://stellar.expert/explorer/public/contract/AMN-CTR-42"
    );
  });

  it("uses the testnet explorer when NEXT_PUBLIC_STELLAR_NETWORK is testnet", () => {
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "testnet";

    render(<ContractInfo trade={fullTrade} />);

    expectContractLink(
      "https://stellar.expert/explorer/testnet/contract/AMN-CTR-42"
    );
  });

  it("encodes the contract ID in the explorer URL", () => {
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "public";
    const contractId = "AMN/CTR 42";

    render(<ContractInfo trade={{ ...fullTrade, contractId }} />);

    const link = screen.getByRole("link", { name: contractId });
    expect(link).toHaveAttribute(
      "href",
      "https://stellar.expert/explorer/public/contract/AMN%2FCTR%2042"
    );
  });

  it("renders the key contract metadata fields from a full trade", () => {
    render(<ContractInfo trade={fullTrade} />);

    expect(screen.getByText("Contract Details")).toBeInTheDocument();

    const fields: [string, string][] = [
      ["Contract ID", "AMN-CTR-42"],
      ["Incoterms", "CIF"],
      ["Origin Port", "Apapa"],
      ["ETA", "Jun 10, 2026"],
      ["Carrier", "Atlantic Freight"],
    ];
    fields.forEach(([label, value]) => {
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText(value)).toBeInTheDocument();
    });

    // Destination port shows in the meta grid and on the destination card.
    expect(screen.getByText("Dest. Port")).toBeInTheDocument();
    expect(screen.getAllByText("Rotterdam")).toHaveLength(2);
    expect(screen.getByText("ETA: 14 days")).toBeInTheDocument();

    expect(screen.getByText("Buyer Wallet")).toBeInTheDocument();
    expect(screen.getByText("Seller Wallet")).toBeInTheDocument();
  });

  it("renders loss ratio bars with their percentages", () => {
    render(<ContractInfo trade={fullTrade} />);

    expect(screen.getByText("Loss Ratios")).toBeInTheDocument();
    expect(screen.getByText("Spoilage risk")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("Transit risk")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
  });

  it("does not crash when optional contract fields are missing", () => {
    const { etaLabel: _etaLabel, lossRatios: _lossRatios, ...rest } = fullTrade;
    const minimalTrade: TradeDetail = rest;

    expect(() => render(<ContractInfo trade={minimalTrade} />)).not.toThrow();

    expect(screen.getByText("AMN-CTR-42")).toBeInTheDocument();
    expect(screen.queryByText("Loss Ratios")).not.toBeInTheDocument();
    expect(screen.queryByText(/^ETA: /)).not.toBeInTheDocument();
  });

  it("hides the loss ratio section when the list is empty", () => {
    render(<ContractInfo trade={{ ...fullTrade, lossRatios: [] }} />);

    expect(screen.queryByText("Loss Ratios")).not.toBeInTheDocument();
  });
});
