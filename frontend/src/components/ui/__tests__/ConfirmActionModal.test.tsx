/**
 * Tests for the ConfirmActionModal component (#61).
 *
 * Covers:
 * - Renders title and message when open
 * - Cancel button calls onOpenChange(false)
 * - Confirm button calls onConfirm
 * - Loading state disables both buttons
 * - Different variants render correct CSS classes
 * - role="alertdialog" is present
 * - axe accessibility audit passes
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { ConfirmActionModal } from "../ConfirmActionModal";

expect.extend(toHaveNoViolations);

function renderModal(overrides: Partial<React.ComponentProps<typeof ConfirmActionModal>> = {}) {
  const props: React.ComponentProps<typeof ConfirmActionModal> = {
    open: true,
    onOpenChange: jest.fn(),
    title: "Close Stream",
    message: "This will permanently close the stream. Are you sure?",
    confirmLabel: "Close Stream",
    cancelLabel: "Cancel",
    variant: "danger",
    onConfirm: jest.fn(),
    loading: false,
    ...overrides,
  };
  return { ...render(<ConfirmActionModal {...props} />), props };
}

describe("ConfirmActionModal (#61 — keyboard-accessible confirmations)", () => {
  it("renders the dialog when open=true", () => {
    renderModal();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("does not render when open=false", () => {
    renderModal({ open: false });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("shows title and message", () => {
    renderModal();
    expect(screen.getByText("Close Stream")).toBeInTheDocument();
    expect(
      screen.getByText("This will permanently close the stream. Are you sure?"),
    ).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderModal();

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onConfirm when confirm button is clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderModal();

    await user.click(screen.getByTestId("confirm-action-button"));

    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons when loading=true", () => {
    renderModal({ loading: true });

    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    const confirmBtn = screen.getByTestId("confirm-action-button");

    expect(cancelBtn).toBeDisabled();
    expect(confirmBtn).toBeDisabled();
  });

  it("shows a spinner inside the confirm button when loading", () => {
    renderModal({ loading: true });
    // The spinning span is aria-hidden
    const confirmBtn = screen.getByTestId("confirm-action-button");
    expect(confirmBtn.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it("uses the confirmLabel as aria-label on the confirm button", () => {
    renderModal({ confirmLabel: "Pause Stream" });
    expect(
      screen.getByRole("button", { name: "Pause Stream" }),
    ).toBeInTheDocument();
  });

  it("has no axe violations for danger variant", async () => {
    const { container } = renderModal({ variant: "danger" });
    await waitFor(() => screen.getByRole("alertdialog"));
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no axe violations for warning variant", async () => {
    const { container } = renderModal({ variant: "warning", title: "Pause Stream", confirmLabel: "Pause Stream" });
    await waitFor(() => screen.getByRole("alertdialog"));
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no axe violations for info variant", async () => {
    const { container } = renderModal({ variant: "info", title: "Resume Stream", confirmLabel: "Resume Stream" });
    await waitFor(() => screen.getByRole("alertdialog"));
    expect(await axe(container)).toHaveNoViolations();
  });
});
