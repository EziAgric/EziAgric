import { Router, Request, Response, NextFunction } from "express";
import { HealthService } from "../services/health.service";
import { appLogger } from "../middleware/logger";

/**
 * Health router implementing three distinct probe tiers for Kubernetes:
 *
 * GET /health/live   — liveness probe: process-only truth, no I/O.
 *   k8s: livenessProbe → restart the pod if this returns non-2xx.
 *   Never checks external deps; only confirms the Node process is alive.
 *
 * GET /health/ready  — readiness probe: critical internal deps only (DB + Redis).
 *   k8s: readinessProbe → remove from load balancer rotation if non-2xx.
 *   Excludes degraded-but-tolerable externals (Stellar RPC, IPFS, indexer)
 *   so third-party brownouts do NOT crash-loop or route-shed pods.
 *   During graceful shutdown, returns 503 immediately so k8s stops routing
 *   traffic before the server begins draining in-flight requests.
 *
 * GET /health/startup — startup probe: same critical subset as readiness
 *   plus config + admin signing key. Used on initial container start.
 *   k8s: startupProbe → gives the container more time to initialise.
 *
 * GET /health         — full check: all dependencies, for observability UIs
 *   (Datadog, UptimeRobot). Not used by any k8s probe directly.
 */
export function createHealthRouter(isShuttingDown?: () => boolean): Router {
    const router = Router();
    const healthService = new HealthService();

    /**
     * GET /health
     * Full dependency matrix — for observability dashboards only.
     * Not used as a k8s probe.
     */
    router.get("/", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const healthCheck = await healthService.performHealthCheck();

            appLogger.info(
                { status: healthCheck.status, checks: healthCheck.checks },
                "Health check performed"
            );

            const statusCode = healthCheck.status === "unhealthy" ? 503 : 200;

            res.status(statusCode).json(healthCheck);
        } catch (error) {
            appLogger.error({ error }, "Health check failed");
            res.status(503).json({
                status: "unhealthy",
                timestamp: new Date().toISOString(),
                error: "Health check failed",
            });
        }
    });

    /**
     * GET /health/live
     * Liveness probe — process-only, zero I/O.
     * k8s: livenessProbe → restart pod on failure.
     *
     * Always 200 as long as the process is running. External dependency
     * failures must NEVER appear here; that would cause unnecessary
     * pod restarts during a third-party brownout.
     */
    router.get("/live", (_req: Request, res: Response) => {
        res.status(200).json({
            status: "alive",
            timestamp: new Date().toISOString(),
        });
    });

    /**
     * GET /health/ready
     * Readiness probe — DB + Redis only.
     * k8s: readinessProbe → remove from load balancer rotation on failure.
     *
     * Excludes Stellar RPC, IPFS, and the on-chain indexer because those
     * are degraded-but-tolerable externals. A Stellar RPC slowdown should
     * degrade service gracefully, not trigger a deploy storm.
     *
     * During graceful shutdown, returns 503 immediately so the load
     * balancer stops routing traffic while in-flight requests drain.
     */
    router.get("/ready", async (req: Request, res: Response, next: NextFunction) => {
        if (isShuttingDown?.()) {
            res.status(503).json({
                status: "not_ready",
                reason: "shutdown_in_progress",
                timestamp: new Date().toISOString(),
            });
            return;
        }

        try {
            const readinessCheck = await healthService.performReadinessCheck();

            const statusCode = readinessCheck.status === "ready" ? 200 : 503;
            res.status(statusCode).json({
                status: readinessCheck.status,
                timestamp: readinessCheck.timestamp,
                checks: readinessCheck.checks,
            });
        } catch (error) {
            appLogger.error({ error }, "Readiness check failed");
            res.status(503).json({
                status: "not_ready",
                timestamp: new Date().toISOString(),
                error: "Readiness check failed",
            });
        }
    });

    /**
     * GET /health/startup
     * Startup probe — critical subset: DB, Redis, config, admin signing key.
     * k8s: startupProbe → gives pod extra initialisation time before
     *      liveness/readiness probes take over.
     */
    router.get("/startup", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const startupCheck = await healthService.performStartupCheck();

            const statusCode = startupCheck.status === "ready" ? 200 : 503;
            res.status(statusCode).json({
                status: startupCheck.status,
                timestamp: startupCheck.timestamp,
                checks: startupCheck.checks,
            });
        } catch (error) {
            appLogger.error({ error }, "Startup check failed");
            res.status(503).json({
                status: "not_ready",
                timestamp: new Date().toISOString(),
                error: "Startup check failed",
            });
        }
    });

    return router;
}
