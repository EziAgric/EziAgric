/**
 * Asset allowlist for multi-asset escrow support (#187).
 *
 * Each entry defines a supported asset's contract address, symbol, and
 * decimal precision. The escrow contract must also have this asset
 * registered via `allow_asset()` before trades can use it.
 *
 * To add a new asset:
 *   1. Add an entry here with the correct contract ID and decimals.
 *   2. Call `allow_asset()` on the escrow contract via an admin transaction.
 *   3. Update any front-end / mobile amount-display logic for the new decimals.
 */

export interface AssetConfig {
  /** Stellar contract address of the token. */
  contractId: string;
  /** Human-readable ticker, e.g. "cNGN", "USDC", "EURC". */
  symbol: string;
  /** Decimal precision used for display and fixed-point arithmetic. */
  decimals: number;
}

const CNGN_CONTRACT_ID = process.env.CNGN_CONTRACT_ID ?? process.env.USDC_CONTRACT_ID ?? '';
const USDC_CONTRACT_ID = process.env.USDC_CONTRACT_ID ?? '';
const EURC_CONTRACT_ID = process.env.EURC_CONTRACT_ID ?? '';

/** Map from contract address → AssetConfig for all allowed assets. */
export const ASSET_ALLOWLIST: Map<string, AssetConfig> = new Map(
  [
    {
      contractId: CNGN_CONTRACT_ID,
      symbol: 'cNGN',
      decimals: 7,
    },
    USDC_CONTRACT_ID
      ? { contractId: USDC_CONTRACT_ID, symbol: 'USDC', decimals: 7 }
      : null,
    EURC_CONTRACT_ID
      ? { contractId: EURC_CONTRACT_ID, symbol: 'EURC', decimals: 7 }
      : null,
  ]
    .filter((a): a is AssetConfig => a !== null && a.contractId.length > 0)
    .map((a) => [a.contractId, a]),
);

/** Returns the AssetConfig for a given contract address, or throws. */
export function requireAssetConfig(contractId: string): AssetConfig {
  const config = ASSET_ALLOWLIST.get(contractId);
  if (!config) {
    throw new Error(`Asset ${contractId} is not on the allowlist`);
  }
  return config;
}

/** Returns true when the given contract address is on the allowlist. */
export function isAllowedAsset(contractId: string): boolean {
  return ASSET_ALLOWLIST.has(contractId);
}

/** Converts a raw stroop amount to a human-readable decimal string. */
export function formatAssetAmount(rawAmount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = rawAmount / divisor;
  const fraction = rawAmount % divisor;
  return `${whole}.${fraction.toString().padStart(decimals, '0')}`;
}
