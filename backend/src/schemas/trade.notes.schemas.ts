import { z } from "zod";

const CID_REGEX = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{50,}|bafk[a-z2-7]{50,})$/;

const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;

export const attachmentSchema = z.object({
  cid: z
    .string()
    .min(1, "Attachment CID is required")
    .regex(CID_REGEX, "Attachment CID must be a valid IPFS CID"),
  mimeType: z.enum(ALLOWED_ATTACHMENT_MIME_TYPES, {
    errorMap: () => ({
      message: "Attachment must be an image or PDF",
    }),
  }),
  name: z.string().max(255, "Attachment name must be 255 characters or fewer").optional(),
  size: z
    .number()
    .int("Attachment size must be an integer")
    .nonnegative("Attachment size must be non-negative")
    .max(25 * 1024 * 1024, "Attachment must be 25MB or smaller")
    .optional(),
});

export const addNoteSchema = z.object({
  content: z
    .string()
    .min(1, "Note content is required")
    .max(2000, "Note content must be 2000 characters or fewer"),
  attachments: z
    .array(attachmentSchema)
    .max(5, "A note can have at most 5 attachments")
    .optional(),
});

export const tradeIdParamSchema = z.object({
  id: z.string().min(1, "Trade ID is required"),
});

export type Attachment = z.infer<typeof attachmentSchema>;
export type AddNoteInput = z.infer<typeof addNoteSchema>;
