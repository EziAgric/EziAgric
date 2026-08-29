import { Keypair } from "@stellar/stellar-sdk";
import { prisma as defaultPrisma } from "../lib/db";
import { redis } from "../lib/redis";
import { appLogger } from "../middleware/logger";
import { env } from "../config/env";
import { horizonServer, sorobanRpcClient } from "../config/stellar";
import { getPinataClient } from "../config/ipfs";
import { AlertService, alertService as defaultAlertService } from "./alert.service";
import { getCircuitBreakerStates } from "../lib/circuitBreaker";
import { recordSorobanRpcHealth } from "../lib/metrics";

interface HealthIndicatorResult {
  status: "up" | "down";
  message: string;
  responseTime: number;
}

interface HealthCheckResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  checks: {
    database: HealthIndicatorResult;
    indexer: HealthIndicatorResult;
    stellar: HealthIndicatorResult;
    sorobanRpc: HealthIndicatorResult;
    ipfs: HealthIndicatorResult;
    redis: HealthIndicatorResult;
    config: HealthIndicatorResult;
    adminSigningKey?: HealthIndicatorResult;
  };
  details: {
    databaseLatency: number;
    redisLatency: number;
    indexerLagSeconds: number;
    lastProcessedLedger: number | null;
    stellarNetwork: string;
    ipfsGateway: string;
    missingEnvVars: string[];
    circuitBreakers: Array<{ name: string; state: string }>;
  };
}

interface HealthDatabase {
  $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
  processedEvent: {
    findFirst(args?: {
      orderBy?: { ledgerSequence?: "asc" | "desc" };
      take?: number;
    }): Promise<{ ledgerSequence: number; processedAt: Date } | null>;
  };
}
interface HealthRedis {
  ping(): Promise<string>;
}

export class HealthService {
  private startTime: number = Date.now();

  constructor(
    private readonly prisma: HealthDatabase = defaultPrisma,
    private readonly cacheClient: HealthRedis = redis as unknown as HealthRedis,
    private readonly alerts: AlertService = defaultAlertService,
  ) {}

