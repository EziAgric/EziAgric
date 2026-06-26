import { Router, Request, Response } from "express";
import { z } from "zod";
import * as StellarSdk from "@stellar/stellar-sdk";

const STELLAR_NETWORK = process.env.STELLAR_NETWORK || "testnet";

const networkPassphrase =
  STELLAR_NETWORK === "mainnet"
    ? StellarSdk.Networks.PUBLIC
    : StellarSdk.Networks.TESTNET;

const AssetSchema = z.object({
  code: z.string().min(1).max(12),
  issuer: z.string().regex(/^G[A-Z0-9]{55}$/, "Invalid Stellar public key"),
});

const AddTrustlineSchema = z.object({
  sourceAccount: z.string().regex(/^G[A-Z0-9]{55}$/, "Invalid Stellar public key"),
  asset: AssetSchema,
  limit: z.string().regex(/^\d+(\.\d+)?$/, "Must be a positive decimal").optional(),
});

const RemoveTrustlineSchema = z.object({
  sourceAccount: z.string().regex(/^G[A-Z0-9]{55}$/, "Invalid Stellar public key"),
  asset: AssetSchema,
});

export function createTrustlineRouter(): Router {
  const router = Router();

  router.post("/trustline", async (req: Request, res: Response) => {
    const parsed = AddTrustlineSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parsed.error.issues,
      });
      return;
    }

    const { sourceAccount, asset, limit } = parsed.data;

    try {
      const server = new StellarSdk.Horizon.Server(
        STELLAR_NETWORK === "mainnet"
          ? "https://horizon.stellar.org"
          : "https://horizon-testnet.stellar.org"
      );

      const account = await server.loadAccount(sourceAccount);

      const trustAsset = new StellarSdk.Asset(asset.code, asset.issuer);

      const operation = StellarSdk.Operation.changeTrust({
        asset: trustAsset,
        limit: limit ?? undefined,
      });

      const builder = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase,
      });

      builder.addOperation(operation);
      builder.setTimeout(180);

      const transaction = builder.build();

      res.json({
        envelopeXDR: transaction.toEnvelope().toXDR().toString("base64"),
        networkPassphrase,
      });
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        (error as { response?: { status?: number } }).response?.status === 404
      ) {
        res.status(404).json({ error: "Source account not found" });
        return;
      }

      const msg = error instanceof Error ? error.message : String(error);
      res.status(502).json({
        error: "Failed to build trustline transaction",
        details: msg,
      });
    }
  });

  router.delete("/trustline", async (req: Request, res: Response) => {
    const parsed = RemoveTrustlineSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parsed.error.issues,
      });
      return;
    }

    const { sourceAccount, asset } = parsed.data;

    try {
      const server = new StellarSdk.Horizon.Server(
        STELLAR_NETWORK === "mainnet"
          ? "https://horizon.stellar.org"
          : "https://horizon-testnet.stellar.org"
      );

      const account = await server.loadAccount(sourceAccount);

      const trustAsset = new StellarSdk.Asset(asset.code, asset.issuer);

      const operation = StellarSdk.Operation.changeTrust({
        asset: trustAsset,
        limit: "0",
      });

      const builder = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase,
      });

      builder.addOperation(operation);
      builder.setTimeout(180);

      const transaction = builder.build();

      res.json({
        envelopeXDR: transaction.toEnvelope().toXDR().toString("base64"),
        networkPassphrase,
      });
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        (error as { response?: { status?: number } }).response?.status === 404
      ) {
        res.status(404).json({ error: "Source account not found" });
        return;
      }

      const msg = error instanceof Error ? error.message : String(error);
      res.status(502).json({
        error: "Failed to build trustline transaction",
        details: msg,
      });
    }
  });

  return router;
}
