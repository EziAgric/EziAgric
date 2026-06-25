import { PrismaClient } from "@prisma/client";
import { Response, Router } from "express";
import { z } from "zod";
import { prisma as defaultPrisma } from "../lib/db";
import { authMiddleware } from "../middleware/auth.middleware";
import { validateRequest } from "../middleware/validateRequest";
import { AuthRequest } from "../services/auth.service";

const listNotificationsQuerySchema = z.object({
  unreadOnly: z.coerce.boolean().default(false),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const notificationIdParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, "Notification ID must be a numeric string"),
});

function caller(req: AuthRequest, res: Response): string | null {
  const walletAddress = req.user?.walletAddress?.trim();
  if (!walletAddress) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return walletAddress;
}

export function createNotificationsRouter(prisma: PrismaClient = defaultPrisma) {
  const router = Router();

  router.get(
    "/notifications",
    authMiddleware,
    validateRequest({ query: listNotificationsQuerySchema }),
    async (req: AuthRequest, res: Response, next) => {
      try {
        const walletAddress = caller(req, res);
        if (!walletAddress) return;

        const { unreadOnly, page, limit } = req.query as unknown as {
          unreadOnly: boolean;
          page: number;
          limit: number;
        };
        const skip = (page - 1) * limit;

        const where = { userAddress: walletAddress };
        if (unreadOnly) {
          (where as Record<string, unknown>).isRead = false;
        }

        const [notifications, total, unreadCount] = await Promise.all([
          prisma.inAppNotification.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
            select: {
              id: true,
              title: true,
              message: true,
              type: true,
              isRead: true,
              metadata: true,
              createdAt: true,
            },
          }),
          prisma.inAppNotification.count({ where }),
          prisma.inAppNotification.count({
            where: { userAddress: walletAddress, isRead: false },
          }),
        ]);

        res.status(200).json({
          notifications,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
          unreadCount,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/notifications/:id/read",
    authMiddleware,
    validateRequest({ params: notificationIdParamsSchema }),
    async (req: AuthRequest, res: Response, next) => {
      try {
        const walletAddress = caller(req, res);
        if (!walletAddress) return;

        const notificationId = Number(req.params.id);

        const notification = await prisma.inAppNotification.findUnique({
          where: { id: notificationId },
          select: { userAddress: true, isRead: true },
        });

        if (!notification) {
          res.status(404).json({ error: "Notification not found" });
          return;
        }

        if (notification.userAddress !== walletAddress) {
          res.status(403).json({ error: "Forbidden: you do not own this notification" });
          return;
        }

        if (notification.isRead) {
          res.status(200).json({ message: "Notification already marked as read" });
          return;
        }

        await prisma.inAppNotification.update({
          where: { id: notificationId },
          data: { isRead: true },
        });

        res.status(200).json({ message: "Notification marked as read" });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/notifications/read-all",
    authMiddleware,
    async (req: AuthRequest, res: Response, next) => {
      try {
        const walletAddress = caller(req, res);
        if (!walletAddress) return;

        const result = await prisma.inAppNotification.updateMany({
          where: { userAddress: walletAddress, isRead: false },
          data: { isRead: true },
        });

        res.status(200).json({
          message: "All notifications marked as read",
          count: result.count,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
