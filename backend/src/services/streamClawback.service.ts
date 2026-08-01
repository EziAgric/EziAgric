import { AppError, ErrorCode } from "../errors/errorCodes";

// In-memory lock set to serialize clawback operations per stream.
// Only one clawback request per stream ID is processed at a time;
// concurrent requests receive a 409 Conflict response.
const activeClawbacks = new Set<string>();

export class StreamClawbackService {
  acquire(streamId: string): void {
    if (activeClawbacks.has(streamId)) {
      throw new AppError(
        ErrorCode.DOMAIN_ERROR,
        `A clawback operation is already in progress for stream ${streamId}`,
        409,
        { streamId },
      );
    }
    activeClawbacks.add(streamId);
  }

  release(streamId: string): void {
    activeClawbacks.delete(streamId);
  }

  isLocked(streamId: string): boolean {
    return activeClawbacks.has(streamId);
  }
}

export const streamClawbackService = new StreamClawbackService();
