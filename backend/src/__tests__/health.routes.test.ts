import request from "supertest";
import { createApp } from "../app";
import express from "express";

/**
 * Test suite for tiered health endpoints (Issue #224).
 *
 * Probes and their isolation contracts:
 *   /health/live   — process-only, never touches I/O (liveness probe)
 *   /health/ready  — DB + Redis only (readiness probe), external deps excluded
 *   /health/startup — DB + Redis + config + adminKey (startup probe)
 *   /health         — full dependency matrix (observability only)
 */

const mockPerformHealthCheck = jest.fn();
const mockPerformReadinessCheck = jest.fn();
const mockPerformStartupCheck = jest.fn();

jest.mock("../services/health.service", () => ({
    HealthService: jest.fn().mockImplementation(() => ({
        performHealthCheck: mockPerformHealthCheck,
        performReadinessCheck: mockPerformReadinessCheck,
        performStartupCheck: mockPerformStartupCheck,
    })),
}));

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────

function makeFullHealthResult(status: "healthy" | "degraded" | "unhealthy" = "healthy") {
    return {
        status,
        timestamp: "2026-01-01T00:00:00.000Z",
        uptime: 10000,
        checks: {
            database: { status: "up", message: "ok", responseTime: 5 },
            redis: { status: "up", message: "ok", responseTime: 3 },
            indexer: { status: "up", message: "ok", responseTime: 10 },
            stellar: { status: "up", message: "ok", responseTime: 100 },
            sorobanRpc: { status: "up", message: "ok", responseTime: 80 },
            ipfs: { status: "up", message: "ok", responseTime: 200 },
            config: { status: "up", message: "ok", responseTime: 0 },
            adminSigningKey: { status: "up", message: "ok", responseTime: 1 },
        },
        details: {
            databaseLatency: 5,
            redisLatency: 3,
            indexerLagSeconds: 2,
            lastProcessedLedger: 99999,
            stellarNetwork: "testnet",
            ipfsGateway: "https://gateway.pinata.cloud",
            missingEnvVars: [],
            circuitBreakers: [],
        },
    };
}

function makeReadinessResult(status: "ready" | "not_ready" = "ready", overrides: Partial<{
    database: { status: "up" | "down"; message: string; responseTime: number };
    redis: { status: "up" | "down"; message: string; responseTime: number };
}> = {}) {
    return {
        status,
        timestamp: "2026-01-01T00:00:00.000Z",
        checks: {
            database: overrides.database ?? { status: "up" as const, message: "ok", responseTime: 5 },
            redis: overrides.redis ?? { status: "up" as const, message: "ok", responseTime: 3 },
        },
    };
}

function makeStartupResult(status: "ready" | "not_ready" = "ready") {
    return {
        status,
        timestamp: "2026-01-01T00:00:00.000Z",
        checks: {
            database: { status: "up", message: "ok", responseTime: 5 },
            redis: { status: "up", message: "ok", responseTime: 3 },
            config: { status: "up", message: "ok", responseTime: 0 },
            adminSigningKey: { status: "up", message: "ok", responseTime: 1 },
        },
    };
}

