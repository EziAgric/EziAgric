import { AdminAuditService } from "../services/adminAudit.service";

describe("AdminAuditService.list", () => {
  let mockPrisma: {
    adminActionAudit: { findMany: jest.Mock; count: jest.Mock };
  };
  let adminAuditService: AdminAuditService;

  beforeEach(() => {
    mockPrisma = {
      adminActionAudit: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    adminAuditService = new AdminAuditService(mockPrisma as any);
  });

  it("returns paginated results ordered newest-first with default pagination", async () => {
    const records = [
      {
        id: 2,
        action: "TREASURY_WITHDRAW",
        actorAddress: "GADMIN",
        targetReference: "GDEST",
        note: "OPS-42",
        createdAt: new Date("2026-07-02T00:00:00Z"),
      },
    ];
    mockPrisma.adminActionAudit.findMany.mockResolvedValue(records);
    mockPrisma.adminActionAudit.count.mockResolvedValue(1);

    const result = await adminAuditService.list();

    expect(mockPrisma.adminActionAudit.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      skip: 0,
      take: 20,
    });
    expect(result).toEqual({
      items: records,
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it("honors page and limit query params", async () => {
    mockPrisma.adminActionAudit.count.mockResolvedValue(45);

    const result = await adminAuditService.list({ page: 2, limit: 10 });

    expect(mockPrisma.adminActionAudit.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      skip: 10,
      take: 10,
    });
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 45, totalPages: 5 });
  });

  it("caps the limit at 100 even if a larger value is requested", async () => {
    await adminAuditService.list({ limit: 500 });

    expect(mockPrisma.adminActionAudit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });

  it("falls back to defaults for invalid page/limit values", async () => {
    await adminAuditService.list({ page: -1, limit: 0 });

    expect(mockPrisma.adminActionAudit.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      skip: 0,
      take: 20,
    });
  });
});
