import { StellarService } from "./stellar.service";
import * as StellarSdk from "@stellar/stellar-sdk";
import { retryAsync } from "../lib/retry";
import { appLogger } from "../middleware/logger";
import { USDC_ISSUER_MAINNET, USDC_ISSUER_TESTNET } from "../config/stellar";
import { CircuitBreaker, CircuitBreakerOpenError } from "../lib/circuitBreaker";
import {
  getCachedQuote,
  setCachedQuote,
  QuoteRequest,
  CachedQuote,
} from "./quoteCache.service";

export interface PathPaymentQuoteResult {
  quotes: CachedQuote["quotes"];
  /** Whether the result came from cache. */
  cached: boolean;
  /** Freshness of the quote in milliseconds (0 if fresh from Horizon). */
  freshnessMs: number;
  /** ISO-8601 timestamp of when the quote was originally fetched. */
  quotedAt: string;
}

/** Default slippage tolerance (in percent) applied to strict-receive quotes. */
export const DEFAULT_SLIPPAGE_TOLERANCE_PERCENT = 1;

/** Default lifetime of a strict-receive quote, in milliseconds. */
export const DEFAULT_QUOTE_TTL_MS = 30_000;

export interface StrictReceiveQuoteParams {
  /** Amount of the destination asset the buyer wants to receive. */
  destAmount: string;
  /** Destination asset code, e.g. "cNGN". */
  destAssetCode: string;
  /** Optional issuer of the destination asset. */
  destAssetIssuer?: string;
  /** Source asset code, e.g. "NGN" or "XLM". */
  sourceAssetCode: string;
  /** Optional issuer of the source asset. */
  sourceAssetIssuer?: string;
  /** Slippage tolerance in percent (defaults to {@link DEFAULT_SLIPPAGE_TOLERANCE_PERCENT}). */
  slippageTolerancePercent?: number;
  /** Quote lifetime in milliseconds (defaults to {@link DEFAULT_QUOTE_TTL_MS}). */
  ttlMs?: number;
}

export interface StrictReceivePath {
  source_amount: string;
  source_asset_type: string;
  source_asset_code?: string;
  source_asset_issuer?: string;
  destination_amount: string;
  destination_asset_type: string;
  destination_asset_code?: string;
  destination_asset_issuer?: string;
  path: Array<{
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
  }>;
}

export interface StrictReceiveQuoteResult {
  /** Best path found by Horizon, or null when no path exists. */
  bestPath: StrictReceivePath | null;
  /** Source amount required for the destination amount (best path). */
  sourceAmount: string | null;
  /** Source amount including the slippage tolerance buffer. */
  sourceAmountWithSlippage: string | null;
  /** Slippage tolerance applied, in percent. */
  slippageTolerancePercent: number;
  /** ISO-8601 timestamp at which the quote expires. */
  expiresAt: string;
  /** ISO-8601 timestamp of when the quote was generated. */
  quotedAt: string;
  /** Whether a usable path was found. */
  found: boolean;
}

export class PathPaymentService {
  private stellarService: StellarService;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(circuitBreaker?: CircuitBreaker) {
    this.stellarService = new StellarService();
    this.circuitBreaker =
      circuitBreaker ??
      new CircuitBreaker("horizon-path-payment", {
        failureThreshold: 5,
        successThreshold: 2,
        cooldownMs: 30_000,
      });
  }

