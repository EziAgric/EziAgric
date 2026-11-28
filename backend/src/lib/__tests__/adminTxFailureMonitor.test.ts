import { recordAdminSorobanTxFailure, resetAdminSorobanTxFailures } from "../adminTxFailureMonitor";
import { alertService } from "../../services/alert.service";

describe("adminTxFailureMonitor", () => {
  const endpoint = "POST /streams/:id/clawback";

  beforeEach(() => {
    resetAdminSorobanTxFailures();
    jest.spyOn(alertService, "dispatch").mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does not dispatch an alert before the threshold is reached", () => {
    recordAdminSorobanTxFailure(endpoint, new Error("boom"));
    expect(alertService.dispatch).not.toHaveBeenCalled();
  });

  it("dispatches an alert including the endpoint and error class once the threshold is exceeded", () => {
    for (let i = 0; i < 5; i++) {
      recordAdminSorobanTxFailure(endpoint, new TypeError("signing failed"));
    }

    expect(alertService.dispatch).toHaveBeenCalledTimes(1);
    expect(alertService.dispatch).toHaveBeenCalledWith(
      "admin_soroban_tx_failure",
      expect.stringContaining(endpoint),
      expect.objectContaining({ endpoint, errorClass: "TypeError" }),
    );
  });

  it("resets the counter after dispatching so it can alert again on subsequent bursts", () => {
    for (let i = 0; i < 5; i++) {
      recordAdminSorobanTxFailure(endpoint, new Error("boom"));
    }
    recordAdminSorobanTxFailure(endpoint, new Error("boom"));
    expect(alertService.dispatch).toHaveBeenCalledTimes(1);
  });
});
