import {
  getMediatorAddresses,
  isMediatorAddress,
  formatDate,
  formatAddress,
} from "../helpers";

describe("getMediatorAddresses", () => {
  it("falls back to the dev default when no env value is set", () => {
    expect(getMediatorAddresses(undefined)).toEqual(["GEXAMPLEMEDIATORPUBLICKEY1"]);
  });

  it("falls back to the dev default when the env value is empty", () => {
    expect(getMediatorAddresses("")).toEqual(["GEXAMPLEMEDIATORPUBLICKEY1"]);
  });

  it("parses a comma-separated allowlist and trims whitespace", () => {
    expect(getMediatorAddresses("GABC123, GDEF456 ,GHI789")).toEqual([
      "GABC123",
      "GDEF456",
      "GHI789",
    ]);
  });

  it("drops empty entries produced by trailing commas", () => {
    expect(getMediatorAddresses("GABC123,,")).toEqual(["GABC123"]);
  });
});

describe("isMediatorAddress", () => {
  const allowlist = ["GABC123", "GDEF456"];

  it("returns true when the address is on the allowlist", () => {
    expect(isMediatorAddress("GABC123", allowlist)).toBe(true);
  });

  it("returns false when the address is not on the allowlist", () => {
    expect(isMediatorAddress("GNOTALLOWED", allowlist)).toBe(false);
  });

  it("returns false for null or undefined addresses", () => {
    expect(isMediatorAddress(null, allowlist)).toBe(false);
    expect(isMediatorAddress(undefined, allowlist)).toBe(false);
  });
});

describe("formatDate", () => {
  it("formats an ISO string as 'Mon D, YYYY'", () => {
    expect(formatDate("2026-01-05T00:00:00Z")).toBe("Jan 5, 2026");
  });
});

describe("formatAddress", () => {
  it("truncates long addresses to the first 6 and last 4 characters", () => {
    expect(formatAddress("GABCDEFGHIJKLMNOPQRSTUVWXYZ")).toBe("GABCDE...WXYZ");
  });

  it("passes short addresses through untouched", () => {
    expect(formatAddress("GSHORT")).toBe("GSHORT");
  });

  it("passes addresses exactly at the 12-character boundary through untouched", () => {
    expect(formatAddress("123456789012")).toBe("123456789012");
  });
});
