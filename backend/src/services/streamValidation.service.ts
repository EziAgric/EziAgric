import { PrismaClient, Stream, StreamStatus } from "@prisma/client";
import { prisma as defaultPrisma } from "../lib/db";
import { AppError, ErrorCode } from "../errors/errorCodes";

/**
 * Shared validation for admin stream operations (#33).
 *
 * Clawback and maintenance routes historically checked only that a stream
 * existed (or relied on the mutation service to do so) without consistently
 * validating the stream's lifecycle or lock state before acting. This service
 * centralises the "does the stream exist, is the action legal in its current
 * state, is it unlocked" checks so every admin mutation behaves the same way:
 *   - unknown stream ID       -> 404 NOT_FOUND
 *   - action invalid in state -> 409 DOMAIN_ERROR
 *   - locked for maintenance  -> 409 DOMAIN_ERROR
 */

/** Statuses a stream can be live (terminable/clawbackable) in. */
export const LIVE_STATUSES: readonly StreamStatus[] = [
  StreamStatus.ACTIVE,
  StreamStatus.SUSPENDED,
];

/** Statuses a stream can be suspended from. */
export const SUSPENDABLE_STATUSES: readonly StreamStatus[] = [StreamStatus.ACTIVE];

/** Statuses a stream can be resumed from. */
export const RESUMABLE_STATUSES: readonly StreamStatus[] = [StreamStatus.SUSPENDED];

type StreamPrisma = Pick<PrismaClient, "stream">;

export class StreamValidationService {
  private prisma: StreamPrisma;

  constructor(prisma: StreamPrisma = defaultPrisma) {
    this.prisma = prisma;
  }

  /** Loads the stream, throwing 404 when the stream ID does not exist. */
  async getStreamOrThrow(streamId: string): Promise<Stream> {
    const stream = await this.prisma.stream.findUnique({ where: { streamId } });
    if (!stream) {
      throw new AppError(ErrorCode.NOT_FOUND, `Stream ${streamId} not found`, 404, {
        streamId,
      });
    }
    return stream;
  }

  /** Throws 409 when the stream's current lifecycle does not allow the action. */
  assertStatusAllowed(
    stream: Pick<Stream, "streamId" | "status">,
    allowedStatuses: readonly StreamStatus[],
    actionDescription: string,
  ): void {
    if (!allowedStatuses.includes(stream.status)) {
      throw new AppError(
        ErrorCode.DOMAIN_ERROR,
        `Stream ${stream.streamId} cannot be ${actionDescription} from status ${stream.status}`,
        409,
        {
          streamId: stream.streamId,
          status: stream.status,
          allowedStatuses: [...allowedStatuses],
        },
      );
    }
  }

  /** Throws 409 when the stream is locked for maintenance. */
  assertNotLocked(
    stream: Pick<Stream, "streamId" | "lockedAt" | "lockedBy" | "lockReason">,
  ): void {
    if (stream.lockedAt) {
      throw new AppError(
        ErrorCode.DOMAIN_ERROR,
        `Stream ${stream.streamId} is locked for maintenance`,
        409,
        {
          streamId: stream.streamId,
          lockedBy: stream.lockedBy,
          lockedAt: stream.lockedAt.toISOString(),
          lockReason: stream.lockReason,
        },
      );
    }
  }

  /**
   * One-shot validation for an admin mutation: existence (404), lifecycle
   * state (409), then maintenance lock (409). Returns the loaded stream so the
   * caller can act on real data instead of re-fetching.
   */
  async requireActionableStream(
    streamId: string,
    allowedStatuses: readonly StreamStatus[],
    actionDescription: string,
  ): Promise<Stream> {
    const stream = await this.getStreamOrThrow(streamId);
    this.assertStatusAllowed(stream, allowedStatuses, actionDescription);
    this.assertNotLocked(stream);
    return stream;
  }
}

export const streamValidationService = new StreamValidationService();
