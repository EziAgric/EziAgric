import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { appLogger } from "../middleware/logger";
import { DisputeError, extendEvidenceDeadline } from "../services/disputeService";

export function createDisputeRoutes(): Router {
  const router = Router();

  /**
   * PATCH /disputes/:id/deadline
   * Assigned mediator extends the evidence deadline ({ extensionHours }, max 72h, 2 extensions).
   */
  router.patch("/:id/deadline", authMiddleware, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const walletAddress = (req as any).user?.walletAddress as string | undefined;
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "Invalid dispute id" });
    }
    if (!walletAddress) return res.status(401).json({ error: "Unauthorized" });

    try {
      const result = await extendEvidenceDeadline(id, walletAddress, req.body?.extensionHours);
      return res.json(result);
    } catch (err) {
      if (err instanceof DisputeError) return res.status(err.status).json({ error: err.message });
      appLogger.error({ err, disputeId: id }, "Failed to extend dispute deadline");
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
