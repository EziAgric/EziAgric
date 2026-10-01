import { PrismaClient, DisputeStatus } from "@prisma/client";
import { AppError, ErrorCode } from "../errors/errorCodes";
import { getMediatorAllowlist } from "../lib/accessControl";
import {
  COMPLETED_DISPUTE_STATUSES,
  applyDisputeStatusTransition,
  assertTransitionApplied,
  assertValidTransition,
} from "./disputeTransitions";

export { COMPLETED_DISPUTE_STATUSES, DisputeStatus };

export interface DisputeCleanupResult {
  purgedCount: number;
  tradeIds: string[];
}

export interface DisputeResponse {
  id: number;
  tradeId: string;
  initiator: string;
  reason: string;
  status: DisputeStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  slaDueAt?: string | null;
  trade: {
    buyerAddress: string;
    sellerAddress: string;
    amountUsdc: string;
  };
}

export interface DisputeListResponse {
  items: DisputeResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Default SLA window (in hours) per dispute category.  Categories are derived
 * from the dispute `reason` prefix (e.g. "payment: ..." -> "payment").  Any
 * category without an explicit entry falls back to `DEFAULT_SLA_HOURS`.
 *
 * Overridable at runtime via the `DISPUTE_SLA_HOURS` env var, which accepts a
 * JSON object such as `{"payment":24,"fraud":4}`.
 */
export const DEFAULT_SLA_HOURS: Record<string, number> = {
  payment: 48,
  delivery: 72,
  fraud: 24,
  quality: 96,
};

export const DEFAULT_SLA_FALLBACK_HOURS = 72;

export function getDisputeCategory(reason: string): string {
  const [prefix] = reason.split(":", 1);
  const category = (prefix ?? "").trim().toLowerCase();
  return category.length > 0 ? category : "general";
}

export function getSlaHoursForCategory(category: string): number {
  const overrides = parseSlaOverrides(process.env.DISPUTE_SLA_HOURS);
  const hours = overrides[category] ?? DEFAULT_SLA_HOURS[category];
  return typeof hours === "number" && hours > 0
    ? hours
    : DEFAULT_SLA_FALLBACK_HOURS;
}

function parseSlaOverrides(raw: string | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, number>;
    }
  } catch {
    // Ignore malformed overrides and fall back to defaults.
  }
  return {};
}

export function computeSlaDueAt(reason: string, createdAt: Date): Date {
  const hours = getSlaHoursForCategory(getDisputeCategory(reason));
  return new Date(createdAt.getTime() + hours * 60 * 60 * 1000);
}

export interface MediatorAssignment {
  tradeId: string;
  mediatorAddress: string;
  assignedAt: string;
  reason: "created" | "sla_breach";
}

const disputeInclude = {
  trade: {
    select: { buyerAddress: true, sellerAddress: true, amountUsdc: true },
  },
} as const;

function toDisputeResponse(dispute: {
  id: number;
  tradeId: string;
  initiator: string;
  reason: string;
  status: DisputeStatus;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  trade: { buyerAddress: string; sellerAddress: string; amountUsdc: string };
}): DisputeResponse {
  const isOpen = !COMPLETED_DISPUTE_STATUSES.includes(dispute.status);
  return {
    id: dispute.id,
    tradeId: dispute.tradeId,
    initiator: dispute.initiator,
    reason: dispute.reason,
    status: dispute.status,
    createdAt: dispute.createdAt.toISOString(),
    updatedAt: dispute.updatedAt.toISOString(),
    resolvedAt: dispute.resolvedAt?.toISOString() ?? null,
    slaDueAt: isOpen
      ? computeSlaDueAt(dispute.reason, dispute.createdAt).toISOString()
      : null,
    trade: dispute.trade,
  };
}

export interface DisputeSlaAlert {
  disputeId: number;
  tradeId: string;
  category: string;
  threshold: "warning" | "escalation";
  slaDueAt: string;
  mediatorAddress: string | null;
}

export interface DisputeSlaEvaluationResult {
  evaluated: number;
  warnings: DisputeSlaAlert[];
  escalations: DisputeSlaAlert[];
}

/**
 * In-memory record of which SLA thresholds have already fired for a dispute.
 * Keeps the scheduled job idempotent so each threshold notifies exactly once.
 */
const firedThresholds = new Map<number, Set<"warning" | "escalation">>();

export function resetDisputeSlaState(): void {
  firedThresholds.clear();
}

function hasFired(
  disputeId: number,
  threshold: "warning" | "escalation",
): boolean {
  return firedThresholds.get(disputeId)?.has(threshold) ?? false;
}

function markFired(
  disputeId: number,
  threshold: "warning" | "escalation",
): void {
  const set = firedThresholds.get(disputeId) ?? new Set();
  set.add(threshold);
  firedThresholds.set(disputeId, set);
}

export class DisputeService {
  constructor(private prisma: PrismaClient) {}

