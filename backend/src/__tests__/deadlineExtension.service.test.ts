/**
 * Deadline extension cap tests (#194).
 *
 * The cases that matter are the boundaries — at-cap, cap-1, cap+1 — for both
 * the count cap and the absolute lifetime cap, plus the interaction between
 * them: many small extensions must not be able to outflank a lifetime limit
 * that one large extension would hit.
 *
 * These constants mirror the contract's. If a boundary here changes without the
 * contract changing, the two layers have drifted and one of them is wrong.
 */

import {
  DEFAULT_EXTENSION_POLICY,
  DEFAULT_MAX_EXTENSIONS,
  DEFAULT_MAX_TOTAL_EXTENSION_SECS,
  EXTENSION_POLICY_CEILING_COUNT,
  EXTENSION_POLICY_CEILING_SECS,
  DeadlineExtensionService,
  TradeExtensionState,
  assertPolicyWithinCeilings,
  evaluateExtension,
  extensionBudget,
} from "../services/deadlineExtension.service";

const NOW = 1_700_000_000;
const DAY = 24 * 60 * 60;
const ORIGINAL_DEADLINE = NOW + 7 * DAY;

function stateWith(overrides: Partial<TradeExtensionState> = {}): TradeExtensionState {
  return {
    tradeId: "trade-1",
    extensionsUsed: 0,
    originalDeadline: null,
    currentDeadline: ORIGINAL_DEADLINE,
    ...overrides,
  };
}

describe("extension policy mirrors the contract", () => {
  it("uses the contract's default caps", () => {
    expect(DEFAULT_MAX_EXTENSIONS).toBe(3);
    expect(DEFAULT_MAX_TOTAL_EXTENSION_SECS).toBe(30 * DAY);
    expect(DEFAULT_EXTENSION_POLICY).toEqual({
      maxExtensions: 3,
      maxTotalExtensionSecs: 30 * DAY,
    });
  });

  it("uses the contract's policy ceilings", () => {
    expect(EXTENSION_POLICY_CEILING_COUNT).toBe(12);
    expect(EXTENSION_POLICY_CEILING_SECS).toBe(365 * DAY);
  });
});

describe("extensionBudget", () => {
  it("treats the current deadline as the original before any extension", () => {
    const budget = extensionBudget(stateWith());
    expect(budget.originalDeadline).toBe(ORIGINAL_DEADLINE);
    expect(budget.extendedBySecs).toBe(0);
    expect(budget.extensionsRemaining).toBe(3);
    expect(budget.isFinalExtension).toBe(false);
    expect(budget.isExhausted).toBe(false);
  });

  it("measures elapsed extension from the original deadline", () => {
    const budget = extensionBudget(
      stateWith({
        extensionsUsed: 2,
        originalDeadline: ORIGINAL_DEADLINE,
        currentDeadline: ORIGINAL_DEADLINE + 5 * DAY,
      }),
    );
    expect(budget.extendedBySecs).toBe(5 * DAY);
    expect(budget.extensionSecsRemaining).toBe(25 * DAY);
    expect(budget.extensionsRemaining).toBe(1);
  });

  it("flags the final extension so a client can warn", () => {
    const budget = extensionBudget(stateWith({ extensionsUsed: 2 }));
    expect(budget.extensionsRemaining).toBe(1);
    expect(budget.isFinalExtension).toBe(true);
    expect(budget.isExhausted).toBe(false);
  });

  it("flags exhaustion at the count cap", () => {
    const budget = extensionBudget(stateWith({ extensionsUsed: 3 }));
    expect(budget.extensionsRemaining).toBe(0);
    expect(budget.isFinalExtension).toBe(false);
    expect(budget.isExhausted).toBe(true);
  });

  it("flags exhaustion when the lifetime cap is spent even with count left", () => {
    const budget = extensionBudget(
      stateWith({
        extensionsUsed: 1,
        originalDeadline: ORIGINAL_DEADLINE,
        currentDeadline: ORIGINAL_DEADLINE + 30 * DAY,
      }),
    );
    expect(budget.extensionsRemaining).toBe(2);
    expect(budget.extensionSecsRemaining).toBe(0);
    expect(budget.isExhausted).toBe(true);
  });

  it("never reports a negative remainder when state exceeds the cap", () => {
    const budget = extensionBudget(
      stateWith({
        extensionsUsed: 99,
        originalDeadline: ORIGINAL_DEADLINE,
        currentDeadline: ORIGINAL_DEADLINE + 999 * DAY,
      }),
    );
    expect(budget.extensionsRemaining).toBe(0);
    expect(budget.extensionSecsRemaining).toBe(0);
  });

  it("reports no deadline as zero elapsed extension", () => {
    const budget = extensionBudget(stateWith({ currentDeadline: null }));
    expect(budget.originalDeadline).toBeNull();
    expect(budget.extendedBySecs).toBe(0);
  });
});

