import { z } from "zod";

export const uploadEvidenceSchema = z.object({
  tradeId: z.string().uuid("Invalid trade ID format"),
});

export const streamEvidenceParamSchema = z.object({
  cid: z.string().min(1, "CID is required"),
});

export const disputeEvidenceQuerySchema = z.object({
  type: z.enum(["video", "manifest"]).optional(),
  page: z.preprocess((value: unknown) => value === undefined ? undefined : Number(value), z.number().int().min(1).default(1)),
  limit: z.preprocess((value: unknown) => value === undefined ? undefined : Number(value), z.number().int().min(1).max(100).default(20)),
});
