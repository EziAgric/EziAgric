jest.mock("../../lib/db", () => ({ prisma: {} }));
jest.mock("../../config/env", () => ({ env: {} }));
jest.mock("../ipfs.service", () => ({ IPFSService: jest.fn(), ServiceUnavailableError: class extends Error {} }));
jest.mock("../../lib/accessControl", () => ({ getAdminAllowlistLowercase: () => new Set() }));
const mockInfo = jest.fn();
jest.mock("../../middleware/logger", () => ({ appLogger: { info: (...a: unknown[]) => mockInfo(...a) } }));

import {
  EvidenceService,
  EvidenceAccessDeniedError,
  EvidenceNotFoundError,
  EvidenceRetractionConflictError,
  EVIDENCE_RETRACTION_WINDOW_MS,
} from "../evidence.service";

const SELLER = "GSELLER";
const uploadedAt = new Date("2026-11-25T10:00:00Z");
const withinWindow = new Date(uploadedAt.getTime() + 30 * 60 * 1000);

function setup(overrides: Record<string, unknown> = {}, trade: Record<string, unknown> = {}) {
  const db = {
    trade: { findUnique: jest.fn() },
    tradeEvidence: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({
        id: 5,
        tradeId: "t-1",
        uploadedBy: SELLER.toLowerCase(),
        createdAt: uploadedAt,
        deletedAt: null,
        trade: { status: "FUNDED", deliveredAt: null, ...trade },
        ...overrides,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db, service: new EvidenceService(db as any, {} as any) };
}

describe("EvidenceService.retractEvidence (#936)", () => {
  beforeEach(() => mockInfo.mockClear());

  it("soft-deletes within the window and logs EvidenceRetracted", async () => {
    const { db, service } = setup();

    await expect(service.retractEvidence(5, SELLER, withinWindow)).resolves.toEqual({
      id: 5, tradeId: "t-1", retractedAt: withinWindow,
    });
    expect(db.tradeEvidence.updateMany).toHaveBeenCalledWith({
      where: { id: 5, deletedAt: null },
      data: { deletedAt: withinWindow },
    });
    expect(mockInfo).toHaveBeenCalledWith(
      expect.objectContaining({ event: "EvidenceRetracted", evidenceId: 5, tradeId: "t-1" }),
      expect.any(String),
    );
  });

  it("allows retraction at exactly the 1 hour boundary", async () => {
    const { service } = setup();
    const edge = new Date(uploadedAt.getTime() + EVIDENCE_RETRACTION_WINDOW_MS);
    await expect(service.retractEvidence(5, SELLER, edge)).resolves.toBeDefined();
  });

  it("409s once the window has elapsed", async () => {
    const { db, service } = setup();
    const late = new Date(uploadedAt.getTime() + EVIDENCE_RETRACTION_WINDOW_MS + 1);
    await expect(service.retractEvidence(5, SELLER, late)).rejects.toBeInstanceOf(EvidenceRetractionConflictError);
    expect(db.tradeEvidence.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: "DELIVERED" }],
    [{ status: "COMPLETED" }],
    [{ status: "DISPUTED" }],
    [{ status: "FUNDED", deliveredAt: new Date() }],
  ])("409s when the buyer has already confirmed (%p)", async (trade) => {
    const { service } = setup({}, trade);
    await expect(service.retractEvidence(5, SELLER, withinWindow)).rejects.toMatchObject({
      status: 409,
      message: "Buyer has already confirmed delivery",
    });
  });

  it("403s when the caller did not upload the evidence", async () => {
    const { service } = setup();
    await expect(service.retractEvidence(5, "GBUYER", withinWindow)).rejects.toBeInstanceOf(EvidenceAccessDeniedError);
  });

  it("404s for missing, already-retracted, or concurrently-retracted evidence", async () => {
    const missing = setup();
    missing.db.tradeEvidence.findUnique.mockResolvedValue(null);
    await expect(missing.service.retractEvidence(5, SELLER, withinWindow)).rejects.toBeInstanceOf(EvidenceNotFoundError);

    const retracted = setup({ deletedAt: uploadedAt });
    await expect(retracted.service.retractEvidence(5, SELLER, withinWindow)).rejects.toBeInstanceOf(EvidenceNotFoundError);

    const raced = setup();
    raced.db.tradeEvidence.updateMany.mockResolvedValue({ count: 0 });
    await expect(raced.service.retractEvidence(5, SELLER, withinWindow)).rejects.toBeInstanceOf(EvidenceNotFoundError);
  });

  it("excludes retracted evidence from trade listings", async () => {
    const { db, service } = setup();
    db.trade.findUnique.mockResolvedValue({ buyerAddress: "gbuyer", sellerAddress: SELLER.toLowerCase() });
    db.tradeEvidence.findMany.mockResolvedValue([]);
    await service.getEvidenceByTradeId("t-1", SELLER);
    expect(db.tradeEvidence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tradeId: "t-1", deletedAt: null } }),
    );
  });
});
