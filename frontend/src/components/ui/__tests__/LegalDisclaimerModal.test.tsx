import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LegalDisclaimerModal } from "../LegalDisclaimerModal";

const baseProps = {
  lossRatio: { buyer: 5000, seller: 5000 },
  tradeValueCngn: "1000",
};

function Harness({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <LegalDisclaimerModal
        {...baseProps}
        isOpen={open}
        onAccept={() => {
          onAccept();
          setOpen(false);
        }}
        onDecline={() => {
          onDecline();
          setOpen(false);
        }}
      />
    </>
  );
}

describe("LegalDisclaimerModal", () => {
  it("does not render until opened", () => {
    render(<LegalDisclaimerModal {...baseProps} isOpen={false} onAccept={jest.fn()} onDecline={jest.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Loss-Sharing Terms")).not.toBeInTheDocument();
  });

  it("renders the terms once opened", () => {
    render(<Harness onAccept={jest.fn()} onDecline={jest.fn()} />);
    fireEvent.click(screen.getByText("Open"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Loss-Sharing Terms")).toBeInTheDocument();
  });

  it("calls onAccept and closes when accepting", async () => {
    const onAccept = jest.fn();
    const onDecline = jest.fn();
    render(<Harness onAccept={onAccept} onDecline={onDecline} />);
    fireEvent.click(screen.getByText("Open"));
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDecline).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("calls onDecline and closes when declining", async () => {
    const onAccept = jest.fn();
    const onDecline = jest.fn();
    render(<Harness onAccept={onAccept} onDecline={onDecline} />);
    fireEvent.click(screen.getByText("Open"));
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));

    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