describe("Tiered Health Endpoints (Issue #224)", () => {
    let app: express.Application;

    beforeEach(() => {
        mockPerformHealthCheck.mockReset();
        mockPerformReadinessCheck.mockReset();
        mockPerformStartupCheck.mockReset();
        app = createApp();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // /health/live — liveness probe (process-only truth)
    // ─────────────────────────────────────────────────────────────────────────
    describe("GET /health/live — liveness probe", () => {
        it("returns 200 with alive status immediately", async () => {
            const res = await request(app).get("/health/live");

            expect(res.status).toBe(200);
            expect(res.body.status).toBe("alive");
            expect(res.body).toHaveProperty("timestamp");
        });

        it("never calls performHealthCheck (no I/O)", async () => {
            await request(app).get("/health/live");

            expect(mockPerformHealthCheck).not.toHaveBeenCalled();
        });

        it("never calls performReadinessCheck (no I/O)", async () => {
            await request(app).get("/health/live");

            expect(mockPerformReadinessCheck).not.toHaveBeenCalled();
        });

        it("never calls performStartupCheck (no I/O)", async () => {
            await request(app).get("/health/live");

            expect(mockPerformStartupCheck).not.toHaveBeenCalled();
        });

        it("remains alive even when external dependency mock is broken", async () => {
            // Simulate a scenario where performHealthCheck would throw — liveness must be unaffected
            mockPerformHealthCheck.mockRejectedValue(new Error("Stellar RPC down"));
            mockPerformReadinessCheck.mockRejectedValue(new Error("DB timeout"));

            const res = await request(app).get("/health/live");

            expect(res.status).toBe(200);
            expect(res.body.status).toBe("alive");
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // /health/ready — readiness probe (DB + Redis only)
    // ─────────────────────────────────────────────────────────────────────────
    describe("GET /health/ready — readiness probe (DB + Redis isolation)", () => {
        it("returns 200 ready when DB and Redis are up", async () => {
            mockPerformReadinessCheck.mockResolvedValue(makeReadinessResult("ready"));

            const res = await request(app).get("/health/ready");

            expect(res.status).toBe(200);
            expect(res.body.status).toBe("ready");
            expect(res.body).toHaveProperty("timestamp");
            expect(res.body).toHaveProperty("checks");
        });

        it("checks include database and redis", async () => {
            mockPerformReadinessCheck.mockResolvedValue(makeReadinessResult("ready"));

            const res = await request(app).get("/health/ready");

            expect(res.body.checks).toHaveProperty("database");
            expect(res.body.checks).toHaveProperty("redis");
        });

        it("does NOT expose stellar, ipfs, or indexer checks", async () => {
            mockPerformReadinessCheck.mockResolvedValue(makeReadinessResult("ready"));

            const res = await request(app).get("/health/ready");

            // These external deps must be excluded from the readiness response
            expect(res.body.checks).not.toHaveProperty("stellar");
            expect(res.body.checks).not.toHaveProperty("sorobanRpc");
            expect(res.body.checks).not.toHaveProperty("ipfs");
            expect(res.body.checks).not.toHaveProperty("indexer");
        });

        it("calls performReadinessCheck (not performHealthCheck)", async () => {
            mockPerformReadinessCheck.mockResolvedValue(makeReadinessResult("ready"));

            await request(app).get("/health/ready");

            expect(mockPerformReadinessCheck).toHaveBeenCalledTimes(1);
            expect(mockPerformHealthCheck).not.toHaveBeenCalled();
        });

        it("returns 503 not_ready when DB is down", async () => {
            mockPerformReadinessCheck.mockResolvedValue(
                makeReadinessResult("not_ready", {
                    database: { status: "down", message: "Connection refused", responseTime: 200 },
                })
            );

            const res = await request(app).get("/health/ready");

            expect(res.status).toBe(503);
            expect(res.body.status).toBe("not_ready");
            expect(res.body.checks.database.status).toBe("down");
        });

        it("returns 503 not_ready when Redis is down", async () => {
            mockPerformReadinessCheck.mockResolvedValue(
                makeReadinessResult("not_ready", {
                    redis: { status: "down", message: "ECONNREFUSED", responseTime: 3000 },
                })
            );

            const res = await request(app).get("/health/ready");

            expect(res.status).toBe(503);
            expect(res.body.status).toBe("not_ready");
        });

        it("remains ready even when Stellar RPC is degraded (brownout resilience)", async () => {
            // Key scenario: Stellar brownout must NOT un-ready the pod.
            // performReadinessCheck only checks DB+Redis, so Stellar state is irrelevant.
            mockPerformReadinessCheck.mockResolvedValue(makeReadinessResult("ready"));

            const res = await request(app).get("/health/ready");

            expect(res.status).toBe(200);
            expect(res.body.status).toBe("ready");
        });

        it("remains ready even when IPFS is unavailable (brownout resilience)", async () => {
            mockPerformReadinessCheck.mockResolvedValue(makeReadinessResult("ready"));

            const res = await request(app).get("/health/ready");

            expect(res.status).toBe(200);
            expect(res.body.status).toBe("ready");
        });

        it("returns 503 with error on service exception", async () => {
            mockPerformReadinessCheck.mockRejectedValue(new Error("Unexpected failure"));

            const res = await request(app).get("/health/ready");

            expect(res.status).toBe(503);
            expect(res.body.status).toBe("not_ready");
            expect(res.body).toHaveProperty("error");
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // /health/startup — startup probe
    // ─────────────────────────────────────────────────────────────────────────
    describe("GET /health/startup — startup probe", () => {
        it("returns 200 ready when all critical deps are up", async () => {
            mockPerformStartupCheck.mockResolvedValue(makeStartupResult("ready"));

            const res = await request(app).get("/health/startup");

            expect(res.status).toBe(200);
            expect(res.body.status).toBe("ready");
            expect(res.body).toHaveProperty("checks");
        });

        it("calls performStartupCheck (not performReadinessCheck or performHealthCheck)", async () => {
            mockPerformStartupCheck.mockResolvedValue(makeStartupResult("ready"));

            await request(app).get("/health/startup");

            expect(mockPerformStartupCheck).toHaveBeenCalledTimes(1);
            expect(mockPerformHealthCheck).not.toHaveBeenCalled();
            expect(mockPerformReadinessCheck).not.toHaveBeenCalled();
        });

        it("returns 503 not_ready when database is down", async () => {
            mockPerformStartupCheck.mockResolvedValue({
                ...makeStartupResult("not_ready"),
                checks: {
                    database: { status: "down", message: "DB error", responseTime: 200 },
                    redis: { status: "up", message: "ok", responseTime: 3 },
                    config: { status: "up", message: "ok", responseTime: 0 },
                    adminSigningKey: { status: "up", message: "ok", responseTime: 1 },
                },
            });

            const res = await request(app).get("/health/startup");

            expect(res.status).toBe(503);
            expect(res.body.status).toBe("not_ready");
        });

        it("returns 503 on service exception", async () => {
            mockPerformStartupCheck.mockRejectedValue(new Error("Unexpected error"));

            const res = await request(app).get("/health/startup");

            expect(res.status).toBe(503);
            expect(res.body.status).toBe("not_ready");
            expect(res.body).toHaveProperty("error");
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // GET /health — full dependency check (observability only)
    // ─────────────────────────────────────────────────────────────────────────
    describe("GET /health — full dependency check", () => {
        it("returns 200 with full check matrix when healthy", async () => {
            mockPerformHealthCheck.mockResolvedValue(makeFullHealthResult("healthy"));

            const res = await request(app).get("/health");

            expect(res.status).toBe(200);
            expect(res.body.status).toBe("healthy");
            expect(res.body.checks).toHaveProperty("database");
            expect(res.body.checks).toHaveProperty("redis");
            expect(res.body.checks).toHaveProperty("stellar");
            expect(res.body.checks).toHaveProperty("sorobanRpc");
            expect(res.body.checks).toHaveProperty("ipfs");
            expect(res.body.checks).toHaveProperty("indexer");
        });

        it("returns 200 when degraded", async () => {
            mockPerformHealthCheck.mockResolvedValue(makeFullHealthResult("degraded"));

            const res = await request(app).get("/health");

            expect(res.status).toBe(200);
            expect(res.body.status).toBe("degraded");
        });

        it("returns 503 when unhealthy", async () => {
            mockPerformHealthCheck.mockResolvedValue(makeFullHealthResult("unhealthy"));

            const res = await request(app).get("/health");

            expect(res.status).toBe(503);
            expect(res.body.status).toBe("unhealthy");
        });

        it("returns 503 with error on service exception", async () => {
            mockPerformHealthCheck.mockRejectedValue(new Error("DB exploded"));

            const res = await request(app).get("/health");

            expect(res.status).toBe(503);
            expect(res.body.status).toBe("unhealthy");
            expect(res.body).toHaveProperty("error");
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Tier isolation contract — cross-probe independence
    // ─────────────────────────────────────────────────────────────────────────
    describe("Tier isolation contract", () => {
        it("liveness is unaffected by readiness state", async () => {
            mockPerformReadinessCheck.mockResolvedValue(makeReadinessResult("not_ready", {
                database: { status: "down", message: "DB down", responseTime: 200 },
            }));

            const [liveRes, readyRes] = await Promise.all([
                request(app).get("/health/live"),
                request(app).get("/health/ready"),
            ]);

            expect(liveRes.status).toBe(200);
            expect(liveRes.body.status).toBe("alive");
            expect(readyRes.status).toBe(503);
            expect(readyRes.body.status).toBe("not_ready");
        });

        it("readiness is unaffected by full health check state", async () => {
            // Full health is unhealthy (external deps down) but readiness is fine
            mockPerformHealthCheck.mockResolvedValue(makeFullHealthResult("unhealthy"));
            mockPerformReadinessCheck.mockResolvedValue(makeReadinessResult("ready"));

            const [fullRes, readyRes] = await Promise.all([
                request(app).get("/health"),
                request(app).get("/health/ready"),
            ]);

            expect(fullRes.status).toBe(503);
            expect(readyRes.status).toBe(200);
            expect(readyRes.body.status).toBe("ready");
        });
    });
});
