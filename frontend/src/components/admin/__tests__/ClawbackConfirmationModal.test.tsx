import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClawbackConfirmationModal } from "../ClawbackConfirmationModal";

describe("ClawbackConfirmationModal", () => {
  it("is not rendered when closed", () => {
    render(
      <ClawbackConfirmationModal
        open={false}
        streamId="stream-abc-123"
        amount="3000"
        remainingVested="7500"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("displays the stream id, requested amount, and remaining vested amount", () => {
    render(
      <ClawbackConfirmationModal
        open
        streamId="stream-abc-123"
        amount="3000"
        remainingVested="7500"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("stream-abc-123")).toBeInTheDocument();
    expect(screen.getByText("3000")).toBeInTheDocument();
    expect(screen.getByText("7500")).toBeInTheDocument();
  });

  it("calls onConfirm only after the Confirm button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();

    render(
      <ClawbackConfirmationModal
        open
        streamId="stream-abc-123"
        amount="3000"
        remainingVested="7500"
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />,
    );

    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /confirm clawback/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Cancel is clicked, without calling onConfirm", async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    render(
      <ClawbackConfirmationModal
        open
        streamId="stream-abc-123"
        amount="3000"
        remainingVested="7500"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onCancel (not onConfirm) when dismissed via Escape", () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    render(
      <ClawbackConfirmationModal
        open
        streamId="stream-abc-123"
        amount="3000"
        remainingVested="7500"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("disables both buttons while confirming", () => {
    render(
      <ClawbackConfirmationModal
        open
        streamId="stream-abc-123"
        amount="3000"
        remainingVested="7500"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
        confirming
      />,
    );

    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /confirming/i })).toBeDisabled();
  });
});
