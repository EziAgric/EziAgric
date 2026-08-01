"use client";

import { useMemo, useState } from "react";
import { FormField } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";
import { ClawbackConfirmationModal } from "./ClawbackConfirmationModal";
import { validateClawbackAmount } from "@/lib/clawbackValidation";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { useToast } from "@/hooks/useToast";
import { api } from "@/lib/api";
import type { StreamClawbackPreviewResponse } from "@/lib/api";

export interface StreamClawbackFormProps {
  token: string;
  streamId: string;
  /** The stream's current remaining vested (unclaimed) balance, as an integer string. */
  remainingVested: string;
  onSuccess?: (result: StreamClawbackPreviewResponse) => void;
}

/**
 * Admin clawback amount entry with client-side validation (#57) gated behind
 * an explicit confirmation modal (#56). Errors from the backend preview call
 * (invalid/too-large amount, 403, 500, ...) are surfaced via the shared
 * error-code -> message mapping (#59).
 */
export function StreamClawbackForm({
  token,
  streamId,
  remainingVested,
  onSuccess,
}: StreamClawbackFormProps) {
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const { handleError } = useErrorHandler();
  const { addToast } = useToast();

  const validation = useMemo(
    () => validateClawbackAmount(amount, remainingVested),
    [amount, remainingVested],
  );

  const handleReviewClick = () => {
    setTouched(true);
    if (!validation.valid) return;
    setModalOpen(true);
  };

  const handleCancel = () => {
    setModalOpen(false);
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const result = await api.adminStreams.clawbackPreview(token, streamId, amount);
      addToast({
        type: "success",
        title: "Clawback previewed",
        message: `Post-clawback balance would be ${result.postClawbackBalance}.`,
      });
      setModalOpen(false);
      setAmount("");
      setTouched(false);
      onSuccess?.(result);
    } catch (error) {
      handleError(error);
      setModalOpen(false);
    } finally {
      setConfirming(false);
    }
  };

  const showError = touched && !validation.valid;

  return (
    <div className="space-y-4">
      <FormField
        label="Clawback amount"
        name="clawback-amount"
        required
        hint={`Remaining vested: ${remainingVested}`}
        error={showError ? (validation.error ?? undefined) : undefined}
      >
        <input
          type="text"
          inputMode="numeric"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setTouched(true);
          }}
          onBlur={() => setTouched(true)}
          className="w-full rounded-md border border-border-default bg-bg-elevated px-3 py-2 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-gold"
          placeholder="0"
        />
      </FormField>

      <Button variant="primary" onClick={handleReviewClick} disabled={!validation.valid}>
        Review clawback
      </Button>

      <ClawbackConfirmationModal
        open={modalOpen}
        streamId={streamId}
        amount={amount}
        remainingVested={remainingVested}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        confirming={confirming}
      />
    </div>
  );
}
