import {
  encodeCursor,
  decodeCursor,
  paginateWithCursor,
  normalizeCursorLimit,
  InvalidCursorError,
  DEFAULT_CURSOR_LIMIT,
  MAX_CURSOR_LIMIT,
} from "../lib/cursorPagination";

describe("cursorPagination", () => {
  describe("encode/decode round trip", () => {
    it("round-trips a cursor key", () => {
      const token = encodeCursor({ id: 42, sortValue: "2026-01-01T00:00:00.000Z" });
      expect(decodeCursor(token)).toEqual({ id: 42, sortValue: "2026-01-01T00:00:00.000Z" });
    });

    it("returns null for empty/undefined cursor", () => {
      expect(decodeCursor(undefined)).toBeNull();
      expect(decodeCursor(null)).toBeNull();
      expect(decodeCursor("")).toBeNull();
    });

    it("throws InvalidCursorError on tampered/malformed input", () => {
      expect(() => decodeCursor("not-base64url-json!!!")).toThrow(InvalidCursorError);
      expect(() => decodeCursor(Buffer.from(JSON.stringify({ foo: "bar" })).toString("base64url"))).toThrow(
        InvalidCursorError,
      );
      expect(() => decodeCursor(Buffer.from("null").toString("base64url"))).toThrow(InvalidCursorError);
    });

    it("is opaque (not human-readable)", () => {
      const token = encodeCursor({ id: 1 });
      expect(token).not.toContain("1");
      expect(token).not.toMatch(/[{}":]/);
    });
  });

  describe("normalizeCursorLimit", () => {
    it("defaults when missing/invalid", () => {
      expect(normalizeCursorLimit(undefined)).toBe(DEFAULT_CURSOR_LIMIT);
      expect(normalizeCursorLimit(-5)).toBe(DEFAULT_CURSOR_LIMIT);
      expect(normalizeCursorLimit("abc")).toBe(DEFAULT_CURSOR_LIMIT);
    });

    it("caps at MAX_CURSOR_LIMIT", () => {
      expect(normalizeCursorLimit(10000)).toBe(MAX_CURSOR_LIMIT);
    });

    it("floors fractional values", () => {
      expect(normalizeCursorLimit(5.9)).toBe(5);
    });
  });

  describe("paginateWithCursor", () => {
    interface Row {
      id: number;
      createdAt: Date;
    }

    function makeRows(n: number): Row[] {
      return Array.from({ length: n }, (_, i) => ({ id: i + 1, createdAt: new Date(2026, 0, i + 1) }));
    }

    /** In-memory stand-in for a Prisma findMany, honoring cursor+skip like Prisma does. */
    function fakeFindMany(rows: Row[]) {
      return async (args: { take: number; skip?: number; cursor?: { id: number } }) => {
        let start = 0;
        if (args.cursor) {
          const idx = rows.findIndex((r) => r.id === args.cursor!.id);
          start = idx === -1 ? rows.length : idx + (args.skip ?? 0);
        }
        return rows.slice(start, start + args.take);
      };
    }

    it("returns the first page with hasNextPage=true when more rows exist", async () => {
      const rows = makeRows(25);
      const result = await paginateWithCursor({
        findMany: fakeFindMany(rows),
        orderBy: { id: "asc" },
        limit: 20,
      });

      expect(result.items).toHaveLength(20);
      expect(result.items[0]!.id).toBe(1);
      expect(result.pageInfo.hasNextPage).toBe(true);
      expect(result.pageInfo.nextCursor).not.toBeNull();
    });

    it("walks all pages without loss or duplication", async () => {
      const rows = makeRows(47);
      const seen: number[] = [];
      let cursor: string | undefined;

      for (let i = 0; i < 10; i++) {
        const result = await paginateWithCursor({
          findMany: fakeFindMany(rows),
          orderBy: { id: "asc" },
          limit: 10,
          cursor,
        });
        seen.push(...result.items.map((r) => r.id));
        if (!result.pageInfo.hasNextPage) break;
        cursor = result.pageInfo.nextCursor!;
      }

      expect(seen).toEqual(rows.map((r) => r.id));
      expect(new Set(seen).size).toBe(rows.length);
    });

    it("is stable when rows are inserted ahead of the cursor between pages", async () => {
      const rows = makeRows(15);
      const page1 = await paginateWithCursor({
        findMany: fakeFindMany(rows),
        orderBy: { id: "asc" },
        limit: 5,
      });
      expect(page1.items.map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);

      // Simulate concurrent inserts *before* the current position — offset
      // pagination would re-show/skip rows here; cursor pagination won't,
      // because it's anchored to id=5, not to a numeric skip.
      rows.unshift({ id: -1, createdAt: new Date(2025, 11, 31) }, { id: -2, createdAt: new Date(2025, 11, 30) });

      const page2 = await paginateWithCursor({
        findMany: fakeFindMany(rows),
        orderBy: { id: "asc" },
        limit: 5,
        cursor: page1.pageInfo.nextCursor,
      });

      expect(page2.items.map((r) => r.id)).toEqual([6, 7, 8, 9, 10]);
    });

    it("returns an empty items array and hasNextPage=false past the end", async () => {
      const rows = makeRows(3);
      const result = await paginateWithCursor({
        findMany: fakeFindMany(rows),
        orderBy: { id: "asc" },
        cursor: encodeCursor({ id: 3 }),
        limit: 10,
      });

      expect(result.items).toHaveLength(0);
      expect(result.pageInfo.hasNextPage).toBe(false);
      expect(result.pageInfo.nextCursor).toBeNull();
    });

    it("rejects a tampered cursor before touching the database", async () => {
      const rows = makeRows(3);
      await expect(
        paginateWithCursor({
          findMany: fakeFindMany(rows),
          orderBy: { id: "asc" },
          cursor: "garbage-cursor",
        }),
      ).rejects.toThrow(InvalidCursorError);
    });
  });
});
