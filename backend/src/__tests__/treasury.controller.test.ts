import { TreasuryController } from "../controllers/treasury.controller";
import type { AuthRequest } from "../services/auth.service";
import type { Response } from "express";

const VALID_DESTINATION = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

function mockResponse(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

function mockRequest(body: Record<string, unknown>): AuthRequest {
  return {
    body,
    user: { walletAddress: "GADMIN1234567890" },
  } as unknown as AuthRequest;
}

describe("TreasuryController.withdraw note handling", () => {
  let mockTreasuryService: { withdraw: jest.Mock };
  let controller: TreasuryController;

  beforeEach(() => {
    mockTreasuryService = {
      withdraw: jest.fn().mockResolvedValue({ unsignedXdr: "unsigned-xdr" }),
    };
    controller = new TreasuryController(mockTreasuryService as any);
  });

  it("forwards a valid note to the service", async () => {
    const req = mockRequest({
      destination: VALID_DESTINATION,
      amount: "100",
      note: "Reclaiming expired escrow funds",
    });
    const res = mockResponse();

    await controller.withdraw(req, res);

    expect(mockTreasuryService.withdraw).toHaveBeenCalledWith(
      VALID_DESTINATION,
      "100",
      "GADMIN1234567890",
      "Reclaiming expired escrow funds",
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("allows the note to be omitted", async () => {
    const req = mockRequest({ destination: VALID_DESTINATION, amount: "100" });
    const res = mockResponse();

    await controller.withdraw(req, res);

    expect(mockTreasuryService.withdraw).toHaveBeenCalledWith(
      VALID_DESTINATION,
      "100",
      "GADMIN1234567890",
      undefined,
    );
  });

  it("rejects a non-string note", async () => {
    const req = mockRequest({ destination: VALID_DESTINATION, amount: "100", note: 12345 });
    const res = mockResponse();

    await controller.withdraw(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Note must be a string" });
    expect(mockTreasuryService.withdraw).not.toHaveBeenCalled();
  });

  it("rejects a note over 2000 characters", async () => {
    const req = mockRequest({
      destination: VALID_DESTINATION,
      amount: "100",
      note: "a".repeat(2001),
    });
    const res = mockResponse();

    await controller.withdraw(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Note must be 2000 characters or fewer" });
    expect(mockTreasuryService.withdraw).not.toHaveBeenCalled();
  });
});