  /**
   * Check database connectivity and query performance
   * Ensures TypeORM-like deep introspection with ~200ms bounds
   */
  private async checkDatabase(): Promise<HealthIndicatorResult> {
    const startTime = Date.now();
    const timeout = 200; // 200ms threshold

    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1 as health_check`,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Database query timeout")),
            timeout,
          ),
        ),
      ]);

      const responseTime = Date.now() - startTime;

      if (responseTime > timeout) {
        return {
          status: "down",
          message: `Database query exceeded ${timeout}ms threshold`,
          responseTime,
        };
      }

      return {
        status: "up",
        message: "Database connection healthy",
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      appLogger.error({ error }, "Database health check failed");
      return {
        status: "down",
        message: `Database check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        responseTime,
      };
    }
  }

  /**
   * Check indexer service health
   * Validates that the indexer has processed a ledger within the last 15 seconds
   * Ensures no background task halting
   */
  private async checkIndexer(): Promise<HealthIndicatorResult> {
    const startTime = Date.now();
    const maxLagSeconds = 15;

    try {
      const latestLedger = await this.prisma.processedEvent.findFirst({
        orderBy: { ledgerSequence: "desc" },
        take: 1,
      });

      const responseTime = Date.now() - startTime;

      if (!latestLedger) {
        return {
          status: "down",
          message: "No processed ledgers found - indexer may not have started",
          responseTime,
        };
      }

      const ledgerAge =
        (Date.now() - latestLedger.processedAt.getTime()) / 1000;

      if (ledgerAge > maxLagSeconds) {
        return {
          status: "down",
          message: `Indexer lag exceeds ${maxLagSeconds}s threshold (current: ${ledgerAge.toFixed(1)}s)`,
          responseTime,
        };
      }

      return {
        status: "up",
        message: `Indexer healthy - last ledger processed ${ledgerAge.toFixed(1)}s ago`,
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      appLogger.error({ error }, "Indexer health check failed");
      return {
        status: "down",
        message: `Indexer check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        responseTime,
      };
    }
  }

  /**
   * Check Stellar RPC connectivity
   */
  private async checkStellar(): Promise<HealthIndicatorResult> {
    const startTime = Date.now();
    const timeout = 5000;

    try {
      await Promise.race([
        horizonServer.loadAccount(env.AMANA_ESCROW_CONTRACT_ID),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Stellar RPC timeout")), timeout),
        ),
      ]);

      const responseTime = Date.now() - startTime;
      return {
        status: "up",
        message: "Stellar RPC connection healthy",
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      appLogger.error({ error }, "Stellar health check failed");
      return {
        status: "down",
        message: `Stellar check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        responseTime,
      };
    }
  }

  /**
   * Check Soroban RPC reachability — verifies the backend can reach the
   * Soroban RPC endpoint required by admin operations (contract invocations,
   * transaction signing, stream management). This is distinct from the
   * Horizon-based `checkStellar` which validates the Stellar network layer.
   *
   * Uses a lightweight `getHealth` or `getLatestLedger` call with a short
   * timeout to avoid impacting admin route latency.
   */
  async checkSorobanRpc(): Promise<HealthIndicatorResult> {
    const startTime = Date.now();
    const timeout = 5000;

    try {
      await Promise.race([
        sorobanRpcClient.getLatestLedger(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Soroban RPC timeout")), timeout),
        ),
      ]);

      const responseTime = Date.now() - startTime;
      recordSorobanRpcHealth("up", responseTime);
      return {
        status: "up",
        message: "Soroban RPC reachable",
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const message = error instanceof Error ? error.message : "Unknown error";
      appLogger.error({ error, responseTime }, "Soroban RPC health check failed");
      recordSorobanRpcHealth("down", responseTime);
      return {
        status: "down",
        message: `Soroban RPC unreachable: ${message}`,
        responseTime,
      };
    }
  }

  /**
   * Check IPFS/Pinata connectivity
   */
  private async checkIPFS(): Promise<HealthIndicatorResult> {
    const startTime = Date.now();
    const timeout = 5000;

    try {
      const pinata = getPinataClient();
      await Promise.race([
        (pinata as { testAuthentication?: () => Promise<unknown> }).testAuthentication?.()
          ?? Promise.resolve(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("IPFS timeout")), timeout),
        ),
      ]);

      const responseTime = Date.now() - startTime;
      return {
        status: "up",
        message: "IPFS/Pinata connection healthy",
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      appLogger.warn({ error }, "IPFS health check failed (optional service)");
      return {
        status: "down",
        message: `IPFS check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        responseTime,
      };
    }
  }

  /**
   * Check Redis cache connectivity
   */
  private async checkRedis(): Promise<HealthIndicatorResult> {
    const startTime = Date.now();
    const timeout = 3000;

    try {
      await Promise.race([
        this.cacheClient.ping(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Redis timeout")), timeout),
        ),
      ]);

      const responseTime = Date.now() - startTime;
      return {
        status: "up",
        message: "Redis connection healthy",
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      appLogger.error({ error }, "Redis health check failed");
      return {
        status: "down",
        message: `Redis check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        responseTime,
      };
    }
  }

  /**
   * Check configuration validity
   */
  private async checkConfig(): Promise<HealthIndicatorResult> {
    const startTime = Date.now();
    const missingVars: string[] = [];

    const criticalVars = [
      "DATABASE_URL",
      "JWT_SECRET",
      "AMANA_ESCROW_CONTRACT_ID",
      "USDC_CONTRACT_ID",
      "ADMIN_SECRET_KEY",
    ];

    for (const varName of criticalVars) {
      if (!process.env[varName]) {
        missingVars.push(varName);
      }
    }

    const responseTime = Date.now() - startTime;

    if (missingVars.length > 0) {
      return {
        status: "down",
        message: `Missing critical environment variables: ${missingVars.join(", ")}`,
        responseTime,
      };
    }

    return {
      status: "up",
      message: "Configuration valid",
      responseTime,
    };
  }

  /**
   * Check Soroban admin signing key validity
   * Verifies that ADMIN_SECRET_KEY is configured and can derive a valid public address
   */
  public async checkAdminSigningKey(): Promise<HealthIndicatorResult> {
    const startTime = Date.now();
    try {
      const secret = env.ADMIN_SECRET_KEY;
      if (!secret) {
        return {
          status: "down",
          message: "ADMIN_SECRET_KEY is missing",
          responseTime: Date.now() - startTime,
        };
      }
      const keypair = Keypair.fromSecret(secret);
      const publicKey = keypair.publicKey();
      if (!publicKey) {
        return {
          status: "down",
          message: "Unable to derive public key from ADMIN_SECRET_KEY",
          responseTime: Date.now() - startTime,
        };
      }
      return {
        status: "up",
        message: "Admin signing key valid",
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: "down",
        message: `Admin signing key check failed: ${error instanceof Error ? error.message : "Invalid key format"}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  private async dispatchAlerts(
    databaseCheck: HealthIndicatorResult,
    redisCheck: HealthIndicatorResult,
  ): Promise<void> {
    if (databaseCheck.status === "down") {
      await this.alerts.dispatch("db_connection_failure", databaseCheck.message, {
        responseTime: databaseCheck.responseTime,
      });
    }

    if (redisCheck.status === "down") {
      await this.alerts.dispatch("redis_connection_failure", redisCheck.message, {
        responseTime: redisCheck.responseTime,
      });
    }
  }

  /**
   * Check circuit breaker states for external service calls.
   */
  private checkCircuitBreakers(): Array<{ name: string; state: string }> {
    return getCircuitBreakerStates().map((cb) => ({
      name: cb.name,
      state: cb.state,
    }));
  }

  /**
   * Perform comprehensive health check
   * Returns detailed status for uptime integrations (Datadog, UptimeRobot, etc.)
   */
  async performHealthCheck(): Promise<HealthCheckResponse> {
    const timestamp = new Date().toISOString();
    const uptime = Date.now() - this.startTime;

    const [
      databaseCheck,
      indexerCheck,
      stellarCheck,
      sorobanRpcCheck,
      ipfsCheck,
      redisCheck,
      configCheck,
      adminSigningKeyCheck,
    ] = await Promise.all([
      this.checkDatabase(),
      this.checkIndexer(),
      this.checkStellar(),
      this.checkSorobanRpc(),
      this.checkIPFS(),
      this.checkRedis(),
      this.checkConfig(),
      this.checkAdminSigningKey(),
    ]);

    await this.dispatchAlerts(databaseCheck, redisCheck);

    let status: "healthy" | "degraded" | "unhealthy" = "healthy";

    if (
      databaseCheck.status === "down"
      || indexerCheck.status === "down"
      || stellarCheck.status === "down"
      || sorobanRpcCheck.status === "down"
      || configCheck.status === "down"
      || adminSigningKeyCheck.status === "down"
    ) {
      status = "unhealthy";
    } else if (
      redisCheck.status === "down"
      || ipfsCheck.status === "down"
      || databaseCheck.responseTime > 150
      || indexerCheck.responseTime > 150
      || stellarCheck.responseTime > 5000
    ) {
      status = "degraded";
    }

    let latestLedger: { ledgerSequence: number; processedAt: Date } | null = null;
    try {
      latestLedger = await this.prisma.processedEvent.findFirst({
        orderBy: { ledgerSequence: "desc" },
        take: 1,
      });
    } catch (error) {
      appLogger.error({ error }, "Failed to fetch latest ledger for health details");
    }

    const indexerLagSeconds = latestLedger
      ? (Date.now() - latestLedger.processedAt.getTime()) / 1000
      : -1;

    const missingEnvVars =
      configCheck.status === "down"
        ? configCheck.message
            .replace("Missing critical environment variables: ", "")
            .split(", ")
        : [];

    const circuitBreakers = this.checkCircuitBreakers();

    return {
      status,
      timestamp,
      uptime,
      checks: {
        database: databaseCheck,
        indexer: indexerCheck,
        stellar: stellarCheck,
        sorobanRpc: sorobanRpcCheck,
        ipfs: ipfsCheck,
        redis: redisCheck,
        config: configCheck,
        adminSigningKey: adminSigningKeyCheck,
      },
      details: {
        databaseLatency: databaseCheck.responseTime,
        redisLatency: redisCheck.responseTime,
        indexerLagSeconds: indexerLagSeconds > 0 ? indexerLagSeconds : 0,
        lastProcessedLedger: latestLedger?.ledgerSequence ?? null,
        stellarNetwork: env.STELLAR_NETWORK,
        ipfsGateway: env.IPFS_GATEWAY_URL,
        missingEnvVars,
        circuitBreakers,
      },
    };
  }

  /**
   * Perform readiness check for Kubernetes readiness probe.
   *
   * Only checks the critical internal dependencies that directly affect
   * the ability to serve traffic: database and Redis.
   *
   * Deliberately EXCLUDES degraded-but-tolerable external services
   * (Stellar RPC, IPFS/Pinata, on-chain indexer) so that a brownout on
   * those services does NOT remove the pod from the load-balancer
   * rotation and cause a self-inflicted outage.
   *
   * k8s usage:
   *   readinessProbe:
   *     httpGet: { path: /health/ready, port: 4000 }
   *     failureThreshold: 3
   *     periodSeconds: 10
   */
  async performReadinessCheck(): Promise<{
    status: "ready" | "not_ready";
    timestamp: string;
    checks: {
      database: HealthIndicatorResult;
      redis: HealthIndicatorResult;
    };
  }> {
    const timestamp = new Date().toISOString();

    const [databaseCheck, redisCheck] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    await this.dispatchAlerts(databaseCheck, redisCheck);

    const status =
      databaseCheck.status === "up" && redisCheck.status === "up"
        ? "ready"
        : "not_ready";

    return {
      status,
      timestamp,
      checks: {
        database: databaseCheck,
        redis: redisCheck,
      },
    };
  }

  /**
   * Perform startup readiness check
   * Checks critical dependencies needed for the application to start
   */
  async performStartupCheck(): Promise<{
    status: "ready" | "not_ready";
    timestamp: string;
    checks: Record<string, HealthIndicatorResult>;
  }> {
    const timestamp = new Date().toISOString();

    const [databaseCheck, redisCheck, configCheck, adminKeyCheck] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkConfig(),
      this.checkAdminSigningKey(),
    ]);

    const checks = {
      database: databaseCheck,
      redis: redisCheck,
      config: configCheck,
      adminSigningKey: adminKeyCheck,
    };

    const status = databaseCheck.status === "up" && redisCheck.status === "up" && configCheck.status === "up" && adminKeyCheck.status === "up"
      ? "ready"
      : "not_ready";

    return { status, timestamp, checks };
  }
}
