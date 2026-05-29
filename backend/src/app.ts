import cors from "cors";
import express from "express";
import { PrismaClient } from "@prisma/client";

export function createApp(prisma?: PrismaClient): express.Application {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", async (_req, res) => {
    let dbStatus: string;
    try {
      if (prisma) {
        await prisma.$queryRaw`SELECT 1`;
        dbStatus = "connected";
      } else {
        dbStatus = "not_configured";
      }
    } catch {
      dbStatus = "disconnected";
    }

    const isHealthy = dbStatus === "connected" || dbStatus === "not_configured";
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? "ok" : "degraded",
      service: "amana-backend",
      timestamp: new Date().toISOString(),
      db: dbStatus,
    });
  });

  return app;
}
