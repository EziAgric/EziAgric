import { z } from "zod";
import { StrKey } from "@stellar/stellar-sdk";
import { moneyString } from "./money.schemas";

const stellarPublicKey = (fieldName: string) =>
  z.string().refine((v: string) => StrKey.isValidEd25519PublicKey(v), {
    message: `Invalid Stellar public key for ${fieldName}`,
  });

// Amount validation: a positive decimal string, normalised to 7 places and
// bounded by i128. The previous form accepted a JSON number and range-checked
// it with `parseFloat`, which is itself lossy above 2^53 stroops — the exact
// case that made DB rows and chain state disagree.
const amount = moneyString();

export const treasuryWithdrawSchema = z.object({
  destination: stellarPublicKey("destination"),
  amount,
  note: z.string().max(2000, "Note must be 2000 characters or fewer").optional(),
});
