import { Response, Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import { validateRequest } from "../middleware/validateRequest";
import { AuthRequest } from "../services/auth.service";
import { ContractService } from "../services/contract.service";
import * as StellarSdk from "@stellar/stellar-sdk";

const stellarAddress = z
  .string()
  .refine((value) => StellarSdk.StrKey.isValidEd25519PublicKey(value), {
    message: "Must be a valid Stellar public key",
  });

const addMediatorBodySchema = z.object({
  mediatorAddress: stellarAddress,
});

const mediatorAddressParamSchema = z.object({
  address: stellarAddress,
});

const updateFeeBodySchema = z.object({
  feeBps: z.number().int().min(1).max(500),
});

export function createAdminContractRouter(contractService: ContractService = new ContractService()) {
  const router = Router();

  router.post(
    "/api/admin/contract/mediators",
    authMiddleware,
    adminMiddleware,
    validateRequest({ body: addMediatorBodySchema }),
    async (req: AuthRequest, res: Response, next) => {
      try {
        const { mediatorAddress } = req.body as { mediatorAddress: string };
        const adminAddress = req.user!.walletAddress;
        const result = await contractService.buildAddMediatorTx({
          adminAddress,
          mediatorAddress,
        });
        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    "/api/admin/contract/mediators/:address",
    authMiddleware,
    adminMiddleware,
    validateRequest({ params: mediatorAddressParamSchema }),
    async (req: AuthRequest, res: Response, next) => {
      try {
        const { address: mediatorAddress } = req.params as { address: string };
        const adminAddress = req.user!.walletAddress;
        const result = await contractService.buildRemoveMediatorTx({
          adminAddress,
          mediatorAddress,
        });
        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/api/admin/contract/fee",
    authMiddleware,
    adminMiddleware,
    validateRequest({ body: updateFeeBodySchema }),
    async (req: AuthRequest, res: Response, next) => {
      try {
        const { feeBps } = req.body as { feeBps: number };
        const adminAddress = req.user!.walletAddress;
        const result = await contractService.buildUpdateFeeBpsTx({
          adminAddress,
          feeBps,
        });
        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
