import {
  getAssetInfo,
  parseAssetIdentifier,
  formatAssetIdentifier,
  isNativeAsset,
  getAssetDivisor,
  stroopsToAmount,
  amountToStroops,
  formatAmountWithAsset,
  validateAmountFormat,
  validateAmountRange,
  STELLAR_ASSETS,
} from "../assets";

describe("Asset Utilities", () => {
  describe("getAssetInfo", () => {
    it("returns XLM asset info for 'XLM' code", () => {
      const asset = getAssetInfo("XLM");
      expect(asset.code).toBe("XLM");
      expect(asset.decimals).toBe(7);
      expect(asset.symbol).toBe("XLM");
      expect(asset.type).toBe("native");
    });

    it("returns USDC asset info for 'USDC' code", () => {
      const asset = getAssetInfo("USDC");
      expect(asset.code).toBe("USDC");
      expect(asset.decimals).toBe(7);
      expect(asset.symbol).toBe("USDC");
      expect(asset.type).toBe("credit_alphanum4");
      expect(asset.issuer).toBeDefined();
    });

    it("returns EURC asset info for 'EURC' code", () => {
      const asset = getAssetInfo("EURC");
      expect(asset.code).toBe("EURC");
      expect(asset.decimals).toBe(7);
      expect(asset.symbol).toBe("EURC");
    });

    it("returns default asset for null or undefined", () => {
      const assetNull = getAssetInfo(null);
      const assetUndefined = getAssetInfo(undefined);
      
      expect(assetNull.code).toBe("XLM");
      expect(assetUndefined.code).toBe("XLM");
    });

    it("returns generic asset info for unknown code", () => {
      const asset = getAssetInfo("CUSTOM");
      expect(asset.code).toBe("CUSTOM");
      expect(asset.decimals).toBe(7);
      expect(asset.symbol).toBe("CUSTOM");
    });

    it("handles case-insensitive asset codes", () => {
      const lower = getAssetInfo("usdc");
      const upper = getAssetInfo("USDC");
      
      expect(lower.code).toBe(upper.code);
      expect(lower.decimals).toBe(upper.decimals);
    });
  });

  describe("parseAssetIdentifier", () => {
    it("parses code-only identifier", () => {
      const result = parseAssetIdentifier("XLM");
      expect(result.code).toBe("XLM");
      expect(result.issuer).toBeUndefined();
    });

    it("parses code:issuer identifier", () => {
      const result = parseAssetIdentifier("USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN");
      expect(result.code).toBe("USDC");
      expect(result.issuer).toBe("GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN");
    });
  });

  describe("formatAssetIdentifier", () => {
    it("returns code for XLM", () => {
      const result = formatAssetIdentifier("XLM");
      expect(result).toBe("XLM");
    });

    it("returns code for asset without issuer", () => {
      const result = formatAssetIdentifier("USDC");
      expect(result).toBe("USDC");
    });

    it("returns abbreviated format with issuer", () => {
      const result = formatAssetIdentifier("USDC", "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN");
      expect(result).toBe("USDC:GA5Z...KZVN");
    });
  });

  describe("isNativeAsset", () => {
    it("returns true for XLM", () => {
      expect(isNativeAsset("XLM")).toBe(true);
    });

    it("returns true for xlm (case insensitive)", () => {
      expect(isNativeAsset("xlm")).toBe(true);
    });

    it("returns false for non-native assets", () => {
      expect(isNativeAsset("USDC")).toBe(false);
      expect(isNativeAsset("EURC")).toBe(false);
    });
  });

  describe("getAssetDivisor", () => {
    it("returns correct divisor for 7 decimals", () => {
      const divisor = getAssetDivisor(7);
      expect(divisor).toBe(BigInt(10000000));
    });

    it("returns correct divisor for 2 decimals", () => {
      const divisor = getAssetDivisor(2);
      expect(divisor).toBe(BigInt(100));
    });

    it("returns correct divisor for 0 decimals", () => {
      const divisor = getAssetDivisor(0);
      expect(divisor).toBe(BigInt(1));
    });
  });

  describe("stroopsToAmount - Non-native Asset Formatting", () => {
    it("formats USDC with 7 decimals correctly", () => {
      // 100 USDC = 1,000,000,000 stroops
      const result = stroopsToAmount("1000000000", 7);
      expect(result).toBe("100");
    });

    it("formats USDC fractional amount", () => {
      // 10.5 USDC = 105,000,000 stroops
      const result = stroopsToAmount("105000000", 7);
      expect(result).toBe("10.5");
    });

    it("formats EURC with precision", () => {
      // 50.123456 EURC = 501,234,560 stroops
      const result = stroopsToAmount("501234560", 7);
      expect(result).toBe("50.123456");
    });

    it("formats very small amounts", () => {
      // 0.0000001 tokens = 1 stroop with 7 decimals
      const result = stroopsToAmount("1", 7);
      expect(result).toBe("0.0000001");
    });

    it("trims trailing zeros but keeps minimum 2 decimals", () => {
      // 10.50000000 should display as 10.5
      const result = stroopsToAmount("105000000", 7);
      expect(result).toBe("10.5");
    });

    it("handles large amounts with commas", () => {
      // 1,000,000 tokens = 10,000,000,000,000 stroops
      const result = stroopsToAmount("10000000000000", 7);
      expect(result).toBe("1,000,000");
    });

    it("formats NGN (Nigerian Naira) correctly", () => {
      // 5000 NGN = 50,000,000,000 stroops
      const result = stroopsToAmount("50000000000", 7);
      expect(result).toBe("5,000");
    });

    it("handles custom decimal precision", () => {
      // 2 decimal token: 100.50 = 10050 stroops
      const result = stroopsToAmount("10050", 2);
      expect(result).toBe("100.5");
    });

    it("works with BigInt input", () => {
      const result = stroopsToAmount(BigInt("1000000000"), 7);
      expect(result).toBe("100");
    });
  });

  describe("amountToStroops - Non-native Asset Conversion", () => {
    it("converts USDC amount to stroops", () => {
      const result = amountToStroops("100", 7);
      expect(result).toBe("1000000000");
    });

    it("converts USDC fractional amount", () => {
      const result = amountToStroops("10.5", 7);
      expect(result).toBe("105000000");
    });

    it("converts EURC with full precision", () => {
      const result = amountToStroops("50.1234567", 7);
      expect(result).toBe("501234567");
    });

    it("truncates excess decimals", () => {
      // More than 7 decimals should be truncated
      const result = amountToStroops("10.123456789", 7);
      expect(result).toBe("101234567");
    });

    it("pads missing decimals", () => {
      const result = amountToStroops("10.5", 7);
      expect(result).toBe("105000000");
    });

    it("handles amounts with commas", () => {
      const result = amountToStroops("1,000,000", 7);
      expect(result).toBe("10000000000000");
    });

    it("handles custom decimal precision", () => {
      const result = amountToStroops("100.50", 2);
      expect(result).toBe("10050");
    });

    it("handles whole numbers without decimals", () => {
      const result = amountToStroops("100", 7);
      expect(result).toBe("1000000000");
    });
  });

  describe("formatAmountWithAsset", () => {
    it("formats XLM with symbol", () => {
      const result = formatAmountWithAsset("10000000", "XLM");
      expect(result).toBe("1 XLM");
    });

    it("formats USDC with symbol", () => {
      const result = formatAmountWithAsset("1000000000", "USDC");
      expect(result).toBe("100 USDC");
    });

    it("formats EURC with symbol", () => {
      const result = formatAmountWithAsset("501234560", "EURC");
      expect(result).toBe("50.123456 EURC");
    });

    it("uses custom decimals when provided", () => {
      const result = formatAmountWithAsset("10050", "CUSTOM", 2);
      expect(result).toBe("100.5 CUSTOM");
    });

    it("works with BigInt input", () => {
      const result = formatAmountWithAsset(BigInt("1000000000"), "USDC");
      expect(result).toBe("100 USDC");
    });
  });

  describe("validateAmountFormat", () => {
    it("validates correct USDC format", () => {
      const result = validateAmountFormat("100.50", 7);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("validates EURC with full precision", () => {
      const result = validateAmountFormat("50.1234567", 7);
      expect(result.valid).toBe(true);
    });

    it("rejects empty amount", () => {
      const result = validateAmountFormat("", 7);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Amount is required");
    });

    it("rejects invalid format", () => {
      const result = validateAmountFormat("abc", 7);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid number format");
    });

    it("rejects too many decimals", () => {
      const result = validateAmountFormat("10.12345678", 7);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Maximum 7 decimal places allowed");
    });

    it("rejects negative amounts", () => {
      const result = validateAmountFormat("-10", 7);
      expect(result.valid).toBe(false);
    });

    it("rejects zero amount", () => {
      const result = validateAmountFormat("0", 7);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Amount must be greater than zero");
    });

    it("accepts amounts with commas", () => {
      const result = validateAmountFormat("1,000.50", 7);
      expect(result.valid).toBe(true);
    });

    it("validates 2-decimal precision asset", () => {
      const result = validateAmountFormat("100.50", 2);
      expect(result.valid).toBe(true);
    });

    it("rejects too many decimals for 2-decimal asset", () => {
      const result = validateAmountFormat("100.555", 2);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Maximum 2 decimal places allowed");
    });
  });

  describe("validateAmountRange", () => {
    it("validates amount within range", () => {
      const result = validateAmountRange("1000000000", "100000000", "2000000000");
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("rejects amount below minimum", () => {
      const result = validateAmountRange("50000000", "100000000", "2000000000");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Amount is below minimum");
    });

    it("rejects amount above maximum", () => {
      const result = validateAmountRange("3000000000", "100000000", "2000000000");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Amount exceeds maximum");
    });

    it("validates exact minimum", () => {
      const result = validateAmountRange("100000000", "100000000", "2000000000");
      expect(result.valid).toBe(true);
    });

    it("validates exact maximum", () => {
      const result = validateAmountRange("2000000000", "100000000", "2000000000");
      expect(result.valid).toBe(true);
    });

    it("works with BigInt inputs", () => {
      const result = validateAmountRange(
        BigInt("1000000000"),
        BigInt("100000000"),
        BigInt("2000000000")
      );
      expect(result.valid).toBe(true);
    });
  });

  describe("Round-trip conversion", () => {
    it("maintains precision for USDC", () => {
      const original = "100.123456";
      const stroops = amountToStroops(original, 7);
      const converted = stroopsToAmount(stroops, 7);
      expect(converted).toBe(original);
    });

    it("maintains precision for EURC", () => {
      const original = "50.5";
      const stroops = amountToStroops(original, 7);
      const converted = stroopsToAmount(stroops, 7);
      expect(converted).toBe(original);
    });

    it("maintains precision for custom 2-decimal asset", () => {
      const original = "100.50";
      const stroops = amountToStroops(original, 2);
      const converted = stroopsToAmount(stroops, 2);
      expect(converted).toBe("100.5"); // Trailing zero trimmed
    });
  });

  describe("STELLAR_ASSETS configuration", () => {
    it("includes XLM native asset", () => {
      expect(STELLAR_ASSETS.XLM).toBeDefined();
      expect(STELLAR_ASSETS.XLM.type).toBe("native");
      expect(STELLAR_ASSETS.XLM.decimals).toBe(7);
    });

    it("includes USDC with issuer", () => {
      expect(STELLAR_ASSETS.USDC).toBeDefined();
      expect(STELLAR_ASSETS.USDC.issuer).toBeDefined();
      expect(STELLAR_ASSETS.USDC.decimals).toBe(7);
    });

    it("includes EURC with issuer", () => {
      expect(STELLAR_ASSETS.EURC).toBeDefined();
      expect(STELLAR_ASSETS.EURC.issuer).toBeDefined();
      expect(STELLAR_ASSETS.EURC.decimals).toBe(7);
    });

    it("includes NGN", () => {
      expect(STELLAR_ASSETS.NGN).toBeDefined();
      expect(STELLAR_ASSETS.NGN.decimals).toBe(7);
    });
  });
});
