"use client";

import Image from 'next/image';
import { BentoCard } from "@/components/ui/BentoCard";
import { NetworkIcon } from "@/components/icons";
import StellarLogo from '../../app/assets/StellarLogo.png';
import { useTranslation } from "@/lib/i18n/useTranslation";


interface NetworkBackboneCardProps {
  description: string;
}

export function NetworkBackboneCard({ description }: NetworkBackboneCardProps) {
  const { t } = useTranslation();
  return (
    <BentoCard
      title={t("vault.networkBackbone")}
      icon={<NetworkIcon className="w-5 h-5" />}
      glowVariant="gold"
      className="h-full"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <p className="text-sm text-text-secondary max-w-xl leading-relaxed">
          {description}
        </p>
        <div className="flex items-center gap-2 mb-8">
         <Image
            src={StellarLogo}
            alt={t("vault.stellarLogoAlt")}
          />
        </div>
      </div>
    </BentoCard>
  );
}
