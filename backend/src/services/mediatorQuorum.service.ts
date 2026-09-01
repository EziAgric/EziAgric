import { AppError, ErrorCode } from "../errors/errorCodes";

/**
 * Backend mirror of the on-chain mediator quorum for high-value disputes (#195).
 *
 * Resolving a large escrow on one mediator's signature concentrates both trust
 * and bribery risk on exactly the trades where the stakes are highest. Above a
 * configured value threshold the contract collects weighted votes instead and
 * settles only once enough weight backs a single outcome.
 *
 * **The contract is authoritative.** This module exists so the mediator
 * dashboard can show a live tally, decide which controls to render, and reject
 * an impossible vote before a mediator signs a transaction the chain would only
 * revert. Every rule here is duplicated in `lib.rs`, and
 * `mediatorQuorum.service.test.ts` pins the branches — quorum, tie, timeout —
 * that would otherwise drift apart silently.
 *
 * All timestamps are Unix seconds, matching `env.ledger().timestamp()`.
 */

/** Mirrors `DEFAULT_QUORUM_VALUE_THRESHOLD`. */
export const DEFAULT_QUORUM_VALUE_THRESHOLD = 10_000_000_000n;

/** Mirrors `DEFAULT_QUORUM_REQUIRED_WEIGHT`. */
export const DEFAULT_QUORUM_REQUIRED_WEIGHT = 3;

/** Mirrors `DEFAULT_QUORUM_VOTE_WINDOW_SECS` — 7 days. */
export const DEFAULT_QUORUM_VOTE_WINDOW_SECS = 7 * 24 * 60 * 60;

/** Mirrors `DEFAULT_QUORUM_FALLBACK_MIN_WEIGHT`. */
export const DEFAULT_QUORUM_FALLBACK_MIN_WEIGHT = 2;

/** Mirrors `DEFAULT_MEDIATOR_WEIGHT`. */
export const DEFAULT_MEDIATOR_WEIGHT = 1;

/** Mirrors `MAX_MEDIATOR_WEIGHT`. */
export const MAX_MEDIATOR_WEIGHT = 10;

/** Mirrors `BPS_DIVISOR`. */
export const BPS_DIVISOR = 10_000;

export interface QuorumConfig {
  enabled: boolean;
  valueThreshold: bigint;
  requiredWeight: number;
  voteWindowSecs: number;
  fallbackMinWeight: number;
}

/** Quorum is off until an admin turns it on, matching the contract default. */
export const DEFAULT_QUORUM_CONFIG: QuorumConfig = {
  enabled: false,
  valueThreshold: DEFAULT_QUORUM_VALUE_THRESHOLD,
  requiredWeight: DEFAULT_QUORUM_REQUIRED_WEIGHT,
  voteWindowSecs: DEFAULT_QUORUM_VOTE_WINDOW_SECS,
  fallbackMinWeight: DEFAULT_QUORUM_FALLBACK_MIN_WEIGHT,
};

export interface MediatorVote {
  mediator: string;
  sellerGetsBps: number;
  weight: number;
  rationaleHash: string;
  votedAt: number;
}

export interface DisputeVoteState {
  tradeId: string;
  amount: bigint;
  votes: MediatorVote[];
  /** Timestamp of the first vote; null when no vote has been cast. */
  openedAt: number | null;
}

/** Weight accumulated behind one candidate outcome. */
export interface OutcomeTally {
  sellerGetsBps: number;
  weight: number;
  voteCount: number;
}

export type QuorumResolution = "quorum" | "fallback";

export interface QuorumStatus {
  tradeId: string;
  requiresQuorum: boolean;
  /** Weight behind each distinct outcome, heaviest first. */
  tallies: OutcomeTally[];
  totalWeight: number;
  voteCount: number;
  /** The outcome that would win right now, or null with no votes. */
  leadingBps: number | null;
  /** Weight the leader still needs to reach quorum. */
  weightToQuorum: number;
  /** True when an outcome already has the weight to settle. */
  quorumReached: boolean;
  /** Unix seconds at which fallback resolution unlocks, or null. */
  fallbackAvailableAt: number | null;
  /** True when the window has closed and enough weight has voted. */
  fallbackAvailable: boolean;
}

export type VoteRejection =
  | "QUORUM_NOT_REQUIRED"
  | "ALREADY_VOTED"
  | "INVALID_BPS"
  | "MISSING_RATIONALE"
  | "ALREADY_RESOLVED";

