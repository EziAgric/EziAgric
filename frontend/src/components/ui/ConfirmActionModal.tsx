"use client";

/**
 * ConfirmActionModal — accessible destructive-action confirmation dialog.
 *
 * Keyboard flow (#61):
 *  - Focus is auto-moved to the Cancel button when the dialog opens so the
 *    safe default is reachable without any keyboard input.
 *  - Tab cycles only within the modal (Radix Dialog provides the focus trap).
 *  - Shift+Tab traverses in reverse order.
 *  - Escape dismisses without confirming (Radix Dialog default).
 *
 * ARIA:
 *  - role="alertdialog" signals that the dialog contains a warning.
 *  - aria-labelledby and aria-describedby wire the title and message.
 *  - The action button carries an aria-label describing the consequence.
 */

import * as React from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export type ConfirmVariant = "danger" | "warning" | "info";

export interface ConfirmActionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Short headline shown in the dialog header. */
  title: string;
  /** Longer explanation of what will happen. */
  message: string;
  /** Label for the confirming action button (default: "Confirm"). */
  confirmLabel?: string;
  /** Label for the cancelling button (default: "Cancel"). */
  cancelLabel?: string;
  /** Visual intent of the confirm button. */
  variant?: ConfirmVariant;
  /** Called when the user confirms. The modal will *not* close automatically. */
  onConfirm: () => void;
  /** Whether the confirm button should show a loading/disabled state. */
  loading?: boolean;
}

const CONFIRM_BUTTON_STYLES: Record<ConfirmVariant, string> = {
  danger:
    "bg-status-danger text-white hover:opacity-90 focus-visible:outline-status-danger",
  warning:
    "bg-status-warning text-text-inverse hover:opacity-90 focus-visible:outline-status-warning",
  info: "bg-status-info text-white hover:opacity-90 focus-visible:outline-status-info",
};

export function ConfirmActionModal({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  loading = false,
}: ConfirmActionModalProps) {
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  // Move focus to Cancel (safe default) as soon as the dialog opens.
  // Radix Dialog owns the focus trap; we only direct initial focus.
  React.useEffect(() => {
    if (open) {
      // Defer one tick so Radix has time to mount the content.
      const raf = requestAnimationFrame(() => {
        cancelRef.current?.focus();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [open]);

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        // Prevent Radix from auto-focusing the first element; we handle it
        // ourselves so Cancel (the safe action) gets focus first.
        onOpenAutoFocus={(e) => e.preventDefault()}
        role="alertdialog"
        aria-live="assertive"
      >
        <ModalHeader>
          <ModalTitle>{title}</ModalTitle>
          <ModalDescription>{message}</ModalDescription>
        </ModalHeader>

        <ModalFooter>
          {/* Cancel — rendered first in DOM; cancelRef ensures it gets focus. */}
          <Button
            ref={cancelRef}
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {cancelLabel}
          </Button>

          {/* Confirm — second in DOM; carries aria-label with full intent. */}
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            aria-label={confirmLabel}
            aria-busy={loading}
            data-testid="confirm-action-button"
            className={[
              "px-4 py-2 text-sm font-semibold rounded-md",
              "transition-opacity",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              CONFIRM_BUTTON_STYLES[variant],
            ].join(" ")}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span
                  className="inline-block h-3.5 w-3.5 rounded-full border-2 border-transparent border-t-current animate-spin"
                  aria-hidden="true"
                />
                {confirmLabel}
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
