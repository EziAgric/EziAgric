'use client';

import { useMemo, useState } from 'react';

/**
 * Shared resolution math. Kept in this module so the preview and the
 * submitted payload are guaranteed to use identical arithmetic.
 *
 * Amounts are expressed in the smallest unit (stroops) and fees are
 * taken from the disputed amount before the split is applied.
 */
export type ResolutionOutcome =
  | 'full_buyer'
  | 'full_seller'
  | 'loss_ratio'
  | 'custom';

export interface SplitPreview {
  buyerAmount: number;
  sellerAmount: number;
  feeAmount: number;
  totalAmount: number;
}

/**
 * Basis points are used for the loss ratio so the math matches the
 * on-chain contract (integer arithmetic, no floating point drift).
 */
export const BPS_DENOMINATOR = 10_000;

export function computeSplitPreview(params: {
  amount: number;
  feeBps: number;
  outcome: ResolutionOutcome;
  /** Buyer share in basis points, only used for loss_ratio/custom. */
  buyerBps?: number;
}): SplitPreview {
  const { amount, feeBps, outcome, buyerBps = 0 } = params;

  const safeAmount = Math.max(0, Math.floor(amount));
  const safeFeeBps = Math.min(Math.max(0, Math.floor(feeBps)), BPS_DENOMINATOR);

  const feeAmount = Math.floor((safeAmount * safeFeeBps) / BPS_DENOMINATOR);
  const distributable = safeAmount - feeAmount;

  let buyerShareBps: number;
  switch (outcome) {
    case 'full_buyer':
      buyerShareBps = BPS_DENOMINATOR;
      break;
    case 'full_seller':
      buyerShareBps = 0;
      break;
    case 'loss_ratio':
    case 'custom':
    default:
      buyerShareBps = Math.min(Math.max(0, Math.floor(buyerBps)), BPS_DENOMINATOR);
      break;
  }

  const buyerAmount = Math.floor((distributable * buyerShareBps) / BPS_DENOMINATOR);
  const sellerAmount = distributable - buyerAmount;

  return {
    buyerAmount,
    sellerAmount,
    feeAmount,
    totalAmount: safeAmount,
  };
}

export interface ResolutionFormProps {
  disputeId: string;
  /** Disputed amount in the smallest unit. */
  amount: number;
  /** Platform fee in basis points. */
  feeBps: number;
  /** Loss ratio (buyer share) in basis points, used as the default split. */
  lossRatioBps?: number;
  onSubmit?: (payload: {
    disputeId: string;
    outcome: ResolutionOutcome;
    buyerBps: number;
    rationale: string;
    preview: SplitPreview;
  }) => void | Promise<void>;
}

const OUTCOME_OPTIONS: { value: ResolutionOutcome; label: string }[] = [
  { value: 'full_buyer', label: 'Full refund to buyer' },
  { value: 'full_seller', label: 'Full release to seller' },
  { value: 'loss_ratio', label: 'Loss ratio split' },
  { value: 'custom', label: 'Custom split' },
];

function formatAmount(value: number): string {
  return value.toLocaleString();
}

export default function ResolutionForm({
  disputeId,
  amount,
  feeBps,
  lossRatioBps = 0,
  onSubmit,
}: ResolutionFormProps) {
  const [outcome, setOutcome] = useState<ResolutionOutcome>('loss_ratio');
  const [customBuyerBps, setCustomBuyerBps] = useState<number>(lossRatioBps);
  const [rationale, setRationale] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const buyerBps =
    outcome === 'loss_ratio'
      ? lossRatioBps
      : outcome === 'custom'
        ? customBuyerBps
        : 0;

  const preview = useMemo(
    () => computeSplitPreview({ amount, feeBps, outcome, buyerBps }),
    [amount, feeBps, outcome, buyerBps],
  );

  const rationaleValid = rationale.trim().length > 0;
  const canSubmit = rationaleValid && !submitting;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit?.({
        disputeId,
        outcome,
        buyerBps,
        rationale: rationale.trim(),
        preview,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Outcome</legend>
        {OUTCOME_OPTIONS.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="outcome"
              value={option.value}
              checked={outcome === option.value}
              onChange={() => setOutcome(option.value)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      {outcome === 'custom' && (
        <label className="block text-sm">
          Buyer share (basis points)
          <input
            type="number"
            min={0}
            max={BPS_DENOMINATOR}
            value={customBuyerBps}
            onChange={(event) => setCustomBuyerBps(Number(event.target.value))}
            className="mt-1 w-full rounded border px-2 py-1"
          />
        </label>
      )}

      <div className="rounded border p-4 text-sm">
        <h3 className="mb-2 font-semibold">Split preview (net of fees)</h3>
        <dl className="grid grid-cols-2 gap-1">
          <dt>Buyer receives</dt>
          <dd className="text-right">{formatAmount(preview.buyerAmount)}</dd>
          <dt>Seller receives</dt>
          <dd className="text-right">{formatAmount(preview.sellerAmount)}</dd>
          <dt>Platform fee</dt>
          <dd className="text-right">{formatAmount(preview.feeAmount)}</dd>
          <dt className="font-semibold">Total</dt>
          <dd className="text-right font-semibold">
            {formatAmount(preview.totalAmount)}
          </dd>
        </dl>
      </div>

      <label className="block text-sm">
        Rationale
        <textarea
          required
          value={rationale}
          onChange={(event) => setRationale(event.target.value)}
          rows={4}
          className="mt-1 w-full rounded border px-2 py-1"
          placeholder="Explain the reasoning behind this resolution"
        />
      </label>

      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Sign resolution'}
      </button>
    </form>
  );
}