describe("count cap boundaries", () => {
  const newDeadline = ORIGINAL_DEADLINE + DAY;

  it("allows the extension one below the cap", () => {
    const result = evaluateExtension({
      state: stateWith({ extensionsUsed: DEFAULT_MAX_EXTENSIONS - 2 }),
      newDeadline,
      now: NOW,
    });
    expect(result.allowed).toBe(true);
  });

  it("allows the final extension, at cap-1 used", () => {
    const result = evaluateExtension({
      state: stateWith({ extensionsUsed: DEFAULT_MAX_EXTENSIONS - 1 }),
      newDeadline,
      now: NOW,
    });
    expect(result.allowed).toBe(true);
    expect(result.budget.isFinalExtension).toBe(true);
  });

  it("refuses the extension at the cap", () => {
    const result = evaluateExtension({
      state: stateWith({ extensionsUsed: DEFAULT_MAX_EXTENSIONS }),
      newDeadline,
      now: NOW,
    });
    expect(result.allowed).toBe(false);
    expect(result.rejection).toBe("COUNT_EXHAUSTED");
  });

  it("refuses the extension past the cap", () => {
    const result = evaluateExtension({
      state: stateWith({ extensionsUsed: DEFAULT_MAX_EXTENSIONS + 1 }),
      newDeadline,
      now: NOW,
    });
    expect(result.allowed).toBe(false);
    expect(result.rejection).toBe("COUNT_EXHAUSTED");
  });

  it("disables extensions entirely under a zero-count policy", () => {
    const result = evaluateExtension({
      state: stateWith(),
      newDeadline,
      now: NOW,
      policy: { maxExtensions: 0, maxTotalExtensionSecs: 30 * DAY },
    });
    expect(result.allowed).toBe(false);
    expect(result.rejection).toBe("COUNT_EXHAUSTED");
  });
});

describe("lifetime cap boundaries", () => {
  const state = stateWith({
    extensionsUsed: 1,
    originalDeadline: ORIGINAL_DEADLINE,
    currentDeadline: ORIGINAL_DEADLINE + DAY,
  });

  it("allows a new deadline one second inside the cap", () => {
    const result = evaluateExtension({
      state,
      newDeadline: ORIGINAL_DEADLINE + DEFAULT_MAX_TOTAL_EXTENSION_SECS - 1,
      now: NOW,
    });
    expect(result.allowed).toBe(true);
  });

  it("allows a new deadline exactly at the cap", () => {
    const result = evaluateExtension({
      state,
      newDeadline: ORIGINAL_DEADLINE + DEFAULT_MAX_TOTAL_EXTENSION_SECS,
      now: NOW,
    });
    expect(result.allowed).toBe(true);
  });

  it("refuses a new deadline one second past the cap", () => {
    const result = evaluateExtension({
      state,
      newDeadline: ORIGINAL_DEADLINE + DEFAULT_MAX_TOTAL_EXTENSION_SECS + 1,
      now: NOW,
    });
    expect(result.allowed).toBe(false);
    expect(result.rejection).toBe("LIFETIME_CAP_EXCEEDED");
  });

  it("measures from the original deadline, so small extensions cannot outflank the cap", () => {
    // Three extensions of 20 days each: the third is well inside the *current*
    // deadline plus 20 days, but far past the original plus 30.
    const afterTwo = stateWith({
      extensionsUsed: 2,
      originalDeadline: ORIGINAL_DEADLINE,
      currentDeadline: ORIGINAL_DEADLINE + 20 * DAY,
    });
    const result = evaluateExtension({
      state: afterTwo,
      newDeadline: ORIGINAL_DEADLINE + 40 * DAY,
      now: NOW,
    });
    expect(result.allowed).toBe(false);
    expect(result.rejection).toBe("LIFETIME_CAP_EXCEEDED");
  });
});

