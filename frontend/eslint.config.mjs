import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // i18n: components migrated to the message catalog (`@/lib/i18n`) must not
  // reintroduce raw user-facing JSX text. Add files here as they are migrated.
  {
    files: [
      "src/components/trade/ActionBar.tsx",
      "src/components/trade/ContractInfo.tsx",
      "src/components/trade/FinancialSummary.tsx",
      "src/components/trade/PartiesPanel.tsx",
      "src/components/trade/TimelineEventItem.tsx",
      "src/components/trade/TradeAmountRow.tsx",
      "src/components/trade/TradeDetailPanel.tsx",
      "src/components/trade/TradeHeader.tsx",
      "src/components/trade/TradeListItem.tsx",
      "src/components/trade/TradeTimeline.tsx",
      "src/components/trade/TransactionTimeline.tsx",
      "src/components/trade/VaultSidebar.tsx",
      "src/components/vault/*.tsx",
    ],
    ignores: ["**/__tests__/**"],
    rules: {
      "react/jsx-no-literals": [
        "error",
        {
          noStrings: false,
          ignoreProps: true,
          // Currency codes, units and punctuation are not translatable copy.
          allowedStrings: ["cNGN", "NGN", "ETH", "%", "/", ".00", "·", "—"],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
