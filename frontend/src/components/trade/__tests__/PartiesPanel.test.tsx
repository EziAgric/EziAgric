import { render, screen } from "@testing-library/react";
import { PartiesPanel } from "../PartiesPanel";
import type { TradeParty } from "@/types/trade";

const buyer: TradeParty = {
  name: "Acme Buyer",
  walletAddress: "GBCBUYER000000000000000000000000000000000000000000000001",
  trustScore: 88,
};

const seller: TradeParty = {
  name: "Delta Seller",
  walletAddress: "GBCSELLER00000000000000000000000000000000000000000000001",
  trustScore: 94,
};

describe("PartiesPanel", () => {
  it("renders buyer and seller info", () => {
    render(<PartiesPanel buyer={buyer} seller={seller} />);

    expect(screen.getByText("Trade Parties")).toBeInTheDocument();
    expect(screen.getByText("THE BUYER")).toBeInTheDocument();
    expect(screen.getByText("THE SELLER")).toBeInTheDocument();
    expect(screen.getByText("Acme Buyer")).toBeInTheDocument();
    expect(screen.getByText("Delta Seller")).toBeInTheDocument();
    expect(screen.getByText("88")).toBeInTheDocument();
    expect(screen.getByText("94")).toBeInTheDocument();
  });

  it("truncates wallet addresses to first 6 and last 4 characters", () => {
    render(<PartiesPanel buyer={buyer} seller={seller} />);

    expect(screen.getByText("GBCBUY...0001")).toBeInTheDocument();
    expect(screen.getByText("GBCSEL...0001")).toBeInTheDocument();
    expect(screen.queryByText(buyer.walletAddress)).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Copy wallet address")).toHaveLength(2);
  });

  it("renders an avatar image when provided and an initial otherwise", () => {
    render(
      <PartiesPanel
        buyer={{ ...buyer, avatar: "https://example.com/buyer.png" }}
        seller={seller}
      />,
    );

    expect(screen.getByAltText("Acme Buyer")).toHaveAttribute(
      "src",
      "https://example.com/buyer.png",
    );
    expect(screen.getByText("D")).toBeInTheDocument();
  });
});