export interface VoteEvaluation {
  allowed: boolean;
  rejection?: VoteRejection;
  reason?: string;
}

/** Whether a trade's value puts it on the quorum path. */
export function requiresQuorum(
  amount: bigint,
  config: QuorumConfig = DEFAULT_QUORUM_CONFIG,
): boolean {
  return config.enabled && amount >= config.valueThreshold;
}

/**
 * Weight behind each distinct outcome, heaviest first.
 *
 * Ties are ordered by ascending `sellerGetsBps`, so the first entry is always
 * the outcome the contract would pick — the buyer-protective reading, since the
 * buyer is the party whose funds are held.
 */
export function tallyVotes(votes: MediatorVote[]): OutcomeTally[] {
  const byOutcome = new Map<number, OutcomeTally>();

  for (const vote of votes) {
    const existing = byOutcome.get(vote.sellerGetsBps);
    if (existing) {
      existing.weight += vote.weight;
      existing.voteCount += 1;
    } else {
      byOutcome.set(vote.sellerGetsBps, {
        sellerGetsBps: vote.sellerGetsBps,
        weight: vote.weight,
        voteCount: 1,
      });
    }
  }

  return [...byOutcome.values()].sort(
    (a, b) => b.weight - a.weight || a.sellerGetsBps - b.sellerGetsBps,
  );
}

/**
 * Summarise where a dispute stands: the tally, the distance to quorum, and
 * whether the fallback has unlocked.
 *
 * Pure — the dashboard, the notification job, and the tests all read the same
 * function rather than each deriving the state again.
 */
export function quorumStatus(
  state: DisputeVoteState,
  now: number,
  config: QuorumConfig = DEFAULT_QUORUM_CONFIG,
): QuorumStatus {
  const tallies = tallyVotes(state.votes);
  const totalWeight = state.votes.reduce((sum, vote) => sum + vote.weight, 0);
  const leader = tallies[0] ?? null;

  const fallbackAvailableAt =
    state.openedAt === null ? null : state.openedAt + config.voteWindowSecs;

  const quorumReached = leader !== null && leader.weight >= config.requiredWeight;

  return {
    tradeId: state.tradeId,
    requiresQuorum: requiresQuorum(state.amount, config),
    tallies,
    totalWeight,
    voteCount: state.votes.length,
    leadingBps: leader?.sellerGetsBps ?? null,
    weightToQuorum: leader
      ? Math.max(0, config.requiredWeight - leader.weight)
      : config.requiredWeight,
    quorumReached,
    fallbackAvailableAt,
    fallbackAvailable:
      !quorumReached &&
      fallbackAvailableAt !== null &&
      now >= fallbackAvailableAt &&
      totalWeight >= config.fallbackMinWeight,
  };
}

/**
 * The outcome that would be applied right now, and how.
 *
 * Returns null when neither quorum nor fallback conditions are met — the
 * dispute is still open.
 */
export function pendingResolution(
  state: DisputeVoteState,
  now: number,
  config: QuorumConfig = DEFAULT_QUORUM_CONFIG,
): { sellerGetsBps: number; weight: number; via: QuorumResolution } | null {
  const status = quorumStatus(state, now, config);
  const leader = status.tallies[0];
  if (!leader) return null;

  if (status.quorumReached) {
    return { sellerGetsBps: leader.sellerGetsBps, weight: leader.weight, via: "quorum" };
  }

  if (status.fallbackAvailable) {
    return { sellerGetsBps: leader.sellerGetsBps, weight: leader.weight, via: "fallback" };
  }

  return null;
}

/**
 * Whether `mediator` may cast this vote, checked in the contract's own order so
 * the first failure reported is the same on both sides.
 */
