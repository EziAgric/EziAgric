import { appLogger } from "../middleware/logger";

export interface EvidenceTranscodeJob {
  evidenceId: number;
  tradeId: string;
  originalCid: string;
  filename: string;
}

/**
 * ponytail: no transcode worker exists yet, so this only records the request.
 * Uploads already treat transcoding as best-effort; replace with a BullMQ
 * queue add once a worker that pins the 480p rendition + thumbnail lands.
 */
export async function enqueueEvidenceTranscode(job: EvidenceTranscodeJob): Promise<void> {
  appLogger.info({ event: "evidence.transcode.skipped", ...job }, "Evidence transcode not configured");
}