  async listMediatorDisputes(
    mediatorAddress: string,
    params: { status?: DisputeStatus; page?: number; limit?: number } = {},
  ): Promise<DisputeListResponse> {
    const { status, page = 1, limit = 10 } = params;
    const offset = (page - 1) * limit;

    if (!getMediatorAllowlist().has(mediatorAddress)) {
      throw new AppError(
        ErrorCode.AUTH_ERROR,
        "Unauthorized: Not a mediator",
        403,
      );
    }

    const where = status ? { status } : {};

    const [disputes, total] = await Promise.all([
      this.prisma.dispute.findMany({
        where,
        include: disputeInclude,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      this.prisma.dispute.count({ where }),
    ]);

    return {
      items: disputes.map(toDisputeResponse),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getDisputeByTradeId(tradeId: string): Promise<DisputeResponse | null> {
    const dispute = await this.prisma.dispute.findFirst({
      where: { tradeId },
      include: disputeInclude,
    });

    if (!dispute) return null;

    return toDisputeResponse(dispute);
  }

  /**
   * Purge transient/sensitive data fields from disputes that have reached a
   * terminal status (RESOLVED or CLOSED).  The core record is retained for
   * audit purposes; only the free-text `reason` field is cleared so that PII
   * is not stored indefinitely after a case concludes.
   *
   * Only a mediator (address listed in ADMIN_STELLAR_PUBKEYS) may trigger this
   * operation.  Returns the number of records updated and the affected tradeIds.
   */
  async purgeCompletedDisputeData(
    mediatorAddress: string,
    olderThanDays = 90,
  ): Promise<DisputeCleanupResult> {
    if (!getMediatorAllowlist().has(mediatorAddress)) {
      throw new AppError(
        ErrorCode.AUTH_ERROR,
        "Unauthorized: Not a mediator",
        403,
      );
    }

    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const completed = await this.prisma.dispute.findMany({
      where: {
        status: { in: COMPLETED_DISPUTE_STATUSES },
        resolvedAt: { lte: cutoff },
        reason: { not: "" },
      },
      select: { id: true, tradeId: true },
    });

    if (completed.length === 0) {
      return { purgedCount: 0, tradeIds: [] };
    }

    const ids = completed.map((d: { id: number; tradeId: string }) => d.id);

    await this.prisma.dispute.updateMany({
      where: { id: { in: ids } },
      data: { reason: "" },
    });

    return {
      purgedCount: completed.length,
      tradeIds: completed.map(
        (d: { id: number; tradeId: string }) => d.tradeId,
      ),
    };
  }

  /**
   * Evaluate open disputes against their category SLA window and emit
   * notifications.  At 75% of the window the assigned mediator is notified;
   * at 100% the dispute is escalated to admins.  Each threshold fires at most
   * once per dispute, making the scheduled job safe to run repeatedly.
   */
  async evaluateDisputeSlas(
    now: Date = new Date(),
  ): Promise<DisputeSlaEvaluationResult> {
    const openDisputes = await this.prisma.dispute.findMany({
      where: { status: { notIn: COMPLETED_DISPUTE_STATUSES } },
      include: disputeInclude,
    });

    const warnings: DisputeSlaAlert[] = [];
    const escalations: DisputeSlaAlert[] = [];

    for (const dispute of openDisputes) {
      const category = getDisputeCategory(dispute.reason);
      const slaDueAt = computeSlaDueAt(dispute.reason, dispute.createdAt);
      const windowMs = slaDueAt.getTime() - dispute.createdAt.getTime();
      const elapsedMs = now.getTime() - dispute.createdAt.getTime();
      const ratio = windowMs > 0 ? elapsedMs / windowMs : 1;

      const mediatorAddress =
        (dispute as { mediatorAddress?: string | null }).mediatorAddress ??
        null;

      if (ratio >= 1 && !hasFired(dispute.id, "escalation")) {
        markFired(dispute.id, "escalation");
        escalations.push({
          disputeId: dispute.id,
          tradeId: dispute.tradeId,
          category,
          threshold: "escalation",
          slaDueAt: slaDueAt.toISOString(),
          mediatorAddress,
        });
      } else if (ratio >= 0.75 && !hasFired(dispute.id, "warning")) {
        markFired(dispute.id, "warning");
        warnings.push({
          disputeId: dispute.id,
          tradeId: dispute.tradeId,
          category,
          threshold: "warning",
          slaDueAt: slaDueAt.toISOString(),
          mediatorAddress,
        });
      }
    }

    return { evaluated: openDisputes.length, warnings, escalations };
  }

  /**
   * Transition a dispute to a new status.
   * Only valid forward transitions are permitted; backwards or sideways moves throw
   * DISPUTE_STATUS_TRANSITION_INVALID. Concurrent updates throw DISPUTE_STATUS_CONFLICT.
   */
  async transitionDisputeStatus(
    tradeId: string,
    mediatorAddress: string,
    newStatus: DisputeStatus,
  ): Promise<DisputeResponse> {
    if (!getMediatorAllowlist().has(mediatorAddress)) {
      throw new AppError(
        ErrorCode.AUTH_ERROR,
        "Unauthorized: Not a mediator",
        403,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const dispute = await tx.dispute.findFirst({
        where: { tradeId },
        include: disputeInclude,
      });

      if (!dispute) {
        throw new AppError(
          ErrorCode.DISPUTE_NOT_FOUND,
          `No dispute found for trade: ${tradeId}`,
          404,
        );
      }

      // Idempotency: a retry after a network timeout should succeed silently
      // when the first request already applied the transition.
      if (dispute.status === newStatus) {
        return toDisputeResponse(dispute);
      }

      assertValidTransition(dispute.status, newStatus);

      const applied = await applyDisputeStatusTransition(
        tx,
        dispute,
        newStatus,
      );
      assertTransitionApplied(applied, tradeId);

      const updated = await tx.dispute.findUniqueOrThrow({
        where: { id: dispute.id },
        include: disputeInclude,
      });

      return toDisputeResponse(updated);
    });
  }

  /**
   * Assign a mediator to a dispute using least-loaded load balancing.
   *
   * Candidates are drawn from the mediator allowlist. Any mediator who is a
   * party to the trade (buyer/seller) or a member of the trade's co-op is
   * excluded to avoid conflicts of interest. Among the remaining candidates the
   * one with the fewest open (non-terminal) disputes is selected; ties are
   * broken deterministically by address so assignment is reproducible.
   *
   * The assignment is persisted on the dispute and an assignment event is
   * logged. Returns null when no eligible mediator exists.
   */
  async assignMediator(
    tradeId: string,
    reason: "created" | "sla_breach" = "created",
  ): Promise<MediatorAssignment | null> {
    const dispute = await this.prisma.dispute.findFirst({
      where: { tradeId },
      include: disputeInclude,
    });

    if (!dispute) {
      throw new AppError(
        ErrorCode.DISPUTE_NOT_FOUND,
        `No dispute found for trade: ${tradeId}`,
        404,
      );
    }

    const candidates = await this.eligibleMediators(
      dispute.trade.buyerAddress,
      dispute.trade.sellerAddress,
    );

    if (candidates.length === 0) {
      return null;
    }

    const loads = await this.prisma.dispute.groupBy({
      by: ["mediatorAddress"],
      where: {
        mediatorAddress: { in: candidates },
        status: { notIn: COMPLETED_DISPUTE_STATUSES },
      },
      _count: { _all: true },
    });

    const loadByAddress = new Map<string, number>();
    for (const row of loads) {
      if (row.mediatorAddress) {
        loadByAddress.set(row.mediatorAddress, row._count._all);
      }
    }

    const selected = candidates.reduce((best, current) => {
      const bestLoad = loadByAddress.get(best) ?? 0;
      const currentLoad = loadByAddress.get(current) ?? 0;
      if (currentLoad < bestLoad) return current;
      if (currentLoad === bestLoad && current < best) return current;
      return best;
    });

    const assignedAt = new Date();

    await this.prisma.dispute.update({
      where: { id: dispute.id },
      data: { mediatorAddress: selected },
    });

    console.info(
      JSON.stringify({
        event: "dispute.mediator_assigned",
        tradeId,
        mediatorAddress: selected,
        reason,
        assignedAt: assignedAt.toISOString(),
      }),
    );

    return {
      tradeId,
      mediatorAddress: selected,
      assignedAt: assignedAt.toISOString(),
      reason,
    };
  }

  /**
   * Reassign disputes whose assignment has breached the SLA window to a fresh
   * mediator, excluding the currently assigned one. Returns the reassignments
   * that were applied.
   */
  async reassignOnSlaBreach(
    slaHours = 24,
    now: Date = new Date(),
  ): Promise<MediatorAssignment[]> {
    const cutoff = new Date(now.getTime() - slaHours * 60 * 60 * 1000);

    const breached = await this.prisma.dispute.findMany({
      where: {
        status: { notIn: COMPLETED_DISPUTE_STATUSES },
        mediatorAddress: { not: null },
        updatedAt: { lte: cutoff },
      },
      select: { tradeId: true, mediatorAddress: true },
    });

    const reassignments: MediatorAssignment[] = [];

    for (const dispute of breached) {
      const assignment = await this.assignMediator(dispute.tradeId, "sla_breach");
      if (assignment && assignment.mediatorAddress !== dispute.mediatorAddress) {
        reassignments.push(assignment);
      }
    }

    return reassignments;
  }

  /**
   * Resolve the set of mediators eligible to handle a trade, excluding any
   * mediator who is a party to the trade or a member of the trade's co-op.
   */
  private async eligibleMediators(
    buyerAddress: string,
    sellerAddress: string,
  ): Promise<string[]> {
    const allowlist = getMediatorAllowlist();
    const excluded = new Set<string>([buyerAddress, sellerAddress]);

    const coopMembers = await this.prisma.coopMember.findMany({
      where: { address: { in: [buyerAddress, sellerAddress] } },
      select: { coopId: true },
    });

    const coopIds = coopMembers.map((m: { coopId: string }) => m.coopId);

    if (coopIds.length > 0) {
      const members = await this.prisma.coopMember.findMany({
        where: { coopId: { in: coopIds } },
        select: { address: true },
      });
      for (const member of members) {
        excluded.add(member.address);
      }
    }

    return Array.from(allowlist)
      .filter((address) => !excluded.has(address))
      .sort();
  }
}