export function evaluateVote(params: {
  state: DisputeVoteState;
  mediator: string;
  sellerGetsBps: number;
  rationaleHash: string;
  config?: QuorumConfig;
}): VoteEvaluation {
  const { state, mediator, sellerGetsBps, rationaleHash } = params;
  const config = params.config ?? DEFAULT_QUORUM_CONFIG;

  if (!Number.isInteger(sellerGetsBps) || sellerGetsBps < 0 || sellerGetsBps > BPS_DIVISOR) {
    return {
      allowed: false,
      rejection: "INVALID_BPS",
      reason: `sellerGetsBps must be an integer in 0..${BPS_DIVISOR}`,
    };
  }

  if (rationaleHash.trim().length === 0) {
    return {
      allowed: false,
      rejection: "MISSING_RATIONALE",
      reason: "rationaleHash must not be empty",
    };
  }

  if (!requiresQuorum(state.amount, config)) {
    return {
      allowed: false,
      rejection: "QUORUM_NOT_REQUIRED",
      reason: "Trade does not require a mediator quorum; use resolve_dispute",
    };
  }

  if (state.votes.some((vote) => vote.mediator === mediator)) {
    return {
      allowed: false,
      rejection: "ALREADY_VOTED",
      reason: "Mediator has already voted on this dispute",
    };
  }

  return { allowed: true };
}

/**
 * Validate an admin-supplied quorum policy against the contract's constraints,
 * so a config the chain would reject never reaches it.
 *
 * @throws AppError(VALIDATION_ERROR, 400)
 */
export function assertQuorumConfigValid(config: QuorumConfig): void {
  const reject = (message: string, details: Record<string, unknown>): never => {
    throw new AppError(ErrorCode.VALIDATION_ERROR, message, 400, details);
  };

  if (config.valueThreshold < 0n) {
    reject("valueThreshold must be non-negative", {
      valueThreshold: config.valueThreshold.toString(),
    });
  }

  if (!Number.isInteger(config.requiredWeight) || config.requiredWeight <= 0) {
    reject("requiredWeight must be a positive integer", {
      requiredWeight: config.requiredWeight,
    });
  }

  if (!Number.isInteger(config.voteWindowSecs) || config.voteWindowSecs <= 0) {
    reject("voteWindowSecs must be a positive integer", {
      voteWindowSecs: config.voteWindowSecs,
    });
  }

  if (!Number.isInteger(config.fallbackMinWeight) || config.fallbackMinWeight <= 0) {
    reject("fallbackMinWeight must be a positive integer", {
      fallbackMinWeight: config.fallbackMinWeight,
    });
  }

  // A fallback threshold above the quorum threshold could never be met by a
  // vote set that failed quorum, which would strand the escrow.
  if (config.fallbackMinWeight > config.requiredWeight) {
    reject("fallbackMinWeight must not exceed requiredWeight", {
      fallbackMinWeight: config.fallbackMinWeight,
      requiredWeight: config.requiredWeight,
    });
  }
}

/** Validate a mediator weight against the contract's bounds. */
export function assertMediatorWeightValid(weight: number): void {
  if (!Number.isInteger(weight) || weight <= 0) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      "mediator weight must be a positive integer",
      400,
      { weight },
    );
  }
  if (weight > MAX_MEDIATOR_WEIGHT) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `mediator weight exceeds the maximum of ${MAX_MEDIATOR_WEIGHT}`,
      400,
      { weight, max: MAX_MEDIATOR_WEIGHT },
    );
  }
}

export class MediatorQuorumService {
  constructor(private readonly config: QuorumConfig = DEFAULT_QUORUM_CONFIG) {}

  getConfig(): QuorumConfig {
    return { ...this.config };
  }

  requiresQuorum(amount: bigint): boolean {
    return requiresQuorum(amount, this.config);
  }

  getStatus(state: DisputeVoteState, now: number = nowSeconds()): QuorumStatus {
    return quorumStatus(state, now, this.config);
  }

  getPendingResolution(state: DisputeVoteState, now: number = nowSeconds()) {
    return pendingResolution(state, now, this.config);
  }

  /**
   * Throwing form of {@link evaluateVote}, for request handlers.
   *
   * @throws AppError(DOMAIN_ERROR, 409) when the vote is not permitted.
   */
  assertVoteAllowed(
    state: DisputeVoteState,
    mediator: string,
    sellerGetsBps: number,
    rationaleHash: string,
  ): void {
    const evaluation = evaluateVote({
      state,
      mediator,
      sellerGetsBps,
      rationaleHash,
      config: this.config,
    });

    if (!evaluation.allowed) {
      throw new AppError(
        ErrorCode.DOMAIN_ERROR,
        evaluation.reason ?? "Vote not permitted",
        409,
        { tradeId: state.tradeId, mediator, rejection: evaluation.rejection },
      );
    }
  }
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export const mediatorQuorumService = new MediatorQuorumService();
