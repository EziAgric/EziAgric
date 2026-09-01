/**
 * Tests for the flake detection logic used by scripts/flake-reporter.mjs
 *
 * We test the pure candidate-extraction logic inline (mirroring the script)
 * rather than shelling out, keeping tests fast and deterministic.
 */

import { execSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "../../scripts/flake-reporter.mjs");

// ─── Mirror of extractFlakeCandidates from the script ─────────────────────

function extractFlakeCandidates(jestResult, scope) {
  if (!jestResult?.testResults) return [];
  const candidates = [];

  for (const suite of jestResult.testResults) {
    const filePath = suite.testFilePath ?? "";
    for (const test of suite.testResults ?? []) {
      const hasRetryFailure =
        test.status === "passed" &&
        Array.isArray(test.failureMessages) &&
        test.failureMessages.length > 0;

      const wasActuallyFailed = test.status === "failed";

      if (hasRetryFailure || wasActuallyFailed) {
        candidates.push({
          fullName: test.fullName,
          filePath: filePath.replace(/^\/[^/]+\//, ""),
          status: test.status,
          failureMessages: test.failureMessages ?? [],
          scope: scope ?? "other",
          isPassAfterRetry: hasRetryFailure,
        });
      }
    }
  }
  return candidates;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────

function makeSuite(filePath, tests) {
  return { testFilePath: filePath, testResults: tests };
}

function makeTest(fullName, status, failureMessages = []) {
  return { fullName, status, failureMessages, duration: 50 };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("extractFlakeCandidates", () => {
  describe("clean run — no candidates", () => {
    it("returns empty for a fully passing run", () => {
      const result = {
        testResults: [
          makeSuite("/app/src/foo.test.ts", [
            makeTest("foo passes", "passed", []),
            makeTest("bar passes", "passed", []),
          ]),
        ],
      };
      expect(extractFlakeCandidates(result, "frontend")).toHaveLength(0);
    });

    it("returns empty for pending/skipped tests", () => {
      const result = {
        testResults: [
          makeSuite("/app/src/foo.test.ts", [
            makeTest("skipped", "pending", []),
          ]),
        ],
      };
      expect(extractFlakeCandidates(result, "backend")).toHaveLength(0);
    });
  });

  describe("pass-after-retry detection", () => {
    it("flags a passed test that has failureMessages as a flake candidate", () => {
      const result = {
        testResults: [
          makeSuite("/app/src/foo.test.ts", [
            makeTest("flaky test", "passed", ["Expected true, received false"]),
          ]),
        ],
      };
      const candidates = extractFlakeCandidates(result, "frontend");
      expect(candidates).toHaveLength(1);
      expect(candidates[0].isPassAfterRetry).toBe(true);
      expect(candidates[0].fullName).toBe("flaky test");
      expect(candidates[0].scope).toBe("frontend");
    });

    it("does not flag a passed test with empty failureMessages", () => {
      const result = {
        testResults: [
          makeSuite("/app/src/foo.test.ts", [
            makeTest("clean pass", "passed", []),
          ]),
        ],
      };
      expect(extractFlakeCandidates(result, "frontend")).toHaveLength(0);
    });
  });

  describe("actual failure detection", () => {
    it("flags a failed test as a candidate (not pass-after-retry)", () => {
      const result = {
        testResults: [
          makeSuite("/app/src/bar.test.ts", [
            makeTest("always fails", "failed", ["Error: not equal"]),
          ]),
        ],
      };
      const candidates = extractFlakeCandidates(result, "backend");
      expect(candidates).toHaveLength(1);
      expect(candidates[0].isPassAfterRetry).toBe(false);
      expect(candidates[0].status).toBe("failed");
    });
  });

  describe("mixed suite", () => {
    it("only picks up flaky and failed tests, leaves clean ones alone", () => {
      const result = {
        testResults: [
          makeSuite("/app/src/mixed.test.ts", [
            makeTest("clean", "passed", []),
            makeTest("flaky", "passed", ["transient failure"]),
            makeTest("broken", "failed", ["hard fail"]),
            makeTest("skipped", "pending", []),
          ]),
        ],
      };
      const candidates = extractFlakeCandidates(result, "frontend");
      expect(candidates).toHaveLength(2);
      expect(candidates.map((c) => c.fullName)).toEqual(
        expect.arrayContaining(["flaky", "broken"]),
      );
    });
  });

  describe("multiple suites", () => {
    it("aggregates candidates across all suites", () => {
      const result = {
        testResults: [
          makeSuite("/app/src/a.test.ts", [
            makeTest("a flaky", "passed", ["flake"]),
          ]),
          makeSuite("/app/src/b.test.ts", [
            makeTest("b flaky", "passed", ["flake"]),
          ]),
          makeSuite("/app/src/c.test.ts", [
            makeTest("c clean", "passed", []),
          ]),
        ],
      };
      const candidates = extractFlakeCandidates(result, "backend");
      expect(candidates).toHaveLength(2);
    });
  });

  describe("edge cases", () => {
    it("returns empty for null/undefined input", () => {
      expect(extractFlakeCandidates(null, "frontend")).toHaveLength(0);
      expect(extractFlakeCandidates(undefined, "frontend")).toHaveLength(0);
    });

    it("returns empty for a result with no testResults array", () => {
      expect(extractFlakeCandidates({}, "frontend")).toHaveLength(0);
    });

    it("handles suite with no test results array", () => {
      const result = {
        testResults: [{ testFilePath: "/app/src/empty.test.ts" }],
      };
      expect(extractFlakeCandidates(result, "backend")).toHaveLength(0);
    });

    it("defaults scope to 'other' when not provided", () => {
      const result = {
        testResults: [
          makeSuite("/app/src/foo.test.ts", [
            makeTest("flaky", "passed", ["fail"]),
          ]),
        ],
      };
      const candidates = extractFlakeCandidates(result, undefined);
      expect(candidates[0].scope).toBe("other");
    });
  });
});

// ─── Script syntax check ──────────────────────────────────────────────────

describe("flake-reporter.mjs — script syntax", () => {
  it("passes node --check (no syntax errors)", () => {
    expect(() => {
      execSync(`node --check ${SCRIPT}`, { stdio: "pipe" });
    }).not.toThrow();
  });
});
