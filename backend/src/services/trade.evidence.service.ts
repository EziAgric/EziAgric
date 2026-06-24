import { PrismaClient, TradeStatus } from "@prisma/client";
import { prisma as defaultPrisma } from "../lib/db";
import { getAdminAllowlistLowercase } from "../lib/accessControl";
import { IPFSService } from "./ipfs.service";

export type DisputeEvidenceType = "video" | "manifest";

export class DisputeEvidenceTradeNotFoundError extends Error {
  status = 404;
  constructor() {
    super("Trade not found");
    this.name = "DisputeEvidenceTradeNotFoundError";
  }
}

export class DisputeEvidenceAccessDeniedError extends Error {
  status = 403;
  constructor() {
    super("Access denied: you are not allowed to view this dispute evidence");
    this.name = "DisputeEvidenceAccessDeniedError";
  }
}

export class TradeNotDisputedError extends Error {
  status = 409;
  constructor() {
    super("Evidence is available only for disputed trades");
    this.name = "TradeNotDisputedError";
  }
}

type EvidenceListDatabase = Pick<PrismaClient, "trade" | "dispute" | "tradeEvidence" | "deliveryManifest">;

type ListOptions = { type?: DisputeEvidenceType; page: number; limit: number };

export class TradeEvidenceListService {
  constructor(
    private readonly prisma: EvidenceListDatabase = defaultPrisma,
    private readonly ipfs = new IPFSService(),
  ) {}

  async list(tradeId: string, callerAddress: string, options: ListOptions) {
    const trade = await this.prisma.trade.findUnique({ where: { tradeId } });
    if (!trade) throw new DisputeEvidenceTradeNotFoundError();

    const caller = callerAddress.toLowerCase();
    const isAdmin = getAdminAllowlistLowercase().has(caller);
    if (trade.buyerAddress.toLowerCase() !== caller && trade.sellerAddress.toLowerCase() !== caller && !isAdmin) {
      throw new DisputeEvidenceAccessDeniedError();
    }

    const dispute = await this.prisma.dispute.findUnique({ where: { tradeId } });
    if (trade.status !== TradeStatus.DISPUTED && !dispute) throw new TradeNotDisputedError();

    if (options.type === "manifest") {
      return this.listManifest(tradeId, options);
    }
    if (options.type === "video") {
      return this.listVideos(tradeId, options);
    }

    // A manifest is a single metadata record while videos can be numerous. For
    // the mixed view, merge in timestamp order before applying pagination.
    const [videos, manifest] = await Promise.all([
      this.prisma.tradeEvidence.findMany({ where: { tradeId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
      this.prisma.deliveryManifest.findUnique({ where: { tradeId } }),
    ]);
    const all = [
      ...videos.map((video) => this.videoItem(video)),
      ...(manifest ? [this.manifestItem(manifest)] : []),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
    return this.paginate(all, options);
  }

  private async listVideos(tradeId: string, options: ListOptions) {
    const [records, total] = await Promise.all([
      this.prisma.tradeEvidence.findMany({
        where: { tradeId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
      this.prisma.tradeEvidence.count({ where: { tradeId } }),
    ]);
    return this.paginationResponse(records.map((record) => this.videoItem(record)), total, options);
  }

  private async listManifest(tradeId: string, options: ListOptions) {
    const manifest = await this.prisma.deliveryManifest.findUnique({ where: { tradeId } });
    const items = manifest ? [this.manifestItem(manifest)] : [];
    return this.paginate(items, options);
  }

  private videoItem(record: { id: number; cid: string; filename: string; mimeType: string; uploadedBy: string; createdAt: Date }) {
    const signed = this.ipfs.getSignedFileUrl(record.cid);
    return {
      id: `video:${record.id}`,
      type: "video" as const,
      cid: record.cid,
      filename: record.filename,
      mimeType: record.mimeType,
      uploadedBy: record.uploadedBy,
      downloadUrl: signed.url,
      expiresAt: signed.expiresAt,
      createdAt: record.createdAt,
    };
  }

  private manifestItem(manifest: { id: number; tradeId: string; createdAt: Date }) {
    // Delivery manifests are retained in the database (not IPFS) because they
    // may include sensitive transport data. They are represented in the list
    // but intentionally do not expose a downloadable public URL.
    return {
      id: `manifest:${manifest.id}`,
      type: "manifest" as const,
      tradeId: manifest.tradeId,
      filename: "delivery-manifest.json",
      mimeType: "application/json",
      downloadUrl: null,
      expiresAt: null,
      createdAt: manifest.createdAt,
    };
  }

  private paginate<T extends { createdAt: Date }>(items: T[], options: ListOptions) {
    const total = items.length;
    const start = (options.page - 1) * options.limit;
    return this.paginationResponse(items.slice(start, start + options.limit), total, options);
  }

  private paginationResponse<T>(items: T[], total: number, options: ListOptions) {
    return {
      items,
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / options.limit)),
      },
    };
  }
}
