import type { Response } from "express";
import { AuthRequest } from "../services/auth.service";
import { TreasuryService } from "../services/treasury.service";
import { appLogger } from "../middleware/logger";
import * as StellarSdk from "@stellar/stellar-sdk";

export class TreasuryController {
  constructor(private readonly treasuryService: TreasuryService = new TreasuryService()) {}

  getBalance = async (_req: AuthRequest, res: Response): Promise<Response | void> => {
    try {
      const balance = await this.treasuryService.getBalance();
      return res.status(200).json(balance);
    } catch (error) {
      appLogger.error({ error }, "Failed to get treasury balance");
      return res.status(500).json({ error: "Failed to get treasury balance" });
    }
  };

  withdraw = async (req: AuthRequest, res: Response): Promise<Response | void> => {
    try {
      const callerAddress = req.user?.walletAddress;
      if (!callerAddress) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { destination, amount, note } = req.body as {
        destination: string;
        amount: string | number;
        note?: string;
      };

      // Convert amount to string for the service
      const amountStr = typeof amount === "number" ? amount.toString() : amount;

      const result = await this.treasuryService.withdraw(
        destination,
        amountStr,
        callerAddress,
        note?.trim(),
      );
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error && error.message === "Only admin can withdraw treasury funds") {
        return res.status(403).json({ error: error.message });
      }
      appLogger.error({ error }, "Treasury withdrawal failed");
      return res.status(500).json({ error: "Treasury withdrawal failed" });
    }
  };

  getConfig = async (_req: AuthRequest, res: Response): Promise<Response | void> => {
    try {
      const config = this.treasuryService.getConfig();
      return res.status(200).json(config);
    } catch (error) {
      appLogger.error({ error }, "Failed to get treasury config");
      return res.status(500).json({ error: "Failed to get treasury config" });
    }
  };
}
