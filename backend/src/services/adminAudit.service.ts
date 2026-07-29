import { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../lib/db";

export interface AdminActionAuditRecord {
  id: number;
  action: string;
  actorAddress: string;
  targetReference: string | null;
  note: string | null;
  createdAt: Date;
}

export interface AdminAuditListParams {
  page?: number;
  limit?: number;
}

export interface AdminAuditListResult {
  items: AdminActionAuditRecord[];
  pagination: {
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
    const page = Number.isFinite(params.page) && (params.page as number) > 0 ? Math.floor(params.page as number) : 1;
    const requestedLimit = Number.isFinite(params.limit) && (params.limit as number) > 0 ? Math.floor(params.limit as number) : DEFAULT_LIMIT;
    const limit = Math.min(requestedLimit, MAX_LIMIT);

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
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
}

export const adminAuditService = new AdminAuditService();
