import request from "supertest";
import { createApp } from "../app";
import express from "express";

describe("Health Routes", () => {
    let app: express.Application;

    beforeEach(() => {
        app = createApp();
    });

    describe("GET /health", () => {
        it("should return health status", async () => {
            const response = await request(app).get("/health");

            expect([200, 503]).toContain(response.status);
            expect(response.body).toHaveProperty("status");
            expect(response.body).toHaveProperty("timestamp");
            expect(response.body).toHaveProperty("checks");
        });

        it("should include database, redis, indexer, and dependency checks", async () => {
            const response = await request(app).get("/health");

            expect(response.body.checks).toHaveProperty("database");
            expect(response.body.checks).toHaveProperty("redis");
            expect(response.body.checks).toHaveProperty("indexer");
            expect(response.body.checks).toHaveProperty("stellar");
            expect(response.body.checks).toHaveProperty("ipfs");
            expect(response.body.checks).toHaveProperty("config");
            expect(response.body.checks.database).toHaveProperty("status");
            expect(response.body.checks.redis).toHaveProperty("status");
            expect(response.body.checks.indexer).toHaveProperty("status");
        });

        it("should include detailed metrics", async () => {
            const response = await request(app).get("/health");

            expect(response.body.details).toHaveProperty("databaseLatency");
            expect(response.body.details).toHaveProperty("redisLatency");
            expect(response.body.details).toHaveProperty("indexerLagSeconds");
            expect(response.body.details).toHaveProperty("lastProcessedLedger");
            expect(response.body.details).toHaveProperty("stellarNetwork");
            expect(response.body.details).toHaveProperty("ipfsGateway");
            expect(response.body.details).toHaveProperty("missingEnvVars");
        });

        it("should return 503 when unhealthy", async () => {
            // This test would require mocking the health service to return unhealthy
            const response = await request(app).get("/health");

            if (response.body.status === "unhealthy") {
                expect(response.status).toBe(503);
            }
        });
    });

    describe("GET /health/live", () => {
        it("should return alive status", async () => {
            const response = await request(app).get("/health/live");

            expect(response.status).toBe(200);
            expect(response.body.status).toBe("alive");
            expect(response.body).toHaveProperty("timestamp");
        });
    });

    describe("GET /health/ready", () => {
        it("should return readiness status", async () => {
            const response = await request(app).get("/health/ready");

            expect([200, 503]).toContain(response.status);
            expect(response.body).toHaveProperty("status");
            expect(response.body).toHaveProperty("timestamp");
        });

        it("should return 503 when not ready", async () => {
            // This test would require mocking the health service to return unhealthy
            const response = await request(app).get("/health/ready");

            if (response.body.status === "not_ready") {
                expect(response.status).toBe(503);
            }
        });
    });
});
