import { AppError, ErrorCode } from "../errors/errorCodes";

/**
 * Backend mirror of the on-chain deadline-extension caps (#194).
 *
 * The contract is authoritative — `extend_deadline()` enforces both caps and a
 * caller can always reach it directly, bypassing this code. This module exists
 * so the API can reject an over-cap extension *before* the parties assemble and
 * sign a transaction that the chain would only revert, and so clients can show
 * the remaining budget without a contract round-trip on every render.
 *
 * The two layers must agree. When the contract's caps or ceilings change, the
 * constants here change with them; `deadlineExtension.service.test.ts` pins the
 * boundary cases that would otherwise drift apart silently.
 *
 * All timestamps are Unix seconds, matching `env.ledger().timestamp()` and the
 * contract's `expires_at`.
 */

/** Mirrors `DEFAULT_MAX_DEADLINE_EXTENSIONS` in the contract. */
export const DEFAULT_MAX_EXTENSIONS = 3;

/** Mirrors `DEFAULT_MAX_TOTAL_EXTENSION_SECS` — 30 days. */
export const DEFAULT_MAX_TOTAL_EXTENSION_SECS = 30 * 24 * 60 * 60;

/** Mirrors `EXTENSION_POLICY_CEILING_COUNT`. */
export const EXTENSION_POLICY_CEILING_COUNT = 12;

/** Mirrors `EXTENSION_POLICY_CEILING_SECS` — 365 days. */
export const EXTENSION_POLICY_CEILING_SECS = 365 * 24 * 60 * 60;

export interface ExtensionPolicy {
  maxExtensions: number;
  maxTotalExtensionSecs: number;
}

export const DEFAULT_EXTENSION_POLICY: ExtensionPolicy = {
  maxExtensions: DEFAULT_MAX_EXTENSIONS,
  maxTotalExtensionSecs: DEFAULT_MAX_TOTAL_EXTENSION_SECS,
};

/** The extension-relevant state of one trade, as read from the chain or DB. */
export interface TradeExtensionState {
  tradeId: string;
  /** Extensions already applied. */
  extensionsUsed: number;
  /**
   * The trade's first deadline. Null before any extension, in which case
   * `currentDeadline` is the original.
   */
  originalDeadline: number | null;
  /** The deadline in force now. Null when the trade has no deadline. */
  currentDeadline: number | null;
}

export interface ExtensionBudget {
  tradeId: string;
  extensionsUsed: number;
  extensionsRemaining: number;
  originalDeadline: number | null;
  extendedBySecs: number;
  extensionSecsRemaining: number;
  /** One extension left — clients should warn before the parties sign. */
  isFinalExtension: boolean;
  /** No further extension is possible under either cap. */
  isExhausted: boolean;
}

/** Why an extension was refused. Mirrors the contract's assertion messages. */
export type ExtensionRejection =
  | "NO_DEADLINE"
  | "COUNT_EXHAUSTED"
  | "LIFETIME_CAP_EXCEEDED"
  | "NOT_IN_FUTURE"
  | "NOT_LATER_THAN_CURRENT"
  | "ALREADY_EXPIRED";

export interface ExtensionEvaluation {
  allowed: boolean;
  rejection?: ExtensionRejection;
  reason?: string;
  budget: ExtensionBudget;
}

/**
 * Compute the remaining extension budget for a trade.
 *
 * Pure — takes state rather than reading it, so the same function serves the
 * API, the notification job, and the tests without a database.
 */
export function extensionBudget(
  state: TradeExtensionState,
  policy: ExtensionPolicy = DEFAULT_EXTENSION_POLICY,
): ExtensionBudget {
  // Before the first extension the current deadline is the original one.
  const originalDeadline = state.originalDeadline ?? state.currentDeadline;

  const extendedBySecs =
    originalDeadline !== null && state.currentDeadline !== null
      ? Math.max(0, state.currentDeadline - originalDeadline)
      : 0;

  const extensionsRemaining = Math.max(
    0,
    policy.maxExtensions - state.extensionsUsed,
  );
  const extensionSecsRemaining = Math.max(
    0,
    policy.maxTotalExtensionSecs - extendedBySecs,
  );

  return {
    tradeId: state.tradeId,
    extensionsUsed: state.extensionsUsed,
    extensionsRemaining,
    originalDeadline,
    extendedBySecs,
    extensionSecsRemaining,
    isFinalExtension: extensionsRemaining === 1,
    isExhausted: extensionsRemaining === 0 || extensionSecsRemaining === 0,
  };
}

/**
 * Decide whether `newDeadline` is a permissible extension, in the same order
 * the contract checks so the first failure reported matches on both sides.
 *
 * Returns a verdict rather than throwing: callers rendering a form want the
 * budget and the reason, not an exception.
 */
