import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WalletStateCallout } from "../WalletStateCallout";

jest.mock("@/lib/analytics", () => ({ trackEvent: jest.fn(), trackFailure: jest.fn() }));

describe("WalletStateCallout", () => {
  it("renders nothing when connected", () => {
    const { container } = render(
      <WalletStateCallout state="connected" onAction={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("absent: prompts to install with a Freighter link", () => {
    render(<WalletStateCallout state="absent" onAction={jest.fn()} />);
    expect(screen.getByRole("alert")).toHaveAttribute("data-wallet-state", "absent");
    expect(screen.getByRole("link")).toHaveAttribute("href", expect.stringContaining("freighter.app"));
  });

  it("locked: fires the unlock action", async () => {
    const onAction = jest.fn();
    const user = userEvent.setup();
    render(<WalletStateCallout state="locked" onAction={onAction} />);
    await user.click(screen.getByRole("button"));
    expect(onAction).toHaveBeenCalledWith("unlock");
  });

  it("wrong-network: names the target network and fires switch-network", async () => {
    const onAction = jest.fn();
    const user = userEvent.setup();
    render(
      <WalletStateCallout state="wrong-network" expectedNetwork="Testnet" onAction={onAction} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Testnet");
    await user.click(screen.getByRole("button", { name: /testnet/i }));
    expect(onAction).toHaveBeenCalledWith("switch-network");
  });

  it("connecting: shows a live status, not an alert", () => {
    render(<WalletStateCallout state="connecting" onAction={jest.fn()} />);
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("rejected: offers a retry", async () => {
    const onAction = jest.fn();
    const user = userEvent.setup();
    render(<WalletStateCallout state="rejected" onAction={onAction} />);
    await user.click(screen.getByRole("button"));
    expect(onAction).toHaveBeenCalledWith("retry");
  });
});
