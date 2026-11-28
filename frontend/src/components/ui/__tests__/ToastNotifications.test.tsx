import React from "react";
import { render, screen, act } from "@testing-library/react";
import { Toast } from "../Toast";
import { ToastContainer } from "../ToastContainer";
import { ToastProvider, useToast } from "@/hooks/useToast";

describe("Toast action link (#422)", () => {
  it("renders a Stellar Expert link that opens in a new tab", () => {
    render(
      <Toast
        id="1"
        type="info"
        title="Pending"
        message="Trade created submitted"
        link={{
          href: "https://stellar.expert/explorer/testnet/tx/abc",
          label: "View on Stellar Expert",
        }}
        duration={0}
        onClose={jest.fn()}
      />,
    );

    const link = screen.getByRole("link", { name: /view on stellar expert/i });
    expect(link).toHaveAttribute(
      "href",
      "https://stellar.expert/explorer/testnet/tx/abc",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("omits the link when none is provided", () => {
    render(
      <Toast id="1" type="info" message="no link" duration={0} onClose={jest.fn()} />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("ToastContainer accessibility (#422)", () => {
  function Seeder() {
    const { addToast } = useToast();
    React.useEffect(() => {
      addToast({ type: "success", message: "Done", duration: 0 });
    }, [addToast]);
    return null;
  }

  it("exposes an aria-live notification region", async () => {
    await act(async () => {
      render(
        <ToastProvider>
          <Seeder />
          <ToastContainer />
        </ToastProvider>,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const region = screen.getByRole("region", { name: /notifications/i });
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Done")).toBeInTheDocument();
  });
});
