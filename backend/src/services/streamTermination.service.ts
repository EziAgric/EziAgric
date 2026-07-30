import { PrismaClient, StreamStatus } from "@prisma/client";
import { prisma as defaultPrisma } from "../lib/db";
import { AppError, ErrorCode } from "../errors/errorCodes";
import { adminNotificationService as defaultAdminNotificationService, AdminNotificationService, extractErrorInfo } from "./adminNotification.service";

/**
 * Admin-initiated stream termination (#24).
 *
 * Termination is irreversible, so state validation happens before anything is
 * signed or written: the stream must exist and must still be in a live state.
 * Attempting to terminate an already-terminal stream is a conflict, not a
 * no-op — silently succeeding would hide a double-submit from the operator and
 * produce a second audit record for one real action.
 */

/** States a stream can be terminated from. */
export const TERMINABLE_STATUSES: readonly StreamStatus[] = [
  StreamStatus.ACTIVE,
  StreamStatus.SUSPENDED,
];

export const ADMIN_ACTION_STREAM_TERMINATE = "STREAM_TERMINATE";

export interface TerminateStreamInput {
  streamId: string;
  /** Wallet address of the admin performing the termination (from the JWT). */
  adminAddress: string;
  reason?: string;
  /**
   * Optional unsigned Soroban transaction XDR for the on-chain terminate call.
   * When supplied it is signed with the admin key and returned for submission;
   * the resulting on-chain event is ingested by the event listener. When
   * omitted, only the backend state transition is performed.
   */
  unsignedTxXdr?: string;
}

export interface TerminateStreamResult {
  streamId: string;
  status: StreamStatus;
  previousStatus: StreamStatus;
  terminatedBy: string;
  terminatedAt: string;
  reason: string | null;
  /** Present only when an unsigned XDR was supplied by the caller. */
  signedTxXdr: string | null;
  unclaimed: string;
}

/** Signs a Soroban transaction XDR. Injected so tests need no admin keypair. */
export type TransactionSigner = (unsignedTxXdr: string) => string;

type StreamPrisma = Pick<PrismaClient, "stream" | "adminActionAudit">;

export class StreamTerminationService {
  private prisma: StreamPrisma;
  private signTransaction?: TransactionSigner;
  private adminNotification: AdminNotificationService;

  constructor(prisma: StreamPrisma = defaultPrisma, signTransaction?: TransactionSigner, adminNotification?: AdminNotificationService) {
    this.prisma = prisma;
    this.signTransaction = signTransaction;
    this.adminNotification = adminNotification ?? defaultAdminNotificationService;
  }

  /**
   * Resolves the signer lazily. `sorobanAdmin.service` reads ADMIN_SECRET_KEY at
   * call time, so requiring it here keeps a terminate-without-XDR request (and
   * every unit test) from depending on admin key configuration.
   */
  private getSigner(): TransactionSigner {
    if (this.signTransaction) return this.signTransaction;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { sorobanAdminService } = require("./sorobanAdmin.service");
    return (xdr: string) => sorobanAdminService.signTransaction(xdr);
  }

  async terminate(input: TerminateStreamInput): Promise<TerminateStreamResult> {
    const { streamId, adminAddress, reason, unsignedTxXdr } = input;

    try {
      const stream = await this.prisma.stream.findUnique({ where: { streamId } });

      if (!stream) {
        throw new AppError(ErrorCode.NOT_FOUND, `Stream ${streamId} not found`, 404, {
          streamId,
        });
      }

      if (!TERMINABLE_STATUSES.includes(stream.status)) {
        throw new AppError(
          ErrorCode.DOMAIN_ERROR,
          `Stream ${streamId} cannot be terminated from status ${stream.status}`,
          409,
          {
            streamId,
            status: stream.status,
            terminableFrom: [...TERMINABLE_STATUSES],
          },
        );
      }

      // Sign before mutating: if signing fails the stream must stay live rather
      // than be marked terminated with no transaction to submit.
      let signedTxXdr: string | null = null;
      if (unsignedTxXdr) {
        signedTxXdr = this.getSigner()(unsignedTxXdr);
      }

      const terminatedAt = new Date();

      const updated = await this.prisma.stream.update({
        where: { streamId },
        data: {
          status: StreamStatus.TERMINATED,
          terminatedAt,
          terminatedBy: adminAddress,
          terminationReason: reason ?? null,
        },
      });

      await this.prisma.adminActionAudit.create({
        data: {
          action: ADMIN_ACTION_STREAM_TERMINATE,
          actorAddress: adminAddress,
          targetReference: streamId,
          note: reason ?? null,
        },
      });

      const result: TerminateStreamResult = {
        streamId,
        status: updated.status,
        previousStatus: stream.status,
        terminatedBy: adminAddress,
        terminatedAt: terminatedAt.toISOString(),
        reason: reason ?? null,
        signedTxXdr,
        unclaimed: updated.unclaimed,
      };

      this.adminNotification.notifyStreamTerminated({
        streamId,
        adminAddress,
        reason: reason ?? null,
        previousStatus: stream.status,
        terminatedAt: terminatedAt.toISOString(),
        unclaimed: updated.unclaimed,
      });

      return result;
    } catch (error) {
      this.adminNotification.notifyOperationFailed({
        streamId,
        adminAddress,
        action: ADMIN_ACTION_STREAM_TERMINATE,
        error: extractErrorInfo(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }
}

export const streamTerminationService = new StreamTerminationService();
