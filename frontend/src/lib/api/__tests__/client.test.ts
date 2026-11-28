import { createQueryString } from "../client";

describe("createQueryString", () => {
  it("returns an empty string when there are no params", () => {
    expect(createQueryString()).toBe("");
    expect(createQueryString({})).toBe("");
  });

  it("builds a leading-? query string from provided params", () => {
    expect(createQueryString({ status: "OPEN", page: 2, limit: 10 })).toBe(
      "?status=OPEN&page=2&limit=10",
    );
  });

  it("omits keys whose value is undefined or an empty string", () => {
    expect(createQueryString({ status: undefined, page: 1, limit: "" })).toBe("?page=1");
  });

  it("coerces numeric values to strings in the query", () => {
    const query = createQueryString({ page: 3 });
    expect(query).toBe("?page=3");
  });
});
