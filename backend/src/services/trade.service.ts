import crypto from "crypto";
import { Prisma, PrismaClient, Trade, TradeStatus, DisputeStatus } from "@prisma/client";
import { prisma as defaultPrisma } from "../lib/db";
import { ContractService } from "./contract.service";
import { appLogger } from "../middleware/logger";
import { TracingHelper } from "../config/tracing";
import { formatStroopsToDecimal, parseDecimalToStroops } from "../lib/money";
import {
  recordTradeFunnelEvent,
  recordTimeToFund,
  recordTimeToRelease,
  recordTradeGmv,
} from "../lib/metrics";

/**
 * Settlement asset code used when backfilling/deriving the asset-agnostic
 * `amount` + `assetCode` fields from the legacy `amountUsdc` column.
 * cNGN is the settlement asset per the README.
 */
export const DEFAULT_SETTLEMENT_ASSET_CODE =
  process.env.SETTLEMENT_ASSET_CODE ?? "cNGN";

function parseAdminPubkeys(): Set<string> {
  const raw = process.env.ADMIN_STELLAR_PUBKEYS ?? "";
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sanitizeLogField(value: string, maxLength = 200): string {
  return String(value).replace(/[\r\n\t]/g, "_").slice(0, maxLength);
}

/**
 * Resolve the asset-agnostic amount for a trade, preferring the new `amount`
 * column and falling back to the legacy `amountUsdc` during the transition.
 */
function resolveTradeAmount(trade: {
  amount?: Prisma.Decimal | string | null;
  amountUsdc?: Prisma.Decimal | string | null;
}): string {
  const value = trade.amount ?? trade.amountUsdc;
  return value == null ? "0" : String(value);
}

/**
 * Resolve the settlement asset code for a trade, preferring the new
 * `assetCode` column and falling back to the configured settlement asset.
 */
function resolveTradeAssetCode(trade: {
  assetCode?: string | null;
}): string {
  return trade.assetCode ?? DEFAULT_SETTLEMENT_ASSET_CODE;
}

/**
 * Serialize a trade for API responses, exposing the asset-agnostic `amount`
 * and `assetCode` while keeping `amountUsdc` for backward compatibility.
 */
export function serializeTrade<T extends {
  amount?: Prisma.Decimal | string | null;
  amountUsdc?: Prisma.Decimal | string | null;
  assetCode?: string | null;
}>(trade: T) {
  const amount = resolveTradeAmount(trade);
  return {
    ...trade,
    amount,
    assetCode: resolveTradeAssetCode(trade),
    // Legacy alias retained during the two-step migration.
    amountUsdc: trade.amountUsdc ?? amount,
  };
}

export interface CreatePendingTradeInput {
  tradeId: string;
  buyerAddress: string;
  sellerAddress: string;
  amountUsdc: string;
  buyerLossBps: number;
  sellerLossBps: number;
}

export type TradeListFilters = {
  status?: TradeStatus;
  page?: number;
  limit?: number;
  sort?: string;
};

type TradeDatabase = Pick<PrismaClient, "trade" | "dispute" | "disputeCategory"> &
  Partial<Pick<PrismaClient, "userWatchlist">>;

export class TradeAccessDeniedError extends Error {
  constructor() {
    super("Forbidden");
    this.name = "TradeAccessDeniedError";
  }
}

export class DisputeTradeStatusError extends Error {
  status = 400;
  constructor(status: string) {
    super(`Trade must be in FUNDED or DELIVERED status to initiate a dispute (current: ${status})`);
    this.name = "DisputeTradeStatusError";
  }
}

export class DisputeCategoryValidationError extends Error {
  status = 400;

  constructor(category: string | number) {
    super(`Invalid dispute category: ${category}`);
    this.name = "DisputeCategoryValidationError";
  }
}

export class TradeService {
  constructor(
    private readonly prisma: TradeDatabase = defaultPrisma,
    private readonly contractService: ContractService = new ContractService(),
  ) { }

  async createPendingTrade(input: CreatePendingTradeInput): Promise<Trade> {
    appLogger.info({
      requestId: undefined, // Will be filled by context if available
      userId: sanitizeLogField(input.buyerAddress),
      paymentId: sanitizeLogField(input.tradeId),
      provider: "stellar",
      status: "authorization_started",
      timestamp: new Date().toISOString()
    }, "Payment authorization started");

    TracingHelper.addEvent("authorization_started", {
      paymentId: sanitizeLogField(input.tradeId),
      userId: sanitizeLogField(input.buyerAddress)
    });

    const trade = await this.prisma.trade.create({
      data: {
        ...input,
        // Mirror the legacy amount into the asset-agnostic columns so new
        // rows are readable through both fields during the transition.
        amount: input.amountUsdc,
        assetCode: DEFAULT_SETTLEMENT_ASSET_CODE,
        status: TradeStatus.PENDING_SIGNATURE,
      },
    });
    // KPI: record the pending creation so the funnel tracks attempts from the
    // DB side (the on-chain TradeCreated event handler records "created" again
    // once the tx is confirmed, keeping both counts for reconciliation).
    recordTradeFunnelEvent("created");
    return trade;
  }

  async listUserTrades(address: string, filters: TradeListFilters) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const skip = (page - 1) * limit;
    const orderBy = this.parseSort(filters.sort);

    const where: Prisma.TradeWhereInput = {
      OR: [{ buyerAddress: address }, { sellerAddress: address }],
      ...(filters.status ? { status: filters.status } : {}),
    };

    const watchlist = this.prisma.userWatchlist;
    if (watchlist) {
      // Prisma cannot order a relation by whether it belongs to *this* caller.
      // Fetch the caller's indexed bookmarks first, then query only the
      // remaining trades for the rest of the page. This keeps watched trades at
      // the top without incorrectly promoting trades watched by other users.
      const [entries, total] = await Promise.all([
        watchlist.findMany({
          where: { userAddress: address.toLowerCase() },
          include: { trade: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        }),
        this.prisma.trade.count({ where }),
      ]);
      const watched = entries
        .map((entry) => entry.trade)
        .filter((trade) =>
          !filters.status || trade.status === filters.status,
        );
      const watchedIds = watched.map((trade) => trade.tradeId);
      const watchedPage = watched.slice(skip, skip + limit);
      const remainingSlots = limit - watchedPage.length;
      const remainingSkip = Math.max(0, skip - watched.length);
      const unwatchlisted = remainingSlots > 0
        ? await this.prisma.trade.findMany({
          where: watchedIds.length > 0
            ? { AND: [where, { NOT: { tradeId: { in: watchedIds } } }] }
            : where,
          orderBy,
          skip: remainingSkip,
          take: remainingSlots,
        })
        : [];

      return {
        items: [...watchedPage, ...unwatchlisted].map(serializeTrade),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.trade.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.trade.count({ where }),
    ]);

    return {
      items: items.map(serializeTrade),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getTradeById(id: string, callerAddress: string) {
    const numericId = Number(id);
    const orConditions: Prisma.TradeWhereInput[] = [{ tradeId: id }];

    if (Number.isInteger(numericId) && numericId > 0) {
      orConditions.push({ id: numericId });
    }

    const trade = await this.prisma.trade.findFirst({
      where: {
        OR: orConditions,
      },
    });

    if (!trade) {
      return null;
    }

    const caller = callerAddress.toLowerCase();
    if (
      trade.buyerAddress.toLowerCase() !== caller &&
      trade.sellerAddress.toLowerCase() !== caller &&
      !parseAdminPubkeys().has(caller)
    ) {
      throw new TradeAccessDeniedError();
    }

    return serializeTrade(trade);
  }

  async getUserStats(address: string) {
    const trades = await this.prisma.trade.findMany({
      where: {
        OR: [{ buyerAddress: address }, { sellerAddress: address }],
      },
      select: {
        amount: true,
        amountUsdc: true,
        status: true,
      },
    });

    const openStatuses = new Set<TradeStatus>([
      TradeStatus.PENDING_SIGNATURE,
      TradeStatus.CREATED,
      TradeStatus.FUNDED,
      TradeStatus.DELIVERED,
      TradeStatus.DISPUTED,
    ]);

    const totalTrades = trades.length;
    // Accumulated in integer stroops: summing `Number(amountUsdc)` lost
    // precision above 2^53 stroops and drifted further with every addition.
    const totalVolumeStroops = trades.reduce((sum, trade) => {
      try {
        return sum + parseDecimalToStroops(resolveTradeAmount(trade));
      } catch {
        // A malformed legacy row must not take down the whole stats call.
        return sum;
      }
    }, 0n);
    const openTrades = trades.filter((trade) => openStatuses.has(trade.status)).length;

    return {
      totalTrades,
      totalVolume: formatStroopsToDecimal(totalVolumeStroops),
      openTrades,
    };
  }

  private parseSort(sort?: string): Prisma.TradeOrderByWithRelationInput[] {
    if (!sort) {
      return [{ createdAt: "desc" }, { id: "desc" }];
    }

    const [fieldRaw, dirRaw] = sort.split(":");
    const field = fieldRaw as keyof Prisma.TradeOrderByWithRelationInput;
    const direction = dirRaw?.toLowerCase() === "asc" ? "asc" : "desc";

    const allowedFields = new Set<st

/* … truncated 2914 chars — edit only what you need near the top … */
