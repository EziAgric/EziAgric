import { render, screen } from "@testing-library/react";
import { FeeBreakdown } from "../FeeBreakdown";

describe("FeeBreakdown", () => {
  it("shows gross, the 1% platform fee and the seller net", () => {
    render(<FeeBreakdown gross={5000} />);

    expect(screen.getByRole("group", { name: "Fee breakdown" })).toBeInTheDocument();
    expect(screen.getByText("Gross amount")).toBeInTheDocument();
    expect(screen.getByText("5,000 cNGN")).toBeInTheDocument();
    expect(screen.getByText("Platform fee (1%)")).toBeInTheDocument();
    expect(screen.getByText("− 50 cNGN")).toBeInTheDocument();
    expect(screen.getByText("Seller receives")).toBeInTheDocument();
    expect(screen.getByText("4,950 cNGN")).toBeInTheDocument();
  });

  it("respects a custom fee rate", () => {
    render(<FeeBreakdown gross={1000} feeBps={250} />);

    expect(screen.getByText("Platform fee (2.5%)")).toBeInTheDocument();
    expect(screen.getByText("− 25 cNGN")).toBeInTheDocument();
    expect(screen.getByText("975 cNGN")).toBeInTheDocument();
  });

  it("renders an optional network fee row", () => {
    render(<FeeBreakdown gross={1000} networkFee="0.013 XLM" />);
    expect(screen.getByText("Network fee (est.)")).toBeInTheDocument();
    expect(screen.getByText("0.013 XLM")).toBeInTheDocument();
  });

  it("honours explicit fee/net overrides", () => {
    render(<FeeBreakdown gross={1000} fee={11} net={989} />);
    expect(screen.getByText("− 11 cNGN")).toBeInTheDocument();
    expect(screen.getByText("989 cNGN")).toBeInTheDocument();
  });

  it("handles decimal amounts without float drift", () => {
    render(<FeeBreakdown gross="12.50" />);
    expect(screen.getByText("− 0.12 cNGN")).toBeInTheDocument();
    expect(screen.getByText("12.38 cNGN")).toBeInTheDocument();
  });
});
