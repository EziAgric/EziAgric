import { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../lib/db";
import { computeAuditEntryHash } from "../lib/auditChain";
import { paginateWithCursor, normalizeCursorLimit, CursorPageResult } from "../lib/cursorPagination";

export interface AdminActionAuditRecord {
  id: number;
  action: string;
  actorAddress: string;
  targetReference: string | null;
  note: string | null;
  createdAt: Date;
}

export interface AdminAuditListParams {
  /** Opaque cursor from a previous page's pageInfo.nextCursor. Preferred over page/limit. */
  cursor?: string;
  limit?: number;
  /** @deprecated offset pagination — kept for backward compatibility, migrate to cursor. */
  page?: number;
}

export interface AdminAuditListResult extends CursorPageResult<AdminActionAuditRecord> {
  /** @deprecated present only when callers request offset pagination via `page`. */
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface AuditChainVerificationResult {
  valid: boolean;
  entriesChecked: number;
  /** id of the first entry whose hash doesn't match, if any. */
  brokenAtId?: number;
  /** Hash of the latest chained entry — usable as an external checkpoint anchor. */
  checkpoint: string | null;
}

export class AdminAuditService {
  private prisma: Pick<PrismaClient, "adminActionAudit">;

  constructor(prisma: Pick<PrismaClient, "adminActionAudit"> = defaultPrisma) {
    this.prisma = prisma;
  }

  /**
   * Recomputes the hash chain over every AdminActionAudit row and compares it
   * to what's stored. Rows written before chaining was introduced have an
   * empty `hash` and are skipped rather than flagged as broken (legacy
   * backfill: they were never chained, so there's nothing to verify).
   *
   * This proves no chained row was edited or deleted after being written; it
   * cannot detect tampering that also rewrites every hash after the edited
   * row to stay internally consistent (see lib/auditChain.ts).
   */
  async verifyChain(): Promise<AuditChainVerificationResult> {
    const rows = await this.prisma.adminActionAudit.findMany({ orderBy: { id: "asc" } });

    let expectedPrevHash = "";
    let entriesChecked = 0;
    let brokenAtId: number | undefined;
    let checkpoint: string | null = null;

    for (const row of rows) {
      if (!row.hash) continue; // legacy pre-chain row

      const recomputed = computeAuditEntryHash(expectedPrevHash, {
        action: row.action,
        actorAddress: row.actorAddress,
        targetReference: row.targetReference,
        note: row.note,
        createdAt: row.createdAt,
      });

      entriesChecked += 1;
      if (row.prevHash !== expectedPrevHash || row.hash !== recomputed) {
        brokenAtId = brokenAtId ?? row.id;
      }

      expectedPrevHash = row.hash;
      checkpoint = row.hash;
    }

    return { valid: brokenAtId === undefined, entriesChecked, brokenAtId, checkpoint };
  }

  async list(params: AdminAuditListParams = {}): Promise<AdminAuditListResult> {
    const limit = normalizeCursorLimit(params.limit ?? DEFAULT_LIMIT);

    // Legacy offset mode: only engaged when a caller still sends `page` and
    // no `cursor`. New/updated clients should never send `page`.
    if (!params.cursor && params.page !== undefined) {
      const page = Number.isFinite(params.page) && params.page > 0 ? Math.floor(params.page) : 1;
      const [items, total] = await Promise.all([
        this.prisma.adminActionAudit.findMany({
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.adminActionAudit.count(),
      ]);

      return {
        items,
        pageInfo: { nextCursor: null, hasNextPage: page * limit < total, limit },
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      };
    }

    return paginateWithCursor<AdminActionAuditRecord>({
      findMany: (args) => this.prisma.adminActionAudit.findMany(args as any),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      cursor: params.cursor,
      limit,
    });
  }
}

export const adminAuditService = new AdminAuditService();
