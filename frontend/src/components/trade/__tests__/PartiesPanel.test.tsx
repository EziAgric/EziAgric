import { render, screen, within } from "@testing-library/react";
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
  trustScore: 40,
  avatar: "https://example.com/seller.png",
};

describe("PartiesPanel", () => {
  it("renders buyer and seller names, roles and trust scores", () => {
    render(<PartiesPanel buyer={buyer} seller={seller} />);

    expect(screen.getByText("Trade Parties")).toBeInTheDocument();
    expect(screen.getByText("THE BUYER")).toBeInTheDocument();
    expect(screen.getByText("THE SELLER")).toBeInTheDocument();
    expect(screen.getByText("Acme Buyer")).toBeInTheDocument();
    expect(screen.getByText("Delta Seller")).toBeInTheDocument();
    expect(screen.getByText("88")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
  });

  it("shows the first letter of the name when no avatar is provided and an image when it is", () => {
    render(<PartiesPanel buyer={buyer} seller={seller} />);

    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByAltText("Delta Seller")).toHaveAttribute(
      "src",
      "https://example.com/seller.png",
    );
  });

  it("truncates wallet addresses to first 6 + last 4 characters", () => {
    render(<PartiesPanel buyer={buyer} seller={seller} />);

    expect(screen.getByText("GBCBUY...0001")).toBeInTheDocument();
    expect(screen.getByText("GBCSEL...0001")).toBeInTheDocument();
    expect(screen.queryByText(buyer.walletAddress)).not.toBeInTheDocument();
  });

  it("renders the trust score stars proportional to the score", () => {
    const { container } = render(<PartiesPanel buyer={buyer} seller={seller} />);
    const cards = container.querySelectorAll(".flex-1");
    const filled = (card: Element) => card.querySelectorAll("svg.fill-gold").length;

    expect(cards).toHaveLength(2);
    expect(filled(cards[0])).toBe(4); // round(88 / 20)
    expect(filled(cards[1])).toBe(2); // round(40 / 20)
    expect(within(cards[0] as HTMLElement).getByText("Trust Score")).toBeInTheDocument();
  });
});
