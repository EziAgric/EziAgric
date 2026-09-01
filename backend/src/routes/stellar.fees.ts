import { Router, Request, Response } from "express";
import { horizonServer } from "../config/stellar";
import { appLogger } from "../middleware/logger";
import { alertService } from "../services/alert.service";
import {
  computeBufferedFee,
  feeBufferOptionsFromEnv,
} from "../services/feeEstimator.service";

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

  return router;
}

export const stellarFeesRoutes = createStellarFeesRouter();
