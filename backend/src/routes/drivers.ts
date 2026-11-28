/**
 * Drivers & Vehicles Routes
 *
 * Exposes logistics-integration endpoints for third-party providers to look up
 * driver assignments and vehicle registrations linked to active trades.
 *
 * Authentication: all endpoints require a valid Bearer JWT.
 * Authorization:
 *   - GET /drivers/:driverId  — seller, mediator, or admin role
 *   - GET /vehicles/:registration — seller, mediator, or admin role
 *   - POST /drivers           — seller role only (registers a driver for a trade)
 *   - POST /vehicles          — seller role only (registers a vehicle for a trade)
 *
 * Data model:
 *   Driver and vehicle data live on the DeliveryManifest model.  Sensitive
 *   identity fields (driverName, driverIdNumber) are stored in plaintext for
 *   mediator review; only their SHA-256 hashes are exposed on-chain.
 */

import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth.middleware";

const ALLOWED_ROLES = new Set(["seller", "mediator", "admin"]);

function requireRole(roles: Set<string>) {
  return (req: Request, res: Response, next: () => void) => {
    const user = (req as any).user as { role?: string } | undefined;
    if (!user || !user.role || !roles.has(user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

export function createDriversRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  // ── GET /drivers ──────────────────────────────────────────────────────────
  /**
   * List driver assignments across all manifests visible to the caller.
   * Sellers see only their own manifests; mediators and admins see all.
   */
  router.get(
    "/",
    requireRole(ALLOWED_ROLES),
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as { address?: string; role?: string };
        const where =
          user.role === "seller"
            ? { trade: { sellerAddress: user.address } }
            : {};

        const manifests = await prisma.deliveryManifest.findMany({
          where,
          select: {
            id: true,
            tradeId: true,
            driverName: true,
            driverIdNumber: true,
            driverNameHash: true,
            driverIdHash: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        });

        return res.status(200).json({ drivers: manifests });
      } catch (err) {
        return res
          .status(500)
          .json({ error: "Failed to list drivers", message: String(err) });
      }
    },
  );

  // ── GET /drivers/:driverId ─────────────────────────────────────────────────
  /**
   * Fetch a single driver record by manifest ID.
   */
  router.get(
    "/:driverId",
    requireRole(ALLOWED_ROLES),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.driverId);
        if (!Number.isInteger(id) || id < 1) {
          return res.status(400).json({ error: "Invalid driverId" });
        }

        const user = (req as any).user as { address?: string; role?: string };
        const manifest = await prisma.deliveryManifest.findFirst({
          where: {
            id,
            ...(user.role === "seller"
              ? { trade: { sellerAddress: user.address } }
              : {}),
          },
          select: {
            id: true,
            tradeId: true,
            driverName: true,
            driverIdNumber: true,
            driverNameHash: true,
            driverIdHash: true,
            vehicleRegistration: true,
            routeDescription: true,
            expectedDeliveryAt: true,
            createdAt: true,
          },
        });

        if (!manifest) {
          return res.status(404).json({ error: "Driver record not found" });
        }

        return res.status(200).json(manifest);
      } catch (err) {
        return res
          .status(500)
          .json({ error: "Failed to fetch driver", message: String(err) });
      }
    },
  );

  return router;
}

export function createVehiclesRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  // ── GET /vehicles ─────────────────────────────────────────────────────────
  /**
   * List vehicle registrations across all manifests visible to the caller.
   */
  router.get(
    "/",
    requireRole(ALLOWED_ROLES),
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as { address?: string; role?: string };
        const where =
          user.role === "seller"
            ? { trade: { sellerAddress: user.address } }
            : {};

        const manifests = await prisma.deliveryManifest.findMany({
          where,
          select: {
            id: true,
            tradeId: true,
            vehicleRegistration: true,
            routeDescription: true,
            expectedDeliveryAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        });

        return res.status(200).json({ vehicles: manifests });
      } catch (err) {
        return res
          .status(500)
          .json({ error: "Failed to list vehicles", message: String(err) });
      }
    },
  );

  // ── GET /vehicles/:registration ────────────────────────────────────────────
  /**
   * Fetch vehicle records by registration plate.
   * A registration can appear on multiple historical manifests.
   */
  router.get(
    "/:registration",
    requireRole(ALLOWED_ROLES),
    async (req: Request, res: Response) => {
      try {
        const registration = req.params.registration;
        const user = (req as any).user as { address?: string; role?: string };

        const manifests = await prisma.deliveryManifest.findMany({
          where: {
            vehicleRegistration: { equals: registration },
            ...(user.role === "seller"
              ? { trade: { sellerAddress: user.address } }
              : {}),
          },
          select: {
            id: true,
            tradeId: true,
            vehicleRegistration: true,
            routeDescription: true,
            expectedDeliveryAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        });

        if (manifests.length === 0) {
          return res
            .status(404)
            .json({ error: "No records found for that vehicle registration" });
        }

        return res.status(200).json({ vehicles: manifests });
      } catch (err) {
        return res
          .status(500)
          .json({ error: "Failed to fetch vehicle", message: String(err) });
      }
    },
  );

  return router;
}
