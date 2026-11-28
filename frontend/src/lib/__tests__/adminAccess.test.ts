import { getAdminAddresses, isAdminAddress } from "../adminAccess";

describe("getAdminAddresses", () => {
  it("parses a comma-separated allowlist from env", () => {
    expect(getAdminAddresses("GADMIN1, GADMIN2 ,GADMIN3")).toEqual([
      "GADMIN1",
      "GADMIN2",
      "GADMIN3",
    ]);
  });

  it("returns an empty allowlist when env is unset", () => {
    expect(getAdminAddresses(undefined)).toEqual([]);
  });

  it("filters out blank entries", () => {
    expect(getAdminAddresses("GADMIN1,,  ,GADMIN2")).toEqual(["GADMIN1", "GADMIN2"]);
  });
});

describe("isAdminAddress", () => {
  const allowlist = ["GADMIN1", "GADMIN2"];

  it("returns true for an address on the allowlist", () => {
    expect(isAdminAddress("GADMIN1", allowlist)).toBe(true);
  });

  it("returns false for an address not on the allowlist", () => {
    expect(isAdminAddress("GNOTADMIN", allowlist)).toBe(false);
  });

  it("returns false for null/undefined addresses", () => {
    expect(isAdminAddress(null, allowlist)).toBe(false);
    expect(isAdminAddress(undefined, allowlist)).toBe(false);
  });
});
