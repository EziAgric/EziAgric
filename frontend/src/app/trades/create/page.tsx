"use client";
import { TradeProvider, useTrade } from "./TradeContext";
import Step1Details from "./steps/Step1Details";
import Step2Negotiation from "./steps/Step2Negotiation";
import Step3Review from "./steps/Step3Review";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const STEPS = [
  { index: 1, label: "Details" },
  { index: 2, label: "Negotiation" },
  { index: 3, label: "Review" },
];

function StepIndicator() {
  const { step } = useTrade();
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map(({ index, label }, i) => (
        <div key={index} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                step === index
                  ? "bg-gold text-text-inverse"
                  : step > index
                  ? "bg-emerald text-text-inverse"
                  : "bg-bg-elevated text-text-muted border border-border-default"
              }`}
            >
              {step > index ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                index
              )}
            </div>
            <span className={`text-xs ${step >= index ? "text-text-secondary" : "text-text-muted"}`}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-px mx-2 mb-4 transition-colors ${step > index ? "bg-emerald" : "bg-border-default"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function CreateTradeInner() {
  const { step } = useTrade();
  return (
    <div className="min-h-screen bg-bg-primary flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-6">
          <Link href="/" className="text-text-muted text-sm hover:text-text-secondary transition-colors">
            ← Back
          </Link>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Create Trade</h1>
          <p className="text-text-secondary text-sm mt-1">
            Lock agricultural commodity value into cNGN escrow via NGN Path Payment
          </p>
        </div>

        <div className="bg-bg-card rounded-xl border border-border-default p-6 shadow-card">
          <StepIndicator />
          {step === 1 && <Step1Details />}
          {step === 2 && <Step2Negotiation />}
          {step === 3 && <Step3Review />}
        </div>
      </div>
    </div>
  );
}

/**
 * Reads listing pre-fill params from the URL so the marketplace listing
 * detail page's "Start trade" action can seed the wizard.
 *
 * Supported params:
 *  - listingId: the marketplace listing id
 *  - commodity: commodity name (e.g. "Maize")
 *  - quantity: requested quantity, bounded by the listing availability
 *  - unit: unit of measure (e.g. "tonne")
 *  - price: unit price in NGN
 *  - seller: seller display name
 */
export function parseTradePrefill(
  params: URLSearchParams | { get(key: string): string | null }
): Record<string, string> {
  const keys = ["listingId", "commodity", "quantity", "unit", "price", "seller"];
  const prefill: Record<string, string> = {};
  for (const key of keys) {
    const value = params.get(key);
    if (value !== null && value !== "") {
      prefill[key] = value;
    }
  }
  return prefill;
}

export default function CreateTradePage() {
  const searchParams = useSearchParams();
  const prefill = parseTradePrefill(searchParams);

  return (
    <TradeProvider initialValues={prefill}>
      <CreateTradeInner />
    </TradeProvider>
  );
}
