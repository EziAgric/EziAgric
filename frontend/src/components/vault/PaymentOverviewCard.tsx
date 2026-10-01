"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { BentoCard } from "@/components/ui/BentoCard";
import {
  computeFeeBreakdownFromDecimal,
  DEFAULT_PLATFORM_FEE_BPS,
  formatFeePercent,
} from "@/lib/feeBreakdown";

interface PaymentOverviewCardProps {
  totalCngn: number;
  ngnRate?: number;
}

interface CostLineItem {
  label: string;
  getValue: (total: number, currency: "cNGN" | "NGN", rate: number) => string;
  dimmed?: boolean;
}

const LINE_ITEMS: CostLineItem[] = [
  {
    label: "Total Trade Value",
    getValue: (total, currency, rate) =>
      currency === "NGN"
        ? `₦${(total * rate).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`
        : `${total.toLocaleString()} cNGN`,
  },
  {
    // Fee math comes from the shared util so the card can never drift from the
    // backend/on-chain 1% (truncating) calculation (#423).
    label: `Amana Platform Fee (${formatFeePercent(DEFAULT_PLATFORM_FEE_BPS)})`,
    getValue: (total, currency, rate) => {
      const { fee } = computeFeeBreakdownFromDecimal(total);
      const feeValue = parseFloat(fee);
      return currency === "NGN"
        ? `₦${(feeValue * rate).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`
        : `${feeValue.toLocaleString()} cNGN`;
    },
  },
  {
    label: "Net Payout",
    getValue: (total, currency, rate) => {
      const { net } = computeFeeBreakdownFromDecimal(total);
      const netValue = parseFloat(net);
      return currency === "NGN"
        ? `₦${(netValue * rate).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`
        : `${netValue.toLocaleString()} cNGN`;
    },
    dimmed: true,
  },
];

export function PaymentOverviewCard({
  totalCngn,
  ngnRate = 1580,
}: PaymentOverviewCardProps) {
  const [currency, setCurrency] = useState<"cNGN" | "NGN">("cNGN");

  const lockedDisplay =
    currency === "NGN"
      ? `₦${(totalCngn * ngnRate).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`
      : `${totalCngn.toLocaleString()} cNGN`;

  return (
    <BentoCard
      title="Vault Escrow Summary"
      icon={<CreditCard className="w-5 h-5" />}
      glowVariant="gold"
      className="h-full"
    >
      <div className="flex items-center justify-end -mt-8 mb-5">
        <div className="flex items-center gap-1 bg-bg-elevated rounded-full p-1">
          {(["cNGN", "NGN"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
                currency === c
                  ? "bg-gold text-text-inverse"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-0 divide-y divide-border-default">
        {LINE_ITEMS.map(({ label, getValue, dimmed }) => (
          <div key={label} className="flex items-center justify-between py-3">
            <span
              className={`text-sm ${dimmed ? "text-text-muted" : "text-text-secondary"}`}
            >
              {label}
            </span>
            <span className="text-sm font-semibold text-text-primary">
              {getValue(totalCngn, currency, ngnRate)}
            </span>
          </div>
        ))}
      </div>

      <div className="bg-gold-muted/20 border-l-[3px] border-gold text-gold font-bold px-4 py-2 mt-4 rounded-r-md flex items-center justify-between">
        <span className="text-sm">Locked in cNGN</span>
        <span className="text-sm">{lockedDisplay}</span>
      </div>
    </BentoCard>
  );
}
