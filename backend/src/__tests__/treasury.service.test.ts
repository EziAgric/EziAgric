import { TreasuryService } from "../services/treasury.service";

jest.mock("../services/stellar.service", () => ({
  StellarService: jest.fn().mockImplementation(() => ({
    getAccountBalance: jest.fn(),
  })),
}));

jest.mock("../lib/accessControl", () => ({
  isMediatorAddress: jest.fn(() => true),
}));

const ADMIN_ADDRESS = "GADMIN1234567890";
const DESTINATION = "GDEST1234567890";

describe("TreasuryService.withdraw", () => {
  let mockPrisma: { adminActionAudit: { create: jest.Mock } };
  let treasuryService: TreasuryService;

  beforeEach(() => {
    mockPrisma = {
      adminActionAudit: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    treasuryService = new TreasuryService(mockPrisma as any);
  });

  it("persists an admin action audit record without a note", async () => {
    await treasuryService.withdraw(DESTINATION, "100", ADMIN_ADDRESS);

    expect(mockPrisma.adminActionAudit.create).toHaveBeenCalledWith({
      data: {
        action: "TREASURY_WITHDRAW",
        actorAddress: ADMIN_ADDRESS,
        targetReference: DESTINATION,
        note: null,
      },
    });
  });

  it("persists the operator-supplied note for compliance", async () => {
    await treasuryService.withdraw(
      DESTINATION,
      "100",
      ADMIN_ADDRESS,
      "Reclaiming funds from expired escrow per ticket OPS-42",
    );

    expect(mockPrisma.adminActionAudit.create).toHaveBeenCalledWith({
      data: {
        action: "TREASURY_WITHDRAW",
        actorAddress: ADMIN_ADDRESS,
        targetReference: DESTINATION,
        note: "Reclaiming funds from expired escrow per ticket OPS-42",
      },
    });
  });

  it("rejects withdrawal and skips persistence for non-admin callers", async () => {
    const { isMediatorAddress } = jest.requireMock("../lib/accessControl") as {
      isMediatorAddress: jest.Mock;
    };
    isMediatorAddress.mockReturnValueOnce(false);

    await expect(
      treasuryService.withdraw(DESTINATION, "100", "GNOTADMIN", "some note"),
    ).rejects.toThrow("Only admin can withdraw treasury funds");

    expect(mockPrisma.adminActionAudit.create).not.toHaveBeenCalled();
  });
});
