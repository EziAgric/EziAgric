import { act, render, screen } from "@testing-library/react";
import {
  LOCALES,
  STORAGE_KEY,
  collectKeys,
  messages,
  setStoredLocale,
  t,
} from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { TradeListItem } from "@/components/trade/TradeListItem";
import { VaultHero } from "@/components/vault/VaultHero";

/** Namespaces consumed by the migrated trade + vault components. */
const MIGRATED_NAMESPACES = ["tradeStatus", "tradeActions", "tradeList", "vault"] as const;

/** Keys added to the pre-existing `tradeDetail` namespace for the trade detail panel. */
const MIGRATED_TRADE_DETAIL_KEYS = collectKeys(messages.en.tradeDetail, "tradeDetail").filter(
  (key) =>
    ![
      "title",
      "status",
      "statusOpen",
      "statusNegotiating",
      "statusEscrowed",
      "statusCompleted",
      "statusDisputed",
      "statusCancelled",
      "commodity",
      "quantity",
      "pricePerUnit",
      "total",
      "seller",
      "buyer",
      "createdAt",
      "acceptTrade",
      "openDispute",
      "cancelTrade",
      "notFoundTitle",
      "notFoundBody",
    ].includes(key.replace("tradeDetail.", "")),
);

const requiredKeys = [
  ...MIGRATED_NAMESPACES.flatMap((ns) => collectKeys(messages.en[ns], ns)),
  ...MIGRATED_TRADE_DETAIL_KEYS,
];

function placeholders(message: string): string[] {
  return (message.match(/\{\w+\}/g) ?? []).sort();
}

function Probe() {
  const { t: translate } = useTranslation();
  return <span>{translate("tradeActions.releaseFunds")}</span>;
}

afterEach(() => {
  window.localStorage.removeItem(STORAGE_KEY);
});

describe("locale catalogs", () => {
  it("collects the migrated keys from the base catalog", () => {
    expect(requiredKeys).toContain("tradeActions.raiseDispute");
    expect(requiredKeys).toContain("vault.releaseSequence");
    expect(requiredKeys).toContain("tradeDetail.contractTitle");
  });

  it.each(LOCALES.filter((l) => l !== "en"))(
    "%s defines every key used by migrated components",
    (locale) => {
      const present = new Set(collectKeys(messages[locale]));
      const missing = requiredKeys.filter((key) => !present.has(key));
      expect(missing).toEqual([]);
    },
  );

  it.each(LOCALES.filter((l) => l !== "en"))(
    "%s keeps the same {placeholders} as en",
    (locale) => {
      requiredKeys.forEach((key) => {
        const base = t(key as Parameters<typeof t>[0]);
        const translated = t(key as Parameters<typeof t>[0], { locale });
        expect([key, placeholders(translated)]).toEqual([key, placeholders(base)]);
      });
    },
  );
});

describe("useTranslation", () => {
  it("renders English by default", () => {
    render(<Probe />);
    expect(screen.getByText("Release Funds")).toBeInTheDocument();
  });

  it("re-renders when the stored locale changes", () => {
    render(<Probe />);
    act(() => setStoredLocale("ha"));
    expect(screen.getByText(t("tradeActions.releaseFunds", { locale: "ha" }))).toBeInTheDocument();
    expect(screen.queryByText("Release Funds")).not.toBeInTheDocument();
  });

  it("translates migrated trade and vault components", () => {
    act(() => setStoredLocale("yo"));
    render(
      <>
        <TradeListItem
          tradeId="TRD-1"
          commodity="Maize"
          counterparty={{ role: "Seller", address: "GABC" }}
          amountCngn="100"
          status="SETTLED"
          createdAt="today"
          onView={() => {}}
        />
        <VaultHero escrowId="1" custodyType="Custody" status="Locked" isSecured />
      </>,
    );

    expect(screen.getByText(t("tradeStatus.settled", { locale: "yo" }))).toBeInTheDocument();
    expect(screen.getByText(t("vault.systemActive", { locale: "yo" }))).toBeInTheDocument();
    expect(screen.queryByText("Vault System Active")).not.toBeInTheDocument();
  });
});
