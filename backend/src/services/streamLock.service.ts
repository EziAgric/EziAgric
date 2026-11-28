import { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../lib/db";
import { AppError, ErrorCode } from "../errors/errorCodes";
import { adminNotificationService as defaultAdminNotificationService, AdminNotificationService, extractErrorInfo } from "./adminNotification.service";

export const ADMIN_ACTION_STREAM_LOCK = "STREAM_LOCK";
export const ADMIN_ACTION_STREAM_UNLOCK = "STREAM_UNLOCK";

export interface LockStreamInput {
  streamId: string;
  adminAddress: string;
  reason?: string;
}

export interface UnlockStreamInput {
  streamId: string;
  adminAddress: string;
  reason?: string;
}

export interface LockStreamResult {
  streamId: string;
  locked: boolean;
  lockedBy: string;
  lockedAt: string;
  reason: string | null;
}

export interface UnlockStreamResult {
  streamId: string;
  locked: boolean;
  unlockedBy: string;
  unlockedAt: string;
  reason: string | null;
}

type StreamPrisma = Pick<PrismaClient, "stream" | "adminActionAudit">;

export class StreamLockService {
  private prisma: StreamPrisma;
  private adminNotification: AdminNotificationService;

  constructor(prisma: StreamPrisma = defaultPrisma, adminNotification?: AdminNotificationService) {
    this.prisma = prisma;
    this.adminNotification = adminNotification ?? defaultAdminNotificationService;
  }

  async lock(input: LockStreamInput): Promise<LockStreamResult> {
    const { streamId, adminAddress, reason } = input;

    try {
      const stream = await this.prisma.stream.findUnique({
        where: { streamId },
        select: { streamId: true, lockedAt: true },
      });

      if (!stream) {
        throw new AppError(
          ErrorCode.NOT_FOUND,
          `Stream ${streamId} not found`,
          404,
          { streamId },
        );
      }

      if (stream.lockedAt) {
        return {
          streamId,
          locked: true,
          lockedBy: "",
          lockedAt: stream.lockedAt.toISOString(),
          reason: null,
        };
      }

      const now = new Date();
      await this.prisma.stream.update({
        where: { streamId },
        data: {
          lockedAt: now,
          lockedBy: adminAddress,
          lockReason: reason ?? null,
        },
      });

      await this.prisma.adminActionAudit.create({
        data: {
          action: ADMIN_ACTION_STREAM_LOCK,
          actorAddress: adminAddress,
          targetReference: streamId,
          note: reason ?? null,
        },
      });

      const result: LockStreamResult = {
        streamId,
        locked: true,
        lockedBy: adminAddress,
        lockedAt: now.toISOString(),
        reason: reason ?? null,
      };

      this.adminNotification.notifyStreamLocked({
        streamId,
        adminAddress,
        reason: reason ?? null,
        timestamp: now.toISOString(),
      });

      return result;
    } catch (error) {
      this.adminNotification.notifyOperationFailed({
        streamId,
        adminAddress,
        action: ADMIN_ACTION_STREAM_LOCK,
        error: extractErrorInfo(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  async unlock(input: UnlockStreamInput): Promise<UnlockStreamResult> {
    const { streamId, adminAddress, reason } = input;

    try {
      const stream = await this.prisma.stream.findUnique({
        where: { streamId },
        select: { streamId: true, lockedAt: true },
      });

      if (!stream) {
        throw new AppError(
          ErrorCode.NOT_FOUND,
          `Stream ${streamId} not found`,
          404,
          { streamId },
        );
      }

      if (!stream.lockedAt) {
        return {
          streamId,
          locked: false,
          unlockedBy: "",
          unlockedAt: new Date().toISOString(),
          reason: null,
        };
      }

      await this.prisma.stream.update({
        where: { streamId },
        data: {
          lockedAt: null,
          lockedBy: null,
          lockReason: null,
        },
      });

      await this.prisma.adminActionAudit.create({
        data: {
          action: ADMIN_ACTION_STREAM_UNLOCK,
          actorAddress: adminAddress,
          targetReference: streamId,
          note: reason ?? null,
        },
      });

      const now = new Date();
      const result: UnlockStreamResult = {
        streamId,
        locked: false,
        unlockedBy: adminAddress,
        unlockedAt: now.toISOString(),
        reason: reason ?? null,
      };

      this.adminNotification.notifyStreamUnlocked({
        streamId,
        adminAddress,
        reason: reason ?? null,
        timestamp: now.toISOString(),
      });

      return result;
    } catch (error) {
      this.adminNotification.notifyOperationFailed({
        streamId,
        adminAddress,
        action: ADMIN_ACTION_STREAM_UNLOCK,
        error: extractErrorInfo(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  async requireStreamNotLocked(streamId: string): Promise<void> {
    const stream = await this.prisma.stream.findUnique({
      where: { streamId },
      select: {
        streamId: true,
        lockedAt: true,
        lockedBy: true,
        lockReason: true,
      },
    });

    if (!stream) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        `Stream ${streamId} not found`,
        404,
        { streamId },
      );
    }

    if (stream.lockedAt) {
      throw new AppError(
        ErrorCode.DOMAIN_ERROR,
        `Stream ${streamId} is locked for maintenance`,
        409,
        {
          streamId,
          lockedBy: stream.lockedBy,
          lockedAt: stream.lockedAt.toISOString(),
          lockReason: stream.lockReason,
        },
      );
    }
  }
}

export const streamLockService = new StreamLockService();
