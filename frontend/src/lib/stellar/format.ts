// 1 XLM or 1 USDC = 10_000_000 stroops on Stellar.
//
// These are the on-chain asset formatters. They now delegate grouping/decimal
// rendering to the shared i18n module (`@/lib/i18n`) instead of ad-hoc
// `toLocaleString("en-US")` calls. For fiat (NGN) amounts use `formatNaira`.

import { formatMoney } from "@/lib/i18n/format";

export { formatNaira, formatMoney, formatDate, formatDateTime } from "@/lib/i18n/format";

function fixedGrouped(value: number, decimals: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatStroops(stroops: number, decimals: number): string {
  return fixedGrouped(stroops / Math.pow(10, decimals), decimals);
}

export function formatUsdc(stroops: number): string {
  return formatMoney(stroops / 10_000_000, { currency: "USD", locale: "en-US" });
}

export function formatXlm(stroops: number): string {
  return `${fixedGrouped(stroops / 10_000_000, 4)} XLM`;
}
