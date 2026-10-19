"use client";

import { BentoCard } from "@/components/ui/BentoCard";
import { Shield, Fingerprint, Database } from "lucide-react";
import type { ReactNode } from "react";
import Image from "next/image";
import RequestIcon from "@/app/assets/RequestIcon.png";
import { useTranslation } from "@/lib/i18n/useTranslation";

type LogType = "biometric" | "multi-sig" | "ledger";

interface AuditLogEntry {
  type: LogType;
  title: string;
  metadata: string;
}

interface AuditLogCardProps {
  entries: AuditLogEntry[];
  isLiveSync?: boolean;
}

function getLogIcon(type: LogType, multisigAlt: string): ReactNode {
  switch (type) {
    case "biometric":
      return <Fingerprint className="w-4 h-4 text-emerald" />;
    case "multi-sig":
      return <Image src={RequestIcon} alt={multisigAlt} />;
    case "ledger":
      return <Database className="w-4 h-4 text-text-secondary" />;
  }
}

const logBgColors: Record<LogType, string> = {
  biometric: "bg-emerald-muted",
  "multi-sig": "bg-gold-muted",
  ledger: "bg-bg-elevated",
};

export function AuditLogCard({ entries, isLiveSync = true }: AuditLogCardProps) {
  const { t } = useTranslation();
  return (
    <BentoCard
      title={t("vault.auditLog")}
      icon={<Shield className="w-5 h-5" />}
      glowVariant="emerald"
      className="h-full"
    >
      <div className="flex items-center justify-end -mt-8 mb-6">
        {isLiveSync && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald bg-emerald-muted px-3 py-1 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald animate-pulse" />
            {t("vault.liveSync")}
          </span>
        )}
      </div>

      <div className="space-y-4">
        {entries.map((entry, index) => (
          <div key={index} className="flex items-start gap-3 bg-[#03110B4D] p-4 rounded-lg h-18">
            <div
              className={`w-10 h-10 rounded-full ${logBgColors[entry.type]} flex items-center justify-center shrink-0 mb-12`}
            >
              {getLogIcon(entry.type, t("vault.multisigIconAlt"))}
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">
                {entry.title}
              </p>
              <p className="text-xs text-text-secondary">{entry.metadata}</p>
            </div>
          </div>
        ))}
      </div>
    </BentoCard>
  );
}