  /**
   * Discovers NGN -> USDC (or any asset to USDC) conversion routes.
   * Retries on transient errors and trips a circuit breaker on sustained Horizon outages.
   *
   * Uses a short-TTL Redis cache keyed by asset pair + amount so repeated
   * requests for the same route within the TTL window return cached results.
   * The response includes quote freshness metadata for slippage protection.
   */
  public async getPathPaymentQuote(
    sourceAmount: string,
    sourceAssetCode: string,
    sourceAssetIssuer?: string,
  ): Promise<PathPaymentQuoteResult> {
    const request: QuoteRequest = {
      sourceAmount,
      sourceAssetCode,
      sourceAssetIssuer,
    };

    // Check cache first
    const cached = await getCachedQuote(request);
    if (cached) {
      return {
        quotes: cached.quotes,
        cached: true,
        freshnessMs: cached.freshnessMs,
        quotedAt: cached.quotedAt,
      };
    }

    try {
      const server = this.stellarService.getServer();

      const sourceAsset =
        sourceAssetCode === "XLM" || sourceAssetCode === "native"
          ? StellarSdk.Asset.native()
          : new StellarSdk.Asset(
              sourceAssetCode,
              sourceAssetIssuer || "GASIVS63V6PAKAMW3ZYEX2RNNB3Q4UMRKDIQHNMH3LRNTSWVHXMTANKE",
            );

      const network = this.stellarService.getNetworkPassphrase();
      const usdcIssuer =
        network === StellarSdk.Networks.PUBLIC
          ? USDC_ISSUER_MAINNET
          : USDC_ISSUER_TESTNET;

      const destAssets = [new StellarSdk.Asset("USDC", usdcIssuer)];

      const paths = await this.circuitBreaker.call(() =>
        retryAsync(() =>
          server.strictSendPaths(sourceAsset, sourceAmount, destAssets).call(),
        ),
      );

      const quotes = paths.records.map((record) => ({
        source_amount: record.source_amount,
        source_asset_type: record.source_asset_type,
        source_asset_code: record.source_asset_code,
        destination_amount: record.destination_amount,
        destination_asset_type: record.destination_asset_type,
        destination_asset_code: record.destination_asset_code,
        path: record.path,
      }));

      // Cache the result
      await setCachedQuote(request, quotes);

      return {
        quotes,
        cached: false,
        freshnessMs: 0,
        quotedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        appLogger.warn({ error }, "Path payment circuit breaker open");
        throw new Error("Payment service temporarily unavailable");
      }
      appLogger.error({ error }, "Path payment quote error");
      throw new Error("Failed to fetch path payment quotes");
    }
  }

  /**
   * Computes a strict-receive quote: given a destination amount of `destAsset`
   * (e.g. cNGN), finds the best source amount of `sourceAsset` (e.g. NGN) the
   * buyer must pay, using Horizon strict-receive path finding.
   *
   * Returns the best path, the required source amount (with a slippage buffer),
   * and an expiry timestamp. When Horizon reports no path, `found` is false and
   * the path/source amounts are null rather than throwing.
   */
  public async getStrictReceiveQuote(
    params: StrictReceiveQuoteParams,
  ): Promise<StrictReceiveQuoteResult> {
    const {
      destAmount,
      destAssetCode,
      destAssetIssuer,
      sourceAssetCode,
      sourceAssetIssuer,
      slippageTolerancePercent = DEFAULT_SLIPPAGE_TOLERANCE_PERCENT,
      ttlMs = DEFAULT_QUOTE_TTL_MS,
    } = params;

    const quotedAt = new Date();
    const expiresAt = new Date(quotedAt.getTime() + ttlMs).toISOString();

    const buildAsset = (code: string, issuer?: string): StellarSdk.Asset => {
      if (code === "XLM" || code === "native") {
        return StellarSdk.Asset.native();
      }
      if (!issuer) {
        throw new Error(`Issuer is required for asset ${code}`);
      }
      return new StellarSdk.Asset(code, issuer);
    };

    try {
      const server = this.stellarService.getServer();
      const sourceAsset = buildAsset(sourceAssetCode, sourceAssetIssuer);
      const destAsset = buildAsset(destAssetCode, destAssetIssuer);

      const paths = await this.circuitBreaker.call(() =>
        retryAsync(() =>
          server.strictReceivePaths([sourceAsset], destAsset, destAmount).call(),
        ),
      );

      const records = paths.records as unknown as StrictReceivePath[];
      if (!records || records.length === 0) {
        return {
          bestPath: null,
          sourceAmount: null,
          sourceAmountWithSlippage: null,
          slippageTolerancePercent,
          expiresAt,
          quotedAt: quotedAt.toISOString(),
          found: false,
        };
      }

      // Horizon returns paths ordered by best (lowest) source amount first.
      const bestPath = records.reduce((best, current) =>
        Number(current.source_amount) < Number(best.source_amount)
          ? current
          : best,
      );

      const sourceAmount = bestPath.source_amount;
      const sourceAmountWithSlippage = (
        Number(sourceAmount) *
        (1 + slippageTolerancePercent / 100)
      ).toFixed(7);

      return {
        bestPath,
        sourceAmount,
        sourceAmountWithSlippage,
        slippageTolerancePercent,
        expiresAt,
        quotedAt: quotedAt.toISOString(),
        found: true,
      };
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        appLogger.warn({ error }, "Path payment circuit breaker open");
        throw new Error("Payment service temporarily unavailable");
      }
      appLogger.error({ error }, "Strict-receive path quote error");
      throw new Error("Failed to fetch path payment quotes");
    }
  }
}