describe("ordering and basic validity", () => {
  it("refuses when the trade has no deadline", () => {
    const result = evaluateExtension({
      state: stateWith({ currentDeadline: null }),
      newDeadline: NOW + DAY,
      now: NOW,
    });
    expect(result.rejection).toBe("NO_DEADLINE");
  });

  it("refuses once the current deadline has passed", () => {
    const result = evaluateExtension({
      state: stateWith({ currentDeadline: NOW - 1 }),
      newDeadline: NOW + DAY,
      now: NOW,
    });
    expect(result.rejection).toBe("ALREADY_EXPIRED");
  });

  it("refuses a new deadline in the past", () => {
    const result = evaluateExtension({
      state: stateWith(),
      newDeadline: NOW - 1,
      now: NOW,
    });
    expect(result.rejection).toBe("NOT_IN_FUTURE");
  });

  it("refuses an extension that does not move the deadline forward", () => {
    const result = evaluateExtension({
      state: stateWith(),
      newDeadline: ORIGINAL_DEADLINE,
      now: NOW,
    });
    expect(result.rejection).toBe("NOT_LATER_THAN_CURRENT");
  });

  it("reports expiry before cap exhaustion when both apply", () => {
    // The contract checks expiry first; the mirror must report the same cause.
    const result = evaluateExtension({
      state: stateWith({ extensionsUsed: 99, currentDeadline: NOW - 1 }),
      newDeadline: NOW + DAY,
      now: NOW,
    });
    expect(result.rejection).toBe("ALREADY_EXPIRED");
  });
});

describe("assertPolicyWithinCeilings", () => {
  it("accepts a policy at the ceilings", () => {
    expect(() =>
      assertPolicyWithinCeilings({
        maxExtensions: EXTENSION_POLICY_CEILING_COUNT,
        maxTotalExtensionSecs: EXTENSION_POLICY_CEILING_SECS,
      }),
    ).not.toThrow();
  });

  it("rejects a count above the ceiling", () => {
    expect(() =>
      assertPolicyWithinCeilings({
        maxExtensions: EXTENSION_POLICY_CEILING_COUNT + 1,
        maxTotalExtensionSecs: 30 * DAY,
      }),
    ).toThrow(/exceeds the policy ceiling/);
  });

  it("rejects a lifetime above the ceiling", () => {
    expect(() =>
      assertPolicyWithinCeilings({
        maxExtensions: 3,
        maxTotalExtensionSecs: EXTENSION_POLICY_CEILING_SECS + 1,
      }),
    ).toThrow(/exceeds the policy ceiling/);
  });

  it("rejects negative and non-integer values", () => {
    expect(() =>
      assertPolicyWithinCeilings({ maxExtensions: -1, maxTotalExtensionSecs: 0 }),
    ).toThrow(/non-negative integer/);
    expect(() =>
      assertPolicyWithinCeilings({ maxExtensions: 1.5, maxTotalExtensionSecs: 0 }),
    ).toThrow(/non-negative integer/);
    expect(() =>
      assertPolicyWithinCeilings({ maxExtensions: 1, maxTotalExtensionSecs: -1 }),
    ).toThrow(/non-negative integer/);
  });
});

describe("DeadlineExtensionService", () => {
  const service = new DeadlineExtensionService();

  it("returns the budget for a permitted extension", () => {
    const budget = service.assertExtensionAllowed(
      stateWith({ extensionsUsed: 1 }),
      ORIGINAL_DEADLINE + DAY,
      NOW,
    );
    expect(budget.extensionsRemaining).toBe(2);
  });

  it("throws a 409 carrying the rejection and budget", () => {
    expect.assertions(3);
    try {
      service.assertExtensionAllowed(
        stateWith({ extensionsUsed: DEFAULT_MAX_EXTENSIONS }),
        ORIGINAL_DEADLINE + DAY,
        NOW,
      );
    } catch (err) {
      const error = err as { statusCode?: number; details?: Record<string, unknown> };
      expect(error.statusCode).toBe(409);
      expect(error.details?.rejection).toBe("COUNT_EXHAUSTED");
      expect(error.details?.budget).toMatchObject({ isExhausted: true });
    }
  });

  it("exposes a copy of its policy, not the instance", () => {
    const policy = service.getPolicy();
    policy.maxExtensions = 99;
    expect(service.getPolicy().maxExtensions).toBe(DEFAULT_MAX_EXTENSIONS);
  });
});
