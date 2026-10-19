import express from "express";
import request from "supertest";
import { createJobHealthRoutes } from "../routes/job-health.routes";
import { prisma } from "../lib/db";
import {
  DAY_MS,
  computeAggregateUptime,
  computeJobUptime,
  HeartbeatEventSample,
} from "../services/jobUptime";

jest.mock("../middleware/auth.middleware", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { walletAddress: "GADMIN" };
    next();
  },
}));

jest.mock("../middleware/admin.middleware", () => ({
  adminMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../services/jobHeartbeat.service", () => ({
  JobType: {},
  jobHeartbeatService: {
    getAllJobHealth: jest.fn(),
    getJobHealth: jest.fn(),
  },
}));

jest.mock("../lib/db", () => ({
  prisma: {
    jobHeartbeat: { findMany: jest.fn() },
    jobHeartbeatEvent: { findMany: jest.fn() },
  },
}));

const mockPrisma = prisma as unknown as {
  jobHeartbeat: { findMany: jest.Mock };
  jobHeartbeatEvent: { findMany: jest.Mock };
};

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date("2026-10-19T12:00:00.000Z").getTime();

const event = (
  jobType: string,
  status: string,
  ageMs: number,
): HeartbeatEventSample => ({
  jobType,
  status,
  recordedAt: new Date(NOW - ageMs),
});

/** One completed heartbeat per interval, for `count` intervals back from now. */
const completedEvery = (jobType: string, intervalMs: number, count: number) =>
  Array.from({ length: count }, (_, i) =>
    event(jobType, "completed", i * intervalMs + intervalMs / 2),
  );

const heartbeatRow = (jobType: string, intervalMs: number) => ({
  id: 1,
  jobType,
  status: "idle",
  lastHeartbeat: new Date(NOW - 10 * 60 * 1000),
  nextExpectedAt: new Date(NOW + intervalMs),
  intervalMs,
  failureCount: 0,
  lastError: null,
  lastCheckedAt: new Date(NOW),
  notes: null,
  createdAt: new Date(NOW - 30 * DAY_MS),
  updatedAt: new Date(NOW),
});

describe("job uptime calculation", () => {
  it("returns null when there is no history", () => {
    expect(computeJobUptime([], HOUR_MS, DAY_MS, NOW)).toBeNull();
    expect(
      computeAggregateUptime([{ jobType: "a", intervalMs: HOUR_MS }], [], DAY_MS, NOW),
    ).toBeNull();
  });

  it("reports 100% when every expected run completed", () => {
    const events = completedEvery("a", HOUR_MS, 24);
    expect(computeJobUptime(events, HOUR_MS, DAY_MS, NOW)).toBe(100);
  });

  it("reports the fraction of expected runs that completed", () => {
    // 24 hourly slots, only the most recent 12 have a completed heartbeat;
    // the older 12 only recorded failures.
    const events = [
      ...completedEvery("a", HOUR_MS, 12),
      ...Array.from({ length: 12 }, (_, i) =>
        event("a", "failed", (12 + i) * HOUR_MS + HOUR_MS / 2),
      ),
    ];
    expect(computeJobUptime(events, HOUR_MS, DAY_MS, NOW)).toBe(50);
  });

  it("does not count started or failed pings as up", () => {
    const events = [event("a", "started", HOUR_MS / 2), event("a", "failed", HOUR_MS / 4)];
    expect(computeJobUptime(events, HOUR_MS, HOUR_MS, NOW)).toBe(0);
  });

  it("only measures the tracked portion when history is shorter than the window", () => {
    // History started 4h ago; 3 of the 4 hourly slots completed.
    const events = [
      event("a", "started", 4 * HOUR_MS),
      event("a", "completed", 0.5 * HOUR_MS),
      event("a", "completed", 1.5 * HOUR_MS),
      event("a", "completed", 2.5 * HOUR_MS),
    ];
    expect(computeJobUptime(events, HOUR_MS, 7 * DAY_MS, NOW)).toBe(75);
  });

  it("averages uptime across jobs that have history", () => {
    const jobs = [
      { jobType: "a", intervalMs: HOUR_MS },
      { jobType: "b", intervalMs: HOUR_MS },
      { jobType: "c", intervalMs: HOUR_MS }, // no history, excluded
    ];
    const events = [
      ...completedEvery("a", HOUR_MS, 24),
      ...completedEvery("b", HOUR_MS, 6),
      event("b", "started", 24 * HOUR_MS),
    ];
    // a = 100%, b = 6/24 = 25% → average 62.5%
    expect(computeAggregateUptime(jobs, events, DAY_MS, NOW)).toBe(62.5);
  });
});

describe("GET /health/dashboard uptime", () => {
  const app = express();
  app.use(express.json());
  app.use("/health", createJobHealthRoutes());

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, "now").mockReturnValue(NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("computes uptime fields from heartbeat history instead of hardcoding zero", async () => {
    mockPrisma.jobHeartbeat.findMany.mockResolvedValue([
      heartbeatRow("webhook", HOUR_MS),
      heartbeatRow("reconciliation", DAY_MS),
    ]);
    mockPrisma.jobHeartbeatEvent.findMany.mockResolvedValue([
      // webhook: 7 days of history, last day fully up, 6 earlier days down
      ...completedEvery("webhook", HOUR_MS, 24),
      event("webhook", "failed", 7 * DAY_MS - HOUR_MS / 2),
      // reconciliation: completed every day for 7 days
      ...completedEvery("reconciliation", DAY_MS, 7),
    ]);

    const res = await request(app).get("/health/dashboard");

    expect(res.status).toBe(200);
    const { uptime, jobDetails } = res.body.analytics;

    // webhook: 100% (1d), 24/168 ≈ 14.29% (7d); reconciliation: 100% both
    expect(uptime.lastDayUptime).toBe(100);
    expect(uptime.last7DaysUptime).toBeCloseTo((100 + (24 / 168) * 100) / 2, 2);
    expect(uptime.jobsWithHistory).toBe(2);
    expect(uptime.historyRetentionDays).toBe(8);

    const webhook = jobDetails.find((j: { jobType: string }) => j.jobType === "webhook");
    expect(webhook.lastDayUptime).toBe(100);
    expect(webhook.last7DaysUptime).toBeCloseTo((24 / 168) * 100, 2);
  });

  it("reports null uptime when no heartbeat history exists yet", async () => {
    mockPrisma.jobHeartbeat.findMany.mockResolvedValue([heartbeatRow("webhook", HOUR_MS)]);
    mockPrisma.jobHeartbeatEvent.findMany.mockResolvedValue([]);

    const res = await request(app).get("/health/dashboard");

    expect(res.status).toBe(200);
    expect(res.body.analytics.uptime.lastDayUptime).toBeNull();
    expect(res.body.analytics.uptime.last7DaysUptime).toBeNull();
    expect(res.body.analytics.uptime.jobsWithHistory).toBe(0);
  });
});
