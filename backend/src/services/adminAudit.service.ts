import { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../lib/db";
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

export class AdminAuditService {
  private prisma: Pick<PrismaClient, "adminActionAudit">;

  constructor(prisma: Pick<PrismaClient, "adminActionAudit"> = defaultPrisma) {
    this.prisma = prisma;
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
