import { Router, Request, Response } from "express";
import { Asset } from "@stellar/stellar-sdk";
import { horizonServer } from "../config/stellar";
import { appLogger } from "../middleware/logger";
import { alertService } from "../services/alert.service";
import {
  computeBufferedFee,
  feeBufferOptionsFromEnv,
} from "../services/feeEstimator.service";

const DEFAULT_QUOTE_TTL_SECONDS = 30;
const DEFAULT_SLIPPAGE_TOLERANCE = 0.01;

function parseAsset(raw: string): Asset {
  const value = raw.trim();
  if (value.toUpperCase() === "XLM" || value.toUpperCase() === "NATIVE") {
    return Asset.native();
  }
  const [code, issuer] = value.split(":");
  if (!code || !issuer) {
    throw new Error(`Invalid asset "${raw}". Expected "CODE:ISSUER" or "XLM".`);
  }
  return new Asset(code, issuer);
}

export function createStellarFeesRouter(): Router {
  const router = Router();

  router.get("/", async (req: Request, res: Response) => {
    try {
      const feeStats = await horizonServer.feeStats();

      const opts = feeBufferOptionsFromEnv();
      const estimate = computeBufferedFee(feeStats, opts);

      // Optional operation count so callers can size a multi-op transaction fee.
      const opsRaw = Number.parseInt(String(req.query.operations ?? "1"), 10);
      const operations = Number.isFinite(opsRaw) && opsRaw > 0 ? Math.min(opsRaw, 100) : 1;
      const recommendedTxFee = estimate.bufferedFee * operations;

      if (estimate.congested) {
        void alertService.dispatch(
          "stellar_fee_congestion",
          "Stellar network congestion detected in fee estimation",
          {
            percentile: estimate.percentile,
            percentileFee: estimate.percentileFee,
            baseFee: estimate.baseFee,
            ledgerCapacityUsage: estimate.ledgerCapacityUsage,
            bufferedFee: estimate.bufferedFee,
            lastLedger: feeStats.last_ledger,
          },
        );
      }

      res.json({
        // Raw Horizon fee stats — unchanged, kept for backward compatibility.
        feeCharged: feeStats.fee_charged,
        maxFee: feeStats.max_fee,
        ledger: parseInt(feeStats.last_ledger, 10),
        lastLedgerBaseFee: parseInt(feeStats.last_ledger_base_fee, 10),
        ledgerCapacityUsage: estimate.ledgerCapacityUsage,
        // Buffered recommendation (issue #184).
        recommended: {
          perOperationFee: estimate.bufferedFee,
          transactionFee: recommendedTxFee,
          operations,
          percentile: estimate.percentile,
          percentileFee: estimate.percentileFee,
          multiplier: estimate.multiplier,
          congested: estimate.congested,
          cappedAtMax: estimate.cappedAtMax,
          minStroops: opts.minStroops,
          maxStroops: opts.maxStroops,
        },
      });
    } catch (error) {
      appLogger.error({ error }, "Failed to fetch Stellar fee stats");
      res.status(502).json({
        error: "Failed to fetch fee data from Stellar network",
      });
    }
  });

  // GET /quotes/path — NGN → cNGN strict-receive path finding (issue #378).
  router.get("/quotes/path", async (req: Request, res: Response) => {
    try {
      const destAmountRaw = String(req.query.dest_amount ?? "").trim();
      const destAssetRaw = String(req.query.dest_asset ?? "").trim();
      const sourceAssetRaw = String(req.query.source_asset ?? "").trim();

      if (!destAmountRaw || !destAssetRaw || !sourceAssetRaw) {
        return res.status(400).json({
          error:
            "dest_amount, dest_asset and source_asset query parameters are required",
        });
      }

      const destAmount = Number(destAmountRaw);
      if (!Number.isFinite(destAmount) || destAmount <= 0) {
        return res.status(400).json({
          error: "dest_amount must be a positive number",
        });
      }

      let destAsset: Asset;
      let sourceAsset: Asset;
      try {
        destAsset = parseAsset(destAssetRaw);
        sourceAsset = parseAsset(sourceAssetRaw);
      } catch (error) {
        return res.status(400).json({
          error: error instanceof Error ? error.message : "Invalid asset",
        });
      }

      const slippageRaw = Number.parseFloat(
        String(req.query.slippage ?? DEFAULT_SLIPPAGE_TOLERANCE),
      );
      const slippageTolerance =
        Number.isFinite(slippageRaw) && slippageRaw >= 0 && slippageRaw < 1
          ? slippageRaw
          : DEFAULT_SLIPPAGE_TOLERANCE;

      const ttlRaw = Number.parseInt(
        String(req.query.ttl ?? DEFAULT_QUOTE_TTL_SECONDS),
        10,
      );
      const ttlSeconds =
        Number.isFinite(ttlRaw) && ttlRaw > 0
          ? Math.min(ttlRaw, 300)
          : DEFAULT_QUOTE_TTL_SECONDS;

      const paths = await horizonServer
        .strictReceivePaths(sourceAsset, destAsset, destAmountRaw)
        .call();

      const records = paths.records ?? [];
      if (records.length === 0) {
        return res.status(404).json({
          error: "No path found for the requested conversion",
          destAmount,
          destAsset: destAssetRaw,
          sourceAsset: sourceAssetRaw,
        });
      }

      const best = records.reduce((acc, record) =>
        Number(record.source_amount) < Number(acc.source_amount) ? record : acc,
      );

      const sourceAmount = Number(best.source_amount);
      const maxSourceAmount = sourceAmount * (1 + slippageTolerance);
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

      res.json({
        sourceAsset: sourceAssetRaw,
        destAsset: destAssetRaw,
        destAmount,
        sourceAmount,
        maxSourceAmount,
        slippageTolerance,
        path: best.path ?? [],
        expiresAt,
      });
    } catch (error) {
      appLogger.error({ error }, "Failed to find strict-receive path");
      res.status(502).json({
        error: "Failed to fetch path data from Stellar network",
      });
    }
  });

  return router;
}

export const stellarFeesRoutes = createStellarFeesRouter();
