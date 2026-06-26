import { Router, Request, Response } from "express";
import * as StellarSdk from "@stellar/stellar-sdk";

const STELLAR_NETWORK = process.env.STELLAR_NETWORK || "testnet";

const HORIZON_URL =
  STELLAR_NETWORK === "mainnet"
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org";

export function createLedgerRouter(): Router {
  const router = Router();

  router.get("/ledger/latest", async (_req: Request, res: Response) => {
    try {
      const server = new StellarSdk.Horizon.Server(HORIZON_URL);

      const ledgerResponse = await server
        .ledgers()
        .order("desc")
        .limit(1)
        .call();

      if (!ledgerResponse.records || ledgerResponse.records.length === 0) {
        res.status(503).json({ error: "No ledger data available" });
        return;
      }

      const latest = ledgerResponse.records[0];

      res.json({
        sequence: latest.sequence,
        hash: latest.hash,
        closedAt: latest.closed_at,
        totalOps: latest.total_operations,
        protocolVersion: latest.protocol_version,
        txCount: latest.successful_transaction_count,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(502).json({
        error: "Failed to fetch latest ledger from Stellar network",
        details: msg,
      });
    }
  });

  return router;
}
