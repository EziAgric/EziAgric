import { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../lib/db";
import { getAdminAllowlistLowercase } from "../lib/accessControl";
import { EncryptionService } from "./encryption.service";

export class TradeNoteAccessDeniedError extends Error {
  status = 403;
  constructor() {
    super("Access denied: you are not allowed to view notes for this trade");
    this.name = "TradeNoteAccessDeniedError";
  }
}

export class TradeNoteNotFoundError extends Error {
  status = 404;
  constructor() {
    super("Trade not found");
    this.name = "TradeNoteNotFoundError";
  }
}

export class TradeNoteValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "TradeNoteValidationError";
  }
}

type NotesDatabase = Pick<PrismaClient, "trade" | "tradeNote">;

export type TradeNoteVisibility = "parties" | "private";

export interface TradeNoteAttachmentInput {
  cid: string;
  mimeType: string;
}

export interface AddNoteOptions {
  attachments?: TradeNoteAttachmentInput[];
  visibility?: TradeNoteVisibility;
}

const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,})$/;
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);
const MENTION_PATTERN = /@(mediator|counterparty)\b/gi;

export class TradeNotesService {
  private readonly encryptionService = new EncryptionService();

  constructor(
    private readonly prisma: NotesDatabase = defaultPrisma,
  ) {}

  private validateAttachments(
    attachments: TradeNoteAttachmentInput[] | undefined,
  ): TradeNoteAttachmentInput[] {
    if (!attachments || attachments.length === 0) return [];
    return attachments.map((attachment) => {
      const cid = attachment.cid?.trim();
      if (!cid || !CID_PATTERN.test(cid)) {
        throw new TradeNoteValidationError(
          `Invalid attachment CID: ${attachment.cid}`,
        );
      }
      const mimeType = attachment.mimeType?.toLowerCase();
      if (!mimeType || !ALLOWED_ATTACHMENT_MIME_TYPES.has(mimeType)) {
        throw new TradeNoteValidationError(
          `Unsupported attachment type: ${attachment.mimeType}`,
        );
      }
      return { cid, mimeType };
    });
  }

  private parseMentions(content: string): Set<string> {
    const mentions = new Set<string>();
    let match: RegExpExecArray | null;
    MENTION_PATTERN.lastIndex = 0;
    while ((match = MENTION_PATTERN.exec(content)) !== null) {
      mentions.add(match[1].toLowerCase());
    }
    return mentions;
  }

  private async notifyMentions(
    tradeId: string,
    authorAddress: string,
    mentions: Set<string>,
    trade: { buyerAddress: string; sellerAddress: string },
    visibility: TradeNoteVisibility,
  ) {
    if (mentions.size === 0) return;
    if (visibility === "private") return;

    const recipients = new Set<string>();
    const buyer = trade.buyerAddress.toLowerCase();
    const seller = trade.sellerAddress.toLowerCase();

    if (mentions.has("counterparty")) {
      const counterparty = authorAddress === buyer ? seller : buyer;
      if (counterparty !== authorAddress) recipients.add(counterparty);
    }

    if (mentions.has("mediator")) {
      for (const admin of getAdminAllowlistLowercase()) {
        if (admin !== authorAddress) recipients.add(admin);
      }
    }

    for (const recipient of recipients) {
      await this.sendMentionNotification(tradeId, authorAddress, recipient);
    }
  }

  private async sendMentionNotification(
    tradeId: string,
    authorAddress: string,
    recipientAddress: string,
  ) {
    // Notification delivery is handled by the notifications module; this hook
    // keeps mention fan-out scoped to authorized recipients only.
    void tradeId;
    void authorAddress;
    void recipientAddress;
  }

  async addNote(
    tradeId: string,
    authorAddress: string,
    content: string,
    options: AddNoteOptions = {},
  ) {
    const trade = await this.prisma.trade.findUnique({ where: { tradeId } });
    if (!trade) throw new TradeNoteNotFoundError();

    const caller = authorAddress.toLowerCase();
    const isParty =
      trade.buyerAddress.toLowerCase() === caller ||
      trade.sellerAddress.toLowerCase() === caller;
    if (!isParty) throw new TradeNoteAccessDeniedError();

    const attachments = this.validateAttachments(options.attachments);
    const visibility: TradeNoteVisibility = options.visibility ?? "parties";

    const encrypted = this.encryptionService.encrypt(content, tradeId);

    const note = await this.prisma.tradeNote.create({
      data: {
        tradeId,
        authorAddress: caller,
        content: encrypted,
      },
    });

    await this.notifyMentions(
      tradeId,
      caller,
      this.parseMentions(content),
      trade,
      visibility,
    );

    return { ...note, attachments, visibility };
  }

  async listNotes(tradeId: string, callerAddress: string) {
    const trade = await this.prisma.trade.findUnique({ where: { tradeId } });
    if (!trade) throw new TradeNoteNotFoundError();

    const caller = callerAddress.toLowerCase();
    const isAdmin = getAdminAllowlistLowercase().has(caller);
    const isParty =
      trade.buyerAddress.toLowerCase() === caller ||
      trade.sellerAddress.toLowerCase() === caller;
    if (!isParty && !isAdmin) throw new TradeNoteAccessDeniedError();

    const notes = await this.prisma.tradeNote.findMany({
      where: { tradeId },
      orderBy: { createdAt: "desc" },
    });

    return notes.map((note) => ({
      id: note.id,
      tradeId: note.tradeId,
      authorAddress: note.authorAddress,
      content:
        note.authorAddress === caller || isAdmin
          ? this.encryptionService.decrypt(note.content, tradeId)
          : null,
      createdAt: note.createdAt,
    }));
  }
}
