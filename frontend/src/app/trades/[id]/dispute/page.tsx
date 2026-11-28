"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api";

// ---------------------------------------------------------------------------
// Static category definitions (fetched from /disputeCategory in production)
// ---------------------------------------------------------------------------

interface DisputeCategory {
  id: string;
  label: string;
  description: string;
  evidenceChecklist: { id: string; label: string; required: boolean }[];
  buyerLossConsequence: string;
  sellerLossConsequence: string;
}

const DISPUTE_CATEGORIES: DisputeCategory[] = [
  {
    id: "QUALITY_DEFECT",
    label: "Quality / Defect",
    description: "Goods received do not match the agreed specification or are damaged.",
    evidenceChecklist: [
      { id: "q1", label: "Photo or video of the goods showing the defect", required: true },
      { id: "q2", label: "Written description of the discrepancy", required: true },
      { id: "q3", label: "Third-party quality inspection report (if available)", required: false },
    ],
    buyerLossConsequence:
      "If ruled against you (buyer), you bear your configured loss ratio of the locked funds.",
    sellerLossConsequence:
      "If ruled against you (seller), you bear your configured loss ratio of the locked funds.",
  },
  {
    id: "NON_DELIVERY",
    label: "Non-Delivery",
    description: "Goods were never delivered within the agreed window.",
    evidenceChecklist: [
      { id: "n1", label: "Proof that the delivery window has passed (screenshots / timestamps)", required: true },
      { id: "n2", label: "Communication with the seller showing no delivery update", required: true },
      { id: "n3", label: "Carrier tracking information showing non-delivery", required: false },
    ],
    buyerLossConsequence:
      "If you cannot substantiate the non-delivery claim, funds remain locked pending mediation.",
    sellerLossConsequence:
      "If delivery is confirmed late or absent, your loss ratio applies to the full locked amount.",
  },
  {
    id: "WRONG_QUANTITY",
    label: "Wrong Quantity",
    description: "Fewer goods were delivered than specified in the trade.",
    evidenceChecklist: [
      { id: "w1", label: "Weigh-slip or quantity confirmation from delivery", required: true },
      { id: "w2", label: "Photo evidence of received goods quantity", required: true },
    ],
    buyerLossConsequence:
      "If the shortfall cannot be proved, your loss ratio applies and funds are released to the seller.",
    sellerLossConsequence:
      "If the shortfall is confirmed, the proportional deduction is made before funds are released.",
  },
  {
    id: "PAYMENT_DISPUTE",
    label: "Payment / Funding Issue",
    description: "Funds were not deposited or an escrow state is incorrect.",
    evidenceChecklist: [
      { id: "p1", label: "Blockchain transaction hash showing the on-chain state", required: true },
      { id: "p2", label: "Screenshot of trade status at the time of the issue", required: true },
    ],
    buyerLossConsequence:
      "Unsubstantiated payment disputes may result in your loss ratio being applied.",
    sellerLossConsequence:
      "If the payment issue originates on your side, your loss ratio applies.",
  },
  {
    id: "OTHER",
    label: "Other",
    description: "Any dispute that does not fit the above categories.",
    evidenceChecklist: [
      { id: "o1", label: "Clear written description of the issue", required: true },
      { id: "o2", label: "Any supporting evidence (photos, documents, messages)", required: false },
    ],
    buyerLossConsequence: "The mediator will determine loss allocation based on submitted evidence.",
    sellerLossConsequence: "The mediator will determine loss allocation based on submitted evidence.",
  },
];

// ---------------------------------------------------------------------------

