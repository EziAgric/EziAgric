import { Router, Request, Response } from "express";
import { Keypair } from "@stellar/stellar-sdk";
import axios from "axios";
import { env } from "../config/env";
import { appLogger } from "../middleware/logger";
import { encrypt } from "../lib/crypto";

const FRIENDBOT_URL = "https://friendbot.stellar.org";

async function fundViaFriendbot(publicKey: string): Promise<void> {
  await axios.get(FRIENDBOT_URL, { params: { addr: publicKey }, timeout: 15_000 });
}

export function createStellarAccountCreateRouter(): Router {
  const router = Router();

  /**
   * POST /stellar/account/create
   *
   * Body (all optional):
   *   { fund?: boolean }
   *
   * fund=true on testnet triggers a friendbot airdrop.
   * On mainnet, fund is ignored (no automatic funding available).
   *
   * Returns:
   *   { publicKey, encryptedSecretKey, funded }
   */
  router.post("/", async (req: Request, res: Response) => {
    const fund = req.body?.fund === true;
    const isTestnet = env.STELLAR_NETWORK === "testnet";

    const keypair = Keypair.random();
    const publicKey = keypair.publicKey();
    const encryptedSecretKey = encrypt(keypair.secret());

    let funded = false;

    if (fund && isTestnet) {
      try {
        await fundViaFriendbot(publicKey);
        funded = true;
      } catch (error) {
        appLogger.warn({ error, publicKey }, "Friendbot funding failed; account still created");
      }
    } else if (fund && !isTestnet) {
      appLogger.info({ publicKey }, "Mainnet account created without automatic funding");
    }

    res.status(201).json({ publicKey, encryptedSecretKey, funded });
  });

  return router;
}

export const stellarAccountCreateRoutes = createStellarAccountCreateRouter();
