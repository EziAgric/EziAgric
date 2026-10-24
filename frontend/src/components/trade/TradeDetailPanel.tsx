"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { TradeHeader } from "./TradeHeader";
import { PartiesPanel } from "./PartiesPanel";
import { FinancialSummary } from "./FinancialSummary";
import { TradeTimeline } from "./TradeTimeline";
import { TransactionTimeline } from "./TransactionTimeline";
import { ContractInfo } from "./ContractInfo";
import { ActionBar } from "./ActionBar";
import { VaultSidebar } from "./VaultSidebar";
import { ProofOfDeliveryUpload } from "./ProofOfDeliveryUpload";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/Modal";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { TradeDetail } from "@/types/trade";

interface TradeDetailPanelProps {
  trade: TradeDetail;
  /** Runs the release-funds action (API call + signing). Errors should be handled by the caller. */
  onReleaseFunds?: () => Promise<void>;
  /** Called after a proof-of-delivery recording has been uploaded. */
  onProofOfDeliveryUploaded?: (result: { hash: string; url?: string }) => void;
}

export function TradeDetailPanel({
  trade,
  onReleaseFunds,
  onProofOfDeliveryUploaded,
}: TradeDetailPanelProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [confirmingDelivery, setConfirmingDelivery] = useState(false);
  const [releasingFunds, setReleasingFunds] = useState(false);
  const [podOpen, setPodOpen] = useState(false);

  async function handleReleaseFunds() {
    if (!onReleaseFunds || releasingFunds) return;
    setReleasingFunds(true);
    try {
      await onReleaseFunds();
    } finally {
      setReleasingFunds(false);
    }
  }

  return (
    <div className="min-h-screen bg-primary pb-28">
      {/* Page grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full max-w-7xl mx-auto p-6">
        {/* ── Left column (main) ── */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <TradeHeader trade={trade} />
          <PartiesPanel buyer={trade.buyer} seller={trade.seller} />
          <FinancialSummary trade={trade} />
          <TradeTimeline events={trade.timeline} />
        </div>

        {/* ── Right column (sidebar) ── */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          <VaultSidebar trade={trade} />
          {trade.transactionTimeline && (
            <TransactionTimeline
              events={trade.transactionTimeline}
              currentEventIndex={trade.currentTransactionIndex ?? 0}
            />
          )}
          <ContractInfo trade={trade} />
        </div>
      </div>

      {/* ── Fixed bottom Action Bar ── */}
      <ActionBar
        trade={trade}
        onConfirmDelivery={() => setConfirmingDelivery(true)}
        confirmingDelivery={confirmingDelivery}
        onRaiseDispute={() =>
          router.push(`/trades/${encodeURIComponent(trade.id)}/dispute`)
        }
        onVerifyPoD={() => setPodOpen(true)}
        onReleaseFunds={onReleaseFunds ? () => void handleReleaseFunds() : undefined}
        releasingFunds={releasingFunds}
      />

      {/* ── Proof-of-Delivery flow ── */}
      <Modal open={podOpen} onOpenChange={setPodOpen}>
        <ModalContent mobileFullScreen={false}>
          <ModalHeader>
            <ModalTitle>{t("tradeActions.podTitle")}</ModalTitle>
            <ModalDescription>{t("tradeActions.podDescription")}</ModalDescription>
          </ModalHeader>
          <ModalBody>
            <ProofOfDeliveryUpload
              extraFields={{ tradeId: trade.id }}
              onUploaded={({ hash, url }) =>
                onProofOfDeliveryUploaded?.({ hash, url })
              }
            />
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>
  );
}