export default function DisputePage() {
  const params = useParams<{ id: string }>();
  const tradeId = params?.id ?? "";
  const router = useRouter();
  const { token, isAuthenticated } = useAuth();

  const [selectedCategory, setSelectedCategory] = useState<DisputeCategory | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const requiredUnchecked = selectedCategory
    ? selectedCategory.evidenceChecklist.filter((e) => e.required && !checkedItems.has(e.id))
    : [];
  const canSubmit =
    isAuthenticated &&
    selectedCategory !== null &&
    reason.trim().length >= 10 &&
    requiredUnchecked.length === 0;

  function toggleCheck(id: string) {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleCategorySelect(cat: DisputeCategory) {
    setSelectedCategory(cat);
    setCheckedItems(new Set());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !token || !selectedCategory) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.trades.initiateDispute(token, tradeId, reason.trim(), selectedCategory.id);
      router.push(`/trades/${tradeId}?disputeOpened=1`);
    } catch (err) {
      let msg = "Failed to open dispute";
      if (err instanceof ApiError) msg = err.message;
      else if (err instanceof Error) msg = err.message;
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">
      {/* Back link */}
      <Link
        href={`/trades/${tradeId}`}
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6"
      >
        ← Back to trade
      </Link>

      <h1 className="text-2xl font-bold text-text-primary mb-1">Open a Dispute</h1>
      <p className="text-sm text-text-secondary mb-8">
        Select a category, confirm you have the required evidence, then describe the issue.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Step 1: Category */}
        <section aria-labelledby="cat-heading">
          <h2 id="cat-heading" className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
            1. Choose a category
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {DISPUTE_CATEGORIES.map((cat) => {
              const active = selectedCategory?.id === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleCategorySelect(cat)}
                  aria-pressed={active}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                    active
                      ? "border-status-danger bg-status-danger/10 text-status-danger"
                      : "border-border-default bg-surface-1 text-text-primary hover:border-border-hover"
                  }`}
                >
                  <p className="font-semibold text-sm">{cat.label}</p>
                  <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{cat.description}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Step 2: Evidence checklist */}
        {selectedCategory && (
          <section aria-labelledby="evidence-heading">
            <h2 id="evidence-heading" className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
              2. Evidence checklist
            </h2>
            <div className="rounded-lg border border-border-default bg-surface-1 p-4 flex flex-col gap-3">
              {selectedCategory.evidenceChecklist.map((item) => {
                const checked = checkedItems.has(item.id);
                return (
                  <label
                    key={item.id}
                    className="flex items-start gap-3 cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCheck(item.id)}
                      className="mt-0.5 h-4 w-4 rounded border-border-default accent-status-danger"
                      aria-label={item.label}
                    />
                    <span className="text-sm text-text-primary leading-snug">
                      {item.label}
                      {item.required && (
                        <span className="ml-1 text-xs text-status-danger font-medium">Required</span>
                      )}
                    </span>
                  </label>
                );
              })}
              {requiredUnchecked.length > 0 && (
                <p className="text-xs text-status-danger mt-1" role="alert">
                  {requiredUnchecked.length} required item{requiredUnchecked.length > 1 ? "s" : ""} not yet confirmed.
                  You cannot submit without them.
                </p>
              )}
            </div>

            {/* Loss-ratio consequence explainer */}
            <div className="mt-3 rounded-lg border border-status-warning/40 bg-status-warning/10 px-4 py-3">
              <p className="text-xs font-semibold text-status-warning mb-1">Loss ratio consequence</p>
              <p className="text-xs text-text-secondary leading-relaxed">
                <span className="font-medium">If ruled against the buyer:</span>{" "}
                {selectedCategory.buyerLossConsequence}
              </p>
              <p className="text-xs text-text-secondary leading-relaxed mt-1">
                <span className="font-medium">If ruled against the seller:</span>{" "}
                {selectedCategory.sellerLossConsequence}
              </p>
            </div>
          </section>
        )}

        {/* Step 3: Reason */}
        {selectedCategory && (
          <section aria-labelledby="reason-heading">
            <h2 id="reason-heading" className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
              3. Describe the issue
            </h2>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={5}
              minLength={10}
              maxLength={2000}
              placeholder="Provide a detailed description (at least 10 characters)…"
              className="w-full rounded-lg border border-border-default bg-surface-0 px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-border-hover resize-none"
              aria-label="Dispute reason"
            />
            <p className="text-xs text-text-muted text-right mt-1">{reason.length}/2000</p>
          </section>
        )}

        {/* Error */}
        {submitError && (
          <div className="rounded-lg border border-status-danger/40 bg-status-danger/10 px-4 py-3 text-sm text-status-danger" role="alert">
            {submitError}
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Link href={`/trades/${tradeId}`}>
            <button type="button" className="rounded-lg border border-border-default px-4 py-2 text-sm text-text-secondary hover:border-border-hover transition-colors">
              Cancel
            </button>
          </Link>
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="rounded-lg bg-status-danger px-6 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Opening dispute…" : "Open Dispute"}
          </button>
        </div>
      </form>
    </div>
  );
}
