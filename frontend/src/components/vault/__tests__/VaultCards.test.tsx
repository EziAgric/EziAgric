import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { NetworkBackboneCard } from "../NetworkBackboneCard";
import { PaymentOverviewCard } from "../PaymentOverviewCard";
import { VaultFooter } from "../VaultFooter";

jest.mock("@/components/ui/BentoCard", () => ({
  BentoCard: ({
    children,
    title,
    icon,
  }: {
    children: React.ReactNode;
    title?: string;
    icon?: React.ReactNode;
  }) => (
    <div data-testid="bento-card">
      {title && <h3>{title}</h3>}
      {icon}
      {children}
    </div>
  ),
}));

describe("NetworkBackboneCard", () => {
  it("renders the title, description and Stellar logo", () => {
    render(<NetworkBackboneCard description="Settled on the Stellar network." />);

    expect(screen.getByText("Network Backbone")).toBeInTheDocument();
    expect(screen.getByText("Settled on the Stellar network.")).toBeInTheDocument();
    expect(screen.getByAltText("stellar logo")).toBeInTheDocument();
  });

  it("reflects a different description prop", () => {
    render(<NetworkBackboneCard description="Another network note." />);

    expect(screen.getByText("Another network note.")).toBeInTheDocument();
  });
});

describe("PaymentOverviewCard", () => {
  const format = (n: number) => n.toLocaleString("en-NG", { maximumFractionDigits: 2 });

  it("renders the cNGN amounts derived from totalCngn by default", () => {
    render(<PaymentOverviewCard totalCngn={10000} />);

    expect(screen.getByText("Vault Escrow Summary")).toBeInTheDocument();
    expect(screen.getByText("Total Trade Value")).toBeInTheDocument();
    // Total trade value and the locked amount both show the full total.
    expect(screen.getAllByText("10,000 cNGN")).toHaveLength(2);
    expect(screen.getByText("100 cNGN")).toBeInTheDocument();
    expect(screen.getByText("9,900 cNGN")).toBeInTheDocument();
    expect(screen.getByText("Locked in cNGN")).toBeInTheDocument();
  });

  it("switches amounts to NGN using the default rate of 1580", () => {
    render(<PaymentOverviewCard totalCngn={10000} />);

    fireEvent.click(screen.getByRole("button", { name: "NGN" }));

    expect(screen.getAllByText(`₦${format(10000 * 1580)}`)).toHaveLength(2);
    expect(screen.getByText(`₦${format(100 * 1580)}`)).toBeInTheDocument();
    expect(screen.getByText(`₦${format(9900 * 1580)}`)).toBeInTheDocument();
  });

  it("uses a custom ngnRate when provided", () => {
    render(<PaymentOverviewCard totalCngn={1000} ngnRate={2} />);

    fireEvent.click(screen.getByRole("button", { name: "NGN" }));

    expect(screen.getAllByText("₦2,000")).toHaveLength(2);
    expect(screen.getByText("₦20")).toBeInTheDocument();
    expect(screen.getByText("₦1,980")).toBeInTheDocument();
  });

  it("switches back to cNGN", () => {
    render(<PaymentOverviewCard totalCngn={1000} />);

    fireEvent.click(screen.getByRole("button", { name: "NGN" }));
    fireEvent.click(screen.getByRole("button", { name: "cNGN" }));

    expect(screen.getAllByText("1,000 cNGN")).toHaveLength(2);
  });
});

describe("VaultFooter", () => {
  const props = {
    version: "v2.4.1",
    links: [
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
    ],
    socialLinks: [
      { platform: "x" as const, href: "https://x.com/amana" },
      { platform: "discord" as const, href: "https://discord.gg/amana" },
    ],
  };

  it("renders the version string", () => {
    render(<VaultFooter {...props} />);

    expect(screen.getByText("Amana Digital Custody Systems v2.4.1")).toBeInTheDocument();
  });

  it("renders footer links with the given hrefs", () => {
    render(<VaultFooter {...props} />);

    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  });

  it("renders one link per social entry with the given hrefs", () => {
    const { container } = render(<VaultFooter {...props} />);

    expect(screen.getByText("Connect With Us")).toBeInTheDocument();
    expect(container.querySelector('a[href="https://x.com/amana"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="https://discord.gg/amana"]')).toBeInTheDocument();
  });
});
