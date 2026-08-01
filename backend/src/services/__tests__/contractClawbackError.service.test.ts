/**
 * Tests for backend contract clawback error mapping (Issue #97).
 *
 * Verifies that each on-chain error code string is correctly mapped to the
 * expected `AppError` with the right HTTP status code, `ErrorCode`, and
 * user-friendly message.
 */

import {
  CONTRACT_CLAWBACK_ERROR_CODES,
  mapClawbackErrorCode,
  mapContractClawbackError,
  parseContractClawbackErrorCode,
} from "../../services/contractClawbackError.service";
import { AppError, ErrorCode } from "../../errors/errorCodes";

describe("parseContractClawbackErrorCode", () => {
  it("returns UNAUTHORIZED when message contains CLAWBACK_UNAUTHORIZED", () => {
    const result = parseContractClawbackErrorCode(
      "WasmVm error: CLAWBACK_UNAUTHORIZED",
    );
    expect(result).toBe(CONTRACT_CLAWBACK_ERROR_CODES.UNAUTHORIZED);
  });

  it("returns STREAM_NOT_FOUND when message contains CLAWBACK_STREAM_NOT_FOUND", () => {
    const result = parseContractClawbackErrorCode(
      "Contract panicked: CLAWBACK_STREAM_NOT_FOUND",
    );
    expect(result).toBe(CONTRACT_CLAWBACK_ERROR_CODES.STREAM_NOT_FOUND);
  });

  it("returns INVALID_AMOUNT when message contains CLAWBACK_INVALID_AMOUNT", () => {
    const result = parseContractClawbackErrorCode("CLAWBACK_INVALID_AMOUNT");
    expect(result).toBe(CONTRACT_CLAWBACK_ERROR_CODES.INVALID_AMOUNT);
  });

  it("returns INSUFFICIENT_VESTED when message contains CLAWBACK_INSUFFICIENT_VESTED", () => {
    const result = parseContractClawbackErrorCode(
      "invoke error: CLAWBACK_INSUFFICIENT_VESTED somewhere",
    );
    expect(result).toBe(CONTRACT_CLAWBACK_ERROR_CODES.INSUFFICIENT_VESTED);
  });

  it("returns INVALID_STATUS when message contains CLAWBACK_INVALID_STATUS", () => {
    const result = parseContractClawbackErrorCode(
      "vm panic: CLAWBACK_INVALID_STATUS",
    );
    expect(result).toBe(CONTRACT_CLAWBACK_ERROR_CODES.INVALID_STATUS);
  });

  it("returns null for an unrecognised error message", () => {
    const result = parseContractClawbackErrorCode("some random contract error");
    expect(result).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseContractClawbackErrorCode("")).toBeNull();
  });
});

describe("mapClawbackErrorCode", () => {
  it("maps UNAUTHORIZED to 403 with CLAWBACK_UNAUTHORIZED error code", () => {
    const err = mapClawbackErrorCode(CONTRACT_CLAWBACK_ERROR_CODES.UNAUTHORIZED);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe(ErrorCode.CLAWBACK_UNAUTHORIZED);
    expect(err.message).toMatch(/not the authorised contract admin/i);
  });

  it("maps STREAM_NOT_FOUND to 404 with CLAWBACK_STREAM_NOT_FOUND error code", () => {
    const err = mapClawbackErrorCode(CONTRACT_CLAWBACK_ERROR_CODES.STREAM_NOT_FOUND);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe(ErrorCode.CLAWBACK_STREAM_NOT_FOUND);
    expect(err.message).toMatch(/no escrow trade record/i);
  });

  it("maps INVALID_AMOUNT to 400 with CLAWBACK_INVALID_AMOUNT error code", () => {
    const err = mapClawbackErrorCode(CONTRACT_CLAWBACK_ERROR_CODES.INVALID_AMOUNT);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe(ErrorCode.CLAWBACK_INVALID_AMOUNT);
    expect(err.message).toMatch(/greater than zero/i);
  });

  it("maps INSUFFICIENT_VESTED to 422 with CLAWBACK_INSUFFICIENT_VESTED error code", () => {
    const err = mapClawbackErrorCode(
      CONTRACT_CLAWBACK_ERROR_CODES.INSUFFICIENT_VESTED,
    );
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe(ErrorCode.CLAWBACK_INSUFFICIENT_VESTED);
    expect(err.message).toMatch(/exceeds the vested/i);
  });

  it("maps INVALID_STATUS to 409 with CLAWBACK_INVALID_STATUS error code", () => {
    const err = mapClawbackErrorCode(CONTRACT_CLAWBACK_ERROR_CODES.INVALID_STATUS);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe(ErrorCode.CLAWBACK_INVALID_STATUS);
    expect(err.message).toMatch(/not in Funded status/i);
  });

  it("attaches extra details to the error payload", () => {
    const err = mapClawbackErrorCode(CONTRACT_CLAWBACK_ERROR_CODES.UNAUTHORIZED, {
      tradeId: 42,
      adminAddress: "GADMIN",
    });
    expect(err.details).toMatchObject({
      contractErrorCode: CONTRACT_CLAWBACK_ERROR_CODES.UNAUTHORIZED,
      tradeId: 42,
      adminAddress: "GADMIN",
    });
  });
});

describe("mapContractClawbackError", () => {
  it("returns a mapped AppError when the raw error contains a known code", () => {
    const raw = new Error("Contract panicked: CLAWBACK_UNAUTHORIZED");
    const err = mapContractClawbackError(raw);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe(ErrorCode.CLAWBACK_UNAUTHORIZED);
    expect(err.statusCode).toBe(403);
  });

  it("returns a DOMAIN_ERROR for an unrecognised error", () => {
    const raw = new Error("something went wrong entirely");
    const err = mapContractClawbackError(raw);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe(ErrorCode.DOMAIN_ERROR);
    expect(err.statusCode).toBe(500);
    expect(err.details).toMatchObject({ contractErrorCode: "UNKNOWN" });
  });

  it("handles string errors gracefully", () => {
    const err = mapContractClawbackError("CLAWBACK_STREAM_NOT_FOUND");
    expect(err.code).toBe(ErrorCode.CLAWBACK_STREAM_NOT_FOUND);
    expect(err.statusCode).toBe(404);
  });

  it("handles non-Error, non-string values", () => {
    const err = mapContractClawbackError({ code: 500, description: "oops" });
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe(ErrorCode.DOMAIN_ERROR);
  });

  it("passes extra details through to the returned AppError", () => {
    const raw = new Error("CLAWBACK_INSUFFICIENT_VESTED");
    const err = mapContractClawbackError(raw, { tradeId: 99 });
    expect(err.details).toMatchObject({ tradeId: 99 });
  });
});
