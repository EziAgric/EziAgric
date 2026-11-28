import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WalletAddressBadge } from "../WalletAddressBadge";

describe("WalletAddressBadge", () => {
  const address = "GBRPYHIL2CI3BFFWUW6A4HNE2ON4ZVQ4V4SZW4QFWK3DEMO1234";

  it("renders truncated address with copy action", () => {
    render(<WalletAddressBadge address={address} showCopy showExplorer={false} />);

    expect(screen.getByText("GBRPYH...1234")).toBeInTheDocument();
    expect(screen.getByLabelText("Copy wallet address")).toBeInTheDocument();
  });

  it("renders explorer URL for selected network", () => {
    render(
      <WalletAddressBadge
        address={address}
        showCopy={false}
        showExplorer
        explorerNetwork="public"
      />,
    );

    expect(screen.getByLabelText("Open wallet in Stellar Expert")).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/public/account/${address}`,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("triggers clipboard write on copy click", async () => {
    jest.useFakeTimers();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    const { container } = render(<WalletAddressBadge address={address} showCopy showExplorer={false} />);
    fireEvent.click(screen.getByLabelText("Copy wallet address"));

    expect(writeText).toHaveBeenCalledWith(address);

    // Wait for the checkmark to appear in the UI (copied = true)
    await waitFor(() => {
      expect(container.querySelector(".text-emerald")).toBeInTheDocument();
    });

    // Fast-forward the timeout (copied = false) to prevent state updates after the test completes
    act(() => {
      jest.runAllTimers();
    });
  });
});
