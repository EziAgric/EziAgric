import { TRADE_STATUSES, toTradeStatus, type ApiTradeStatus, type TradeStatus } from "../trade";

describe("toTradeStatus", () => {
  it.each<[ApiTradeStatus, TradeStatus]>([
    ["PENDING_SIGNATURE", "PENDING"],
    ["CREATED", "PENDING"],
    ["FUNDED", "IN TRANSIT"],
    ["DELIVERED", "IN TRANSIT"],
    ["SETTLED", "SETTLED"],
    ["DISPUTED", "DISPUTED"],
    ["CANCELLED", "DRAFT"],
  ])("maps backend status %s to %s", (apiStatus, expected) => {
    expect(toTradeStatus(apiStatus)).toBe(expected);
  });

  it("passes canonical statuses through unchanged", () => {
    TRADE_STATUSES.forEach((status) => {
      expect(toTradeStatus(status)).toBe(status);
    });
  });

  it("is case- and whitespace-insensitive", () => {
    expect(toTradeStatus("funded")).toBe("IN TRANSIT");
    expect(toTradeStatus(" in transit ")).toBe("IN TRANSIT");
    expect(toTradeStatus("Disputed")).toBe("DISPUTED");
  });

  it("falls back to PENDING for unknown values", () => {
    expect(toTradeStatus("SOMETHING_NEW")).toBe("PENDING");
    expect(toTradeStatus("")).toBe("PENDING");
  });
});
