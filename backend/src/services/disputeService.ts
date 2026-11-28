import { EventEmitter } from "events";
import { prisma } from "../lib/db";

export const MAX_EXTENSION_HOURS = 72;
export const MAX_EXTENSIONS = 2;
const HOUR_MS = 3_600_000;

export class DisputeError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Emits `DeadlineExtended` with { disputeId, tradeId, extensionHours, evidenceDeadline }. */
export const disputeEvents = new EventEmitter();

// shortcut: SMS provider not wired in this repo; swap for the real gateway client.
export type SmsSender = (phoneNumber: string, message: string) => Promise<void>;
let sendSms: SmsSender = async () => undefined;
export const setSmsSender = (fn: SmsSender) => {
  sendSms = fn;
};

export async function extendEvidenceDeadline(
  disputeId: number,
  mediatorAddress: string,
  extensionHours: number,
) {
  if (!Number.isInteger(extensionHours) || extensionHours < 1 || extensionHours > MAX_EXTENSION_HOURS) {
    throw new DisputeError(400, `extensionHours must be an integer between 1 and ${MAX_EXTENSION_HOURS}`);
  }

  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: { trade: { include: { buyer: true, seller: true } } },
  });
  if (!dispute) throw new DisputeError(404, "Dispute not found");
  if (!dispute.mediatorAddress || dispute.mediatorAddress !== mediatorAddress.toLowerCase()) {
    throw new DisputeError(403, "Only the assigned mediator can extend the deadline");
  }
  if (dispute.status !== "OPEN" && dispute.status !== "UNDER_REVIEW") {
    throw new DisputeError(409, "Dispute is no longer active");
  }
  if (dispute.deadlineExtensions >= MAX_EXTENSIONS) {
    throw new DisputeError(409, `Deadline can be extended at most ${MAX_EXTENSIONS} times`);
  }

  const base = Math.max(dispute.evidenceDeadline?.getTime() ?? 0, Date.now());
  const evidenceDeadline = new Date(base + extensionHours * HOUR_MS);

  // Conditional update guards the extension cap against concurrent requests.
  const { count } = await prisma.dispute.updateMany({
    where: { id: disputeId, deadlineExtensions: dispute.deadlineExtensions },
    data: { evidenceDeadline, deadlineExtensions: { increment: 1 } },
  });
  if (count === 0) throw new DisputeError(409, "Dispute was modified concurrently, retry");

  disputeEvents.emit("DeadlineExtended", {
    disputeId,
    tradeId: dispute.tradeId,
    extensionHours,
    evidenceDeadline,
  });

  const message = `Evidence deadline for trade ${dispute.tradeId} extended by ${extensionHours}h. New deadline: ${evidenceDeadline.toISOString()}`;
  await Promise.allSettled(
    [dispute.trade.buyer, dispute.trade.seller]
      .filter((u) => u.phoneNumber)
      .map((u) => sendSms(u.phoneNumber as string, message)),
  );

  return {
    id: disputeId,
    evidenceDeadline,
    deadlineExtensions: dispute.deadlineExtensions + 1,
  };
}
