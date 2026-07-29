import { Response, NextFunction } from "express";
import { isMediatorAddress } from "../lib/accessControl";
import { AuthRequest } from "../services/auth.service";

export const adminMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const walletAddress = req.user?.walletAddress?.trim();
  if (!walletAddress || !isMediatorAddress(walletAddress)) {
    res.status(403).json({ error: "Forbidden: admin access required" });
    return;
  }

  // Attach admin identity to the request context so downstream handlers
  // and audit logs can record which admin invoked a privileged action.
  if (req.user) {
    req.user.isAdmin = true;
  }

  next();
};