export function evaluateExtension(params: {
  state: TradeExtensionState;
  newDeadline: number;
  now: number;
  policy?: ExtensionPolicy;
}): ExtensionEvaluation {
  const { state, newDeadline, now } = params;
  const policy = params.policy ?? DEFAULT_EXTENSION_POLICY;
  const budget = extensionBudget(state, policy);

  if (state.currentDeadline === null) {
    return {
      allowed: false,
      rejection: "NO_DEADLINE",
      reason: "Trade has no deadline to extend",
      budget,
    };
  }

  if (now >= state.currentDeadline) {
    return {
      allowed: false,
      rejection: "ALREADY_EXPIRED",
      reason: "Cannot extend a deadline that has already passed",
      budget,
    };
  }

  if (newDeadline <= now) {
    return {
      allowed: false,
      rejection: "NOT_IN_FUTURE",
      reason: "New deadline must be in the future",
      budget,
    };
  }

  if (newDeadline <= state.currentDeadline) {
    return {
      allowed: false,
      rejection: "NOT_LATER_THAN_CURRENT",
      reason: "New deadline must be later than the current deadline",
      budget,
    };
  }

  if (state.extensionsUsed >= policy.maxExtensions) {
    return {
      allowed: false,
      rejection: "COUNT_EXHAUSTED",
      reason: `Trade has used all ${policy.maxExtensions} permitted deadline extensions`,
      budget,
    };
  }

  const originalDeadline = state.originalDeadline ?? state.currentDeadline;
  const extendedBy = newDeadline - originalDeadline;
  if (extendedBy > policy.maxTotalExtensionSecs) {
    return {
      allowed: false,
      rejection: "LIFETIME_CAP_EXCEEDED",
      reason:
        `New deadline extends the trade ${extendedBy}s past its original deadline, ` +
        `exceeding the ${policy.maxTotalExtensionSecs}s lifetime cap`,
      budget,
    };
  }

  return { allowed: true, budget };
}

/**
 * Validate an admin-supplied policy against the ceilings the contract enforces,
 * so a policy that the chain would reject never reaches it.
 *
 * @throws AppError(VALIDATION_ERROR, 400)
 */
export function assertPolicyWithinCeilings(policy: ExtensionPolicy): void {
  if (!Number.isInteger(policy.maxExtensions) || policy.maxExtensions < 0) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      "maxExtensions must be a non-negative integer",
      400,
      { maxExtensions: policy.maxExtensions },
    );
  }

  if (
    !Number.isInteger(policy.maxTotalExtensionSecs) ||
    policy.maxTotalExtensionSecs < 0
  ) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      "maxTotalExtensionSecs must be a non-negative integer",
      400,
      { maxTotalExtensionSecs: policy.maxTotalExtensionSecs },
    );
  }

  if (policy.maxExtensions > EXTENSION_POLICY_CEILING_COUNT) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `maxExtensions exceeds the policy ceiling of ${EXTENSION_POLICY_CEILING_COUNT}`,
      400,
      { maxExtensions: policy.maxExtensions, ceiling: EXTENSION_POLICY_CEILING_COUNT },
    );
  }

  if (policy.maxTotalExtensionSecs > EXTENSION_POLICY_CEILING_SECS) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `maxTotalExtensionSecs exceeds the policy ceiling of ${EXTENSION_POLICY_CEILING_SECS}`,
      400,
      {
        maxTotalExtensionSecs: policy.maxTotalExtensionSecs,
        ceiling: EXTENSION_POLICY_CEILING_SECS,
      },
    );
  }
}

export class DeadlineExtensionService {
  constructor(private readonly policy: ExtensionPolicy = DEFAULT_EXTENSION_POLICY) {}

  /** The current policy, for admin read endpoints. */
  getPolicy(): ExtensionPolicy {
    return { ...this.policy };
  }

  /** Remaining budget for a trade. */
  getBudget(state: TradeExtensionState): ExtensionBudget {
    return extensionBudget(state, this.policy);
  }

  /**
   * Throwing form of {@link evaluateExtension}, for request handlers.
   *
   * @throws AppError(DOMAIN_ERROR, 409) when the extension is not permitted.
   */
  assertExtensionAllowed(
    state: TradeExtensionState,
    newDeadline: number,
    now: number = Math.floor(Date.now() / 1000),
  ): ExtensionBudget {
    const evaluation = evaluateExtension({
      state,
      newDeadline,
      now,
      policy: this.policy,
    });

    if (!evaluation.allowed) {
      throw new AppError(
        ErrorCode.DOMAIN_ERROR,
        evaluation.reason ?? "Deadline extension not permitted",
        409,
        {
          tradeId: state.tradeId,
          rejection: evaluation.rejection,
          budget: evaluation.budget,
        },
      );
    }

    return evaluation.budget;
  }
}

export const deadlineExtensionService = new DeadlineExtensionService();
