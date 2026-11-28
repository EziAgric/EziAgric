import { PrismaClient, Stream, StreamStatus } from "@prisma/client";
import { prisma as defaultPrisma } from "../lib/db";

/**
 * Admin stream list (#51).
 *
 * `status` is the stream's on-chain lifecycle (ACTIVE/SUSPENDED/TERMINATED/
 * COMPLETED); `vestingState` is a separate, derived read of how much of the
 * stream has actually vested so far. A SUSPENDED stream can still be
 * `fully_vested`, so the two are filtered independently rather than folding
 * one into the other.
 */
export type VestingState = "not_started" | "vesting" | "fully_vested";

export interface AdminStreamSummary {
  streamId: string;
  recipient: string;
  status: StreamStatus;
  vestingState: VestingState;
  totalVested: string;
  claimed: string;
  unclaimed: string;
  pendingClawback: string;
  adminTags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminStreamListParams {
  page?: number;
  limit?: number;
  status?: StreamStatus;
  vestingState?: VestingState;
  adminTag?: string;
}

export interface AdminStreamListResult {
  items: AdminStreamSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** `totalVested`/`claimed` are arbitrary-precision decimal strings, so this compares as BigInt rather than risking float precision loss. */
export function vestingStateOf(stream: Pick<Stream, "claimed" | "totalVested">): VestingState {
  const claimed = BigInt(stream.claimed || "0");
  const total = BigInt(stream.totalVested || "0");
  if (claimed <= BigInt(0)) return "not_started";
  if (total > BigInt(0) && claimed >= total) return "fully_vested";
  return "vesting";
}

function toSummary(stream: Stream): AdminStreamSummary {
  return {
    streamId: stream.streamId,
    recipient: stream.recipient,
    status: stream.status,
    vestingState: vestingStateOf(stream),
    totalVested: stream.totalVested,
    claimed: stream.claimed,
    unclaimed: stream.unclaimed,
    pendingClawback: stream.pendingClawback,
    adminTags: stream.adminTags,
    createdAt: stream.createdAt,
    updatedAt: stream.updatedAt,
  };
}

type StreamPrisma = Pick<PrismaClient, "stream">;

export class AdminStreamsService {
  private prisma: StreamPrisma;

  constructor(prisma: StreamPrisma = defaultPrisma) {
    this.prisma = prisma;
  }

  /** Single-stream lookup backing the clawback preview route. */
  async getByStreamId(streamId: string): Promise<Stream | null> {
    return this.prisma.stream.findUnique({ where: { streamId } });
  }

  /**
   * `vestingState` is computed from `claimed`/`totalVested`, which are stored
   * as decimal strings (see above) and can't be compared numerically in SQL
   * without a cast, so the DB-level query filters by `status`/`adminTag` only
   * and `vestingState` is applied in-memory afterwards. Admin stream counts
   * are small (compliance tooling, not a public listing), so this trades a
   * theoretical scan cost for not needing raw SQL here.
   */
  async list(params: AdminStreamListParams = {}): Promise<AdminStreamListResult> {
    const page =
      Number.isFinite(params.page) && (params.page as number) > 0
        ? Math.floor(params.page as number)
        : 1;
    const requestedLimit =
      Number.isFinite(params.limit) && (params.limit as number) > 0
        ? Math.floor(params.limit as number)
        : DEFAULT_LIMIT;
    const limit = Math.min(requestedLimit, MAX_LIMIT);

    const streams = await this.prisma.stream.findMany({
      where: {
        ...(params.status ? { status: params.status } : {}),
        ...(params.adminTag ? { adminTags: { has: params.adminTag } } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    const filtered = params.vestingState
      ? streams.filter((stream) => vestingStateOf(stream) === params.vestingState)
      : streams;

    const total = filtered.length;
    const start = (page - 1) * limit;
    const pageItems = filtered.slice(start, start + limit);

    return {
      items: pageItems.map(toSummary),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
}

export const adminStreamsService = new AdminStreamsService();
