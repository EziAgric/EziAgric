import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

// CIDv0: base58btc multihash, always starts with "Qm" (46 chars total)
const CIDV0_REGEX = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
// CIDv1: base32 lowercase multibase, commonly "bafy..." (bafybe... for dag-pb)
const CIDV1_REGEX = /^b[a-z2-7]{20,}$/;

function isValidCid(cid: string): boolean {
  return CIDV0_REGEX.test(cid) || CIDV1_REGEX.test(cid);
}

const evidenceSchema = z.object({
  podId: z.string().min(1),
  cid: z
    .string()
    .min(1)
    .refine(isValidCid, {
      message:
        'Invalid IPFS CID. Expected CIDv0 (starting with "Qm") or CIDv1 (starting with "bafy").',
    }),
  description: z.string().optional(),
});

router.post(
  '/',
  authenticate,
  validate(evidenceSchema),
  async (req: Request, res: Response) => {
    const { podId, cid, description } = req.body as z.infer<typeof evidenceSchema>;

    if (!isValidCid(cid)) {
      return res.status(400).json({
        error:
          'Invalid IPFS CID. Expected CIDv0 (starting with "Qm") or CIDv1 (starting with "bafy").',
      });
    }

    const pod = await prisma.pod.findUnique({ where: { id: podId } });
    if (!pod) {
      return res.status(404).json({ error: 'Pod not found' });
    }

    const evidence = await prisma.evidence.create({
      data: {
        podId,
        cid,
        description: description ?? null,
      },
    });

    return res.status(201).json(evidence);
  }
);

export default router;
