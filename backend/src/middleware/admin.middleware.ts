import { Response, NextFunction } from "express";
import { isMediatorAddress } from "../lib/accessControl";
import { AuthRequest } from "../services/auth.service";
import { AppError, ErrorCode } from "../errors/errorCodes";

export const adminMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const walletAddress = req.user?.walletAddress?.trim();
  if (!walletAddress || !isMediatorAddress(walletAddress)) {
    next(
      new AppError(
        ErrorCode.AUTH_ERROR,
        "Forbidden: admin access required",
        403,
      ),
    );
    return;
  }
  next();
};
