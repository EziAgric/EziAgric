/**
 * Asset configuration for Stellar-based tokens
 * Handles different asset types with their decimal precision and formatting
 */

export interface AssetInfo {
  code: string;
  issuer?: string;
  decimals: number;
  symbol: string;
  name: string;
  type: "native" | "credit_alphanum4" | "credit_alphanum12";
}

/**
 * Common Stellar assets used in the application
 */
export const STELLAR_ASSETS: Record<string, AssetInfo> = {
  XLM: {
    code: "XLM",
    decimals: 7,
    symbol: "XLM",
    name: "Stellar Lumens",
    type: "native",
  },
  USDC: {
    code: "USDC",
    issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", // Circle USDC on Stellar
    decimals: 7,
    symbol: "USDC",
    name: "USD Coin",
    type: "credit_alphanum4",
  },
  EURC: {
    code: "EURC",
    issuer: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2", // Circle EURC on Stellar
    decimals: 7,
    symbol: "EURC",
    name: "Euro Coin",
    type: "credit_alphanum4",
  },
  // Nigerian Naira token (example - replace with actual issuer if different)
  NGN: {
    code: "NGN",
    issuer: "EXAMPLE_ISSUER_ADDRESS", // Replace with actual issuer
    decimals: 7,
    symbol: "NGN",
    name: "Nigerian Naira",
    type: "credit_alphanum4",
  },
};

/**
 * Default asset when none is specified
 */
export const DEFAULT_ASSET: AssetInfo = STELLAR_ASSETS.XLM;

/**
 * Get asset info by code, with fallback to default
 */
export function getAssetInfo(code: string | null | undefined): AssetInfo {
  if (!code) return DEFAULT_ASSET;
  return STELLAR_ASSETS[code.toUpperCase()] || {
    code: code.toUpperCase(),
    decimals: 7, // Default to 7 decimals for Stellar assets
    symbol: code.toUpperCase(),
    name: code,
    type: "credit_alphanum4",
  };
}

/**
 * Parse asset identifier string in format "CODE:ISSUER" or just "CODE"
 */
export function parseAssetIdentifier(identifier: string): {
  code: string;
  issuer?: string;
} {
  const parts = identifier.split(":");
  return {
    code: parts[0],
    issuer: parts[1],
  };
}

/**
 * Format asset identifier for display
 */
export function formatAssetIdentifier(code: string, issuer?: string): string {
  if (code === "XLM" || !issuer) return code;
  return `${code}:${issuer.slice(0, 4)}...${issuer.slice(-4)}`;
}

/**
 * Check if asset is native XLM
 */
export function isNativeAsset(code: string): boolean {
  return code.toUpperCase() === "XLM";
}

/**
 * Get the divisor for converting stroops to human-readable amount
 */
export function getAssetDivisor(decimals: number): bigint {
  return BigInt(10) ** BigInt(decimals);
}

/**
 * Convert stroops/smallest unit to human-readable amount
 */
export function stroopsToAmount(stroops: string | bigint, decimals: number): string {
  const stroopsValue = typeof stroops === "string" ? BigInt(stroops) : stroops;
  const divisor = getAssetDivisor(decimals);
  const whole = stroopsValue / divisor;
  const frac = stroopsValue % divisor;
  
  // Format with proper decimal places
  const fracStr = frac.toString().padStart(decimals, "0");
  
  // Trim trailing zeros but keep at least 2 decimal places
  let trimmedFrac = fracStr;
  let minDecimals = Math.min(2, decimals);
  
  for (let i = fracStr.length - 1; i >= minDecimals; i--) {
    if (fracStr[i] === "0") {
      trimmedFrac = fracStr.slice(0, i);
    } else {
      break;
    }
  }
  
  return trimmedFrac.length > 0
    ? `${whole.toLocaleString()}.${trimmedFrac}`
    : whole.toLocaleString();
}

/**
 * Convert human-readable amount to stroops/smallest unit
 */
export function amountToStroops(amount: string, decimals: number): string {
  // Remove commas and whitespace
  const cleaned = amount.replace(/[,\s]/g, "");
  
  // Split into whole and fractional parts
  const parts = cleaned.split(".");
  const whole = parts[0] || "0";
  const frac = parts[1] || "";
  
  // Pad or truncate fractional part to match decimals
  const paddedFrac = frac.padEnd(decimals, "0").slice(0, decimals);
  
  // Combine and convert to stroops
  const stroopsValue = BigInt(whole) * getAssetDivisor(decimals) + BigInt(paddedFrac);
  
  return stroopsValue.toString();
}

/**
 * Format amount with asset symbol
 */
export function formatAmountWithAsset(
  stroops: string | bigint,
  assetCode: string,
  decimals?: number
): string {
  const asset = getAssetInfo(assetCode);
  const decimalPlaces = decimals ?? asset.decimals;
  const amount = stroopsToAmount(stroops, decimalPlaces);
  
  return `${amount} ${asset.symbol}`;
}

/**
 * Validate amount string format
 */
export function validateAmountFormat(amount: string, decimals: number): {
  valid: boolean;
  error?: string;
} {
  const cleaned = amount.replace(/[,\s]/g, "");
  
  // Check if empty
  if (!cleaned) {
    return { valid: false, error: "Amount is required" };
  }
  
  // Check for valid number format
  const numberRegex = /^\d+(\.\d*)?$/;
  if (!numberRegex.test(cleaned)) {
    return { valid: false, error: "Invalid number format" };
  }
  
  // Check decimal places
  const parts = cleaned.split(".");
  if (parts[1] && parts[1].length > decimals) {
    return {
      valid: false,
      error: `Maximum ${decimals} decimal places allowed`,
    };
  }
  
  // Check if amount is positive
  const value = parseFloat(cleaned);
  if (value <= 0) {
    return { valid: false, error: "Amount must be greater than zero" };
  }
  
  return { valid: true };
}

/**
 * Validate amount is within range
 */
export function validateAmountRange(
  stroops: string | bigint,
  min: string | bigint,
  max: string | bigint
): {
  valid: boolean;
  error?: string;
} {
  const value = typeof stroops === "string" ? BigInt(stroops) : stroops;
  const minValue = typeof min === "string" ? BigInt(min) : min;
  const maxValue = typeof max === "string" ? BigInt(max) : max;
  
  if (value < minValue) {
    return { valid: false, error: "Amount is below minimum" };
  }
  
  if (value > maxValue) {
    return { valid: false, error: "Amount exceeds maximum" };
  }
  
  return { valid: true };
}
