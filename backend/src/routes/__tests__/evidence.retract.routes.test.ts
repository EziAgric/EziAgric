import express from "express";
import request from "supertest";

jest.mock("../../lib/db", () => ({ prisma: {} }));
jest.mock("../../config/env", () => ({ env: { EVIDENCE_MAX_BYTES: 1024 } }));
jest.mock("../../lib/rateLimit", () => ({
  createWalletRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock("../../middleware/idempotency", () => ({
  idempotencyMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock("../../middleware/logger", () => ({ appLogger: { info: jest.fn(), error: jest.fn() } }));
jest.mock("../../middleware/auth.middleware", () => ({
  authMiddleware: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { walletAddress: "GSELLER" };
    next();
  },
}));
jest.mock("../../services/ipfs.service", () => ({ IPFSService: jest.fn(), ServiceUnavailableError: class extends Error {} }));

jest.mock("@stellar/stellar-sdk", () => ({ StrKey: { isValidEd25519PublicKey: () => true } }));

import { createEvidenceRouter } from "../evidence.routes";
import {
  EvidenceService,
  EvidenceNotFoundError,
  EvidenceAccessDeniedError,
  EvidenceRetractionConflictError,
} from "../../services/evidence.service";

const retractEvidence = jest.fn();
const app = express().use(
  createEvidenceRouter({ retractEvidence } as unknown as EvidenceService),
);

describe("DELETE /evidence/:id (#936)", () => {
  beforeEach(() => retractEvidence.mockReset());

  it("returns 200 with the retraction for the uploader", async () => {
    retractEvidence.mockResolvedValue({ id: 5, tradeId: "t-1", retractedAt: "2026-11-25T10:30:00.000Z" });
    const res = await request(app).delete("/evidence/5");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 5, tradeId: "t-1", retractedAt: "2026-11-25T10:30:00.000Z" });
    expect(retractEvidence).toHaveBeenCalledWith(5, "GSELLER");
  });

  it.each([
    [new EvidenceRetractionConflictError("Retraction window has elapsed"), 409],
    [new EvidenceRetractionConflictError("Buyer has already confirmed delivery"), 409],
    [new EvidenceAccessDeniedError(), 403],
    [new EvidenceNotFoundError(), 404],
  ])("maps %p to %i", async (err, status) => {
    retractEvidence.mockRejectedValue(err);
    const res = await request(app).delete("/evidence/5");
    expect(res.status).toBe(status);
    expect(res.body.error).toBe(err.message);
  });

  it("rejects non-numeric ids with 400", async () => {
    const res = await request(app).delete("/evidence/abc");
    expect(res.status).toBe(400);
    expect(retractEvidence).not.toHaveBeenCalled();
  });
});
