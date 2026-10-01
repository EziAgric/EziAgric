"use client";
import { useEffect, useState } from "react";
import { TradeProvider, useTrade } from "./TradeContext";
import Step1Details from "./steps/Step1Details";
import Step2Negotiation from "./steps/Step2Negotiation";
import Step3Review from "./steps/Step3Review";
import Link from "next/link";

const STEPS = [
  { index: 1, label: "Details" },
  { index: 2, label: "Negotiation" },
  { index: 3, label: "Review" },
];

const DRAFT_STORAGE_KEY = "trade-create-draft";

function readDraft(): Record<string, unknown> | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function clearDraft() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // storage unavailable — ignore
  }
}

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

function ResumePrompt({ onResume, onDiscard }: { onResume: () => void; onDiscard: () => void }) {
  return (
    <div className="mb-6 rounded-lg border border-border-default bg-bg-elevated p-4">
      <p className="text-sm text-text-primary">You have an unsaved trade draft.</p>
      <p className="text-xs text-text-muted mt-1">Resume where you left off, or discard it and start over.</p>
      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={onResume}
          className="px-3 py-1.5 rounded-md bg-gold text-text-inverse text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Resume draft
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="px-3 py-1.5 rounded-md border border-border-default text-text-secondary text-sm hover:text-text-primary transition-colors"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

function CreateTradeInner() {
  const { step, restoreDraft } = useTrade();
  const [pendingDraft, setPendingDraft] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const draft = readDraft();
    if (draft) setPendingDraft(draft);
  }, []);

  const handleResume = () => {
    if (pendingDraft) restoreDraft(pendingDraft);
    setPendingDraft(null);
  };

  const handleDiscard = () => {
    clearDraft();
    setPendingDraft(null);
  };

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

        {pendingDraft && <ResumePrompt onResume={handleResume} onDiscard={handleDiscard} />}

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

export default function CreateTradePage() {
  return (
    <TradeProvider>
      <CreateTradeInner />
    </TradeProvider>
  );
}
