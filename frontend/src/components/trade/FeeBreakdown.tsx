"use client";

import { clsx } from "clsx";
import {
  computeFeeBreakdownFromDecimal,
  DEFAULT_PLATFORM_FEE_BPS,
  formatFeeAmount,
  formatFeePercent,
} from "@/lib/feeBreakdown";

export interface FeeBreakdownProps {
  /** Gross amount the buyer is paying / that is being settled. */
  gross: number | string;
  /** Platform fee rate in basis points. Defaults to 100 (1%). */
  feeBps?: number;
  /** Explicit fee override; computed from `gross` when omitted. */
  fee?: number | string;
  /** Explicit net override; computed from `gross` when omitted. */
  net?: number | string;
  /** Display-only Stellar network fee estimate. */
  networkFee?: string;
  /** Settlement asset symbol. Defaults to `cNGN`. */
  currency?: string;
  /** Accessible label for the group. */
  title?: string;
  className?: string;
}

function Row({
  label,
  value,
  emphasize,
  dimmed,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  dimmed?: boolean;
}) {
  return (
    <div
      className={clsx(
        "flex items-center justify-between py-2",
        emphasize && "border-t border-border-default mt-1 pt-3",
      )}
    >
      <dt
        className={clsx(
          "text-sm",
          dimmed ? "text-text-muted" : "text-text-secondary",
        )}
      >
        {label}
      </dt>
      <dd
        className={clsx(
          "text-sm font-semibold",
          emphasize ? "text-emerald" : "text-text-primary",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Reusable gross / fee / net breakdown (#423).
 *
 * Always shows the platform fee and what the seller will receive, so the
 * number never has to be inferred. Used by the create-trade review, and the
 * deposit (fund) and release views.
 */
export function FeeBreakdown({
  gross,
  feeBps = DEFAULT_PLATFORM_FEE_BPS,
  fee,
  net,
  networkFee,
  currency = "cNGN",
  title = "Fee breakdown",
  className,
}: FeeBreakdownProps) {
  const computed = computeFeeBreakdownFromDecimal(gross, feeBps);

  const feeValue = fee !== undefined ? String(fee) : computed.fee;
  const netValue = net !== undefined ? String(net) : computed.net;

  return (
    <div
      className={clsx(
        "rounded-lg border border-border-default bg-bg-elevated px-4 py-2",
        className,
      )}
    >
      <dl role="group" aria-label={title}>
        <Row
          label="Gross amount"
          value={`${formatFeeAmount(gross)} ${currency}`}
        />
        <Row
          label={`Platform fee (${formatFeePercent(feeBps)})`}
          value={`− ${formatFeeAmount(feeValue)} ${currency}`}
        />
        {networkFee && (
          <Row label="Network fee (est.)" value={networkFee} dimmed />
        )}
        <Row
          label="Seller receives"
          value={`${formatFeeAmount(netValue)} ${currency}`}
          emphasize
        />
      </dl>
    </div>
  );
}
