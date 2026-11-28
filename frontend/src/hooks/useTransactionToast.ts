"use client";

import { useCallback, useEffect, useRef } from "react";
import { useToast } from "./useToast";
import {
  pollTransactionStatus,
  stellarExpertTxUrl,
  type StellarNetwork,
} from "@/lib/stellar/txStatus";

export interface TrackTransactionOptions {
  /** Human-readable name for the action, e.g. "Trade created". */
  label?: string;
  /** Reuse an existing pending toast created by the caller. */
  correlationId?: string;
  /** Explorer network override; defaults to the configured network. */
  network?: StellarNetwork;
}

export interface UseTransactionToastResult {
  /**
   * Show a pending toast for `hash`, then poll `stellar.tx.status` and update
   * the same toast to success/failure with a Stellar Expert link.
   *
   * Fire-and-forget: it resolves nothing and never throws. Polling is aborted
   * automatically when the component unmounts.
   */
  trackTransaction: (hash: string, options?: TrackTransactionOptions) => void;
}

/**
 * Pending → success/failure transaction toasts with an explorer link (#422).
 *
 * Sits on top of the existing correlation-id toast contract, so a caller that
 * already showed a pending toast can pass its `correlationId` and have it
 * updated in place rather than stacking a second toast.
 */
export function useTransactionToast(): UseTransactionToastResult {
  const { addToastWithCorrelation, updateToast, dismissByCorrelation } =
    useToast();
  const controllers = useRef<Set<AbortController>>(new Set());

  useEffect(() => {
    const active = controllers.current;
    return () => {
      active.forEach((controller) => controller.abort());
      active.clear();
    };
  }, []);

  const trackTransaction = useCallback(
    (hash: string, options: TrackTransactionOptions = {}) => {
      const label = options.label ?? "Transaction";
      const correlationId = options.correlationId ?? `tx-${hash}`;
      const link = {
        href: stellarExpertTxUrl(hash, options.network),
        label: "View on Stellar Expert",
      };

      // Pending toast (deduped by correlationId if the caller already made one).
      addToastWithCorrelation({
        type: "info",
        title: "Pending",
        message: `${label} submitted — awaiting Stellar confirmation.`,
        correlationId,
        duration: 0,
        link,
      });

      const controller = new AbortController();
      controllers.current.add(controller);

      void pollTransactionStatus(hash, { signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return;

          if (result.status === "success") {
            updateToast(correlationId, {
              type: "success",
              title: "Confirmed",
              message: `${label} confirmed on Stellar.`,
              duration: 6000,
              link,
            });
          } else if (result.status === "failed") {
            updateToast(correlationId, {
              type: "error",
              title: "Transaction failed",
              message: `${label} failed on Stellar. See the explorer for details.`,
              duration: 9000,
              link,
            });
          } else {
            updateToast(correlationId, {
              type: "warning",
              title: "Still pending",
              message: `${label} is not confirmed yet — check the explorer for the latest status.`,
              duration: 9000,
              link,
            });
          }
        })
        .catch((error: unknown) => {
          // Abort (unmount / navigation) is expected — drop the pending toast.
          if (
            controller.signal.aborted ||
            (error instanceof Error && error.name === "AbortError")
          ) {
            dismissByCorrelation(correlationId);
            return;
          }

          updateToast(correlationId, {
            type: "warning",
            title: "Could not confirm",
            message: `${label} was submitted but its status could not be verified.`,
            duration: 9000,
            link,
          });
        })
        .finally(() => {
          controllers.current.delete(controller);
        });
    },
    [addToastWithCorrelation, updateToast, dismissByCorrelation],
  );

  return { trackTransaction };
}
